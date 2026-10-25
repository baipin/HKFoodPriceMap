import { test } from "node:test";
import assert from "node:assert/strict";
import { crawlDistrict, queriesFor, CREDITS_PER_DISTRICT } from "../lib/crawl.mjs";
import { Meter } from "../lib/quota.mjs";
import { getDistrict } from "../lib/districts.mjs";
import { emptyDb, applyCrawlResult } from "../lib/store.mjs";
import handler from "../api/crawl.js";

const cfg = { apiKey: "k", serpZone: "s" };

// Fake Bright Data SERP: every query returns one priced Xiaohongshu result,
// one priced Facebook result and one irrelevant domain.
function fakeFetch(calls) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const organic = [
      { title: "【測試餐廳】- 小红书", link: "https://www.xiaohongshu.com/explore/1", description: "人均 $90 好食" },
      { title: "FB 食評 - Facebook", link: "https://www.facebook.com/p/9", description: "人均 HK$120" },
      { title: "spam", link: "https://example.com/x", description: "人均 $10" },
    ];
    return new Response(JSON.stringify({ organic }), { status: 200 });
  };
}

test("queries are SERP-only, no page fetch, 4 credits per district", () => {
  assert.equal(CREDITS_PER_DISTRICT, 4);
  const qs = queriesFor(getDistrict("wan-chai"));
  assert.equal(qs.length, 4);
  assert.ok(qs.some((q) => q.startsWith("site:facebook.com")));
  assert.ok(qs.some((q) => q.startsWith("site:xiaohongshu.com")));
});

test("crawlDistrict builds posts from search snippets and spends only SERP credits", async () => {
  const calls = [];
  const meter = new Meter(50);
  const res = await crawlDistrict(getDistrict("wan-chai"), {
    cfg,
    meter,
    fetchImpl: fakeFetch(calls),
    now: new Date("2026-10-26T00:00:00Z"),
  });
  assert.ok(calls.every((c) => c.zone === "s"), "only the SERP zone is used");
  assert.equal(res.creditsUsed, 4);
  // Same two URLs come back for every query; they are de-duplicated.
  assert.equal(res.posts.length, 2);
  assert.ok(res.posts.some((p) => p.source === "小红书" && p.restaurant === "測試餐廳"));
  assert.ok(res.posts.some((p) => p.source === "Facebook" && p.perPerson === 120));
});

test("crawlDistrict stops cleanly when the budget runs out", async () => {
  const calls = [];
  const meter = new Meter(2); // only two of the four queries fit
  const res = await crawlDistrict(getDistrict("kwun-tong"), {
    cfg,
    meter,
    fetchImpl: fakeFetch(calls),
  });
  assert.equal(res.quotaHit, true);
  assert.equal(calls.length, 2);
  assert.ok(meter.used <= 2);
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
