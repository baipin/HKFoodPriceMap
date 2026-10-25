import { test } from "node:test";
import assert from "node:assert/strict";
import { crawlDistrict, MAX_PAGES_PER_DISTRICT } from "../lib/crawl.mjs";
import { Meter } from "../lib/quota.mjs";
import { getDistrict } from "../lib/districts.mjs";
import { emptyDb, applyCrawlResult } from "../lib/store.mjs";
import handler from "../api/crawl.js";

const cfg = { apiKey: "k", unlockerZone: "u", serpZone: "s" };

// Fake Bright Data: SERP returns 12 social links, unlocker returns a priced post.
function fakeFetch(calls) {
  return async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const body = JSON.parse(init.body);
    if (body.zone === "s") {
      const organic = [];
      for (let i = 0; i < 6; i++) {
        organic.push({ title: "t" + i, link: `https://www.xiaohongshu.com/explore/${body.url.length}-${i}`, description: "" });
      }
      organic.push({ title: "spam", link: "https://example.com/x", description: "" });
      return new Response(JSON.stringify({ organic }), { status: 200 });
    }
    return new Response(
      `<title>【測試餐廳】</title><body>人均 $90 好食</body>`,
      { status: 200 }
    );
  };
}

test("crawlDistrict spends credits only through the meter and filters domains", async () => {
  const calls = [];
  const meter = new Meter(50);
  const res = await crawlDistrict(getDistrict("wan-chai"), {
    cfg,
    meter,
    fetchImpl: fakeFetch(calls),
    now: new Date("2026-10-26T00:00:00Z"),
  });
  const serp = calls.filter((c) => c.body.zone === "s");
  const unlock = calls.filter((c) => c.body.zone === "u");
  assert.equal(serp.length, 2, "two search queries");
  assert.ok(unlock.length <= MAX_PAGES_PER_DISTRICT, "page cap respected");
  assert.equal(res.creditsUsed, serp.length + unlock.length);
  assert.ok(res.posts.length > 0);
  assert.equal(res.posts[0].restaurant, "測試餐廳");
  assert.ok(res.posts.every((p) => p.source === "小红书"));
});

test("crawlDistrict stops cleanly when the budget runs out", async () => {
  const calls = [];
  const meter = new Meter(1); // only the first SERP query fits
  const res = await crawlDistrict(getDistrict("kwun-tong"), {
    cfg,
    meter,
    fetchImpl: fakeFetch(calls),
  });
  assert.equal(res.quotaHit, true);
  assert.equal(calls.filter((c) => c.body.zone === "u").length, 0);
  assert.ok(meter.used <= 1);
});

test("applyCrawlResult updates stats and keeps other districts intact", () => {
  const db = emptyDb(new Date("2026-10-01T00:00:00Z"));
  const post = (url, pp) => ({ url, perPerson: pp, fetchedAt: "2026-10-26T00:00:00Z", restaurant: "A" });
  const next = applyCrawlResult(
    db,
    "central-western",
    { posts: [post("u1", 60), post("u2", 120)] },
    new Date("2026-10-26T00:00:00Z")
  );
  assert.equal(next.status, "ok");
  assert.equal(next.districts["central-western"].avgPerPerson, 90);
  assert.equal(next.districts["central-western"].postCount, 2);
  assert.equal(next.districts["wan-chai"].avgPerPerson, null);
  assert.equal(db.districts["central-western"].postCount, 0, "input not mutated");
});

function mockRes() {
  const r = { statusCode: 200, body: null, headers: {} };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}

test("API rejects requests without the CRON_SECRET", async () => {
  process.env.CRON_SECRET = "s3cret";
  const res = mockRes();
  await handler({ method: "GET", headers: {}, query: { district: "wan-chai" } }, res);
  assert.equal(res.statusCode, 401);
  const res2 = mockRes();
  await handler({ method: "GET", headers: { authorization: "Bearer wrong!!" }, query: { district: "wan-chai" } }, res2);
  assert.equal(res2.statusCode, 401);
});

test("API validates district and budget", async () => {
  process.env.CRON_SECRET = "s3cret";
  const auth = { authorization: "Bearer s3cret" };
  const bad = mockRes();
  await handler({ method: "GET", headers: auth, query: { district: "nowhere" } }, bad);
  assert.equal(bad.statusCode, 400);
  const zero = mockRes();
  await handler({ method: "GET", headers: auth, query: { district: "wan-chai", budget: "0" } }, zero);
  assert.equal(zero.statusCode, 400);
});
