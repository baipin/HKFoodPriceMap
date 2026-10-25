import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSeeds, normalizeUrl, districtForRecord, groupRecords } from "../lib/crawl.mjs";
import { triggerCollection, snapshotProgress, snapshotRecords } from "../lib/brightdata.mjs";
import handler from "../api/crawl.js";

const cfg = { apiKey: "k", dataset: "gd_test" };

function jsonFetch(calls, payload, status = 200) {
  return async (url, init) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
  };
}

test("normalizeUrl unifies host, drops query/trailing slash", () => {
  assert.equal(normalizeUrl("https://m.facebook.com/Foo/?ref=x"), "https://www.facebook.com/Foo");
  assert.equal(normalizeUrl("https://facebook.com/Foo/posts/1#c"), "https://www.facebook.com/Foo/posts/1");
  assert.equal(normalizeUrl("nonsense"), null);
});

test("parseSeeds maps URLs to districts, skips comments and non-Facebook URLs", () => {
  const { urlToDistrict, urls } = parseSeeds({
    _comment: "ignored",
    "wan-chai": ["https://www.facebook.com/shopA/posts/1", "https://example.com/x"],
    "eastern": ["https://facebook.com/shopA/posts/1/"],
  });
  assert.equal(urls.length, 1, "duplicate and non-Facebook entries removed");
  assert.equal(urlToDistrict.get("https://www.facebook.com/shopA/posts/1"), "wan-chai");
  assert.throws(() => parseSeeds({ "nowhere": [] }), /unknown district/);
  assert.throws(() => parseSeeds({ "wan-chai": "not-an-array" }), /must be an array/);
});

test("districtForRecord matches on the input/url fields Bright Data returns", () => {
  const map = new Map([["https://www.facebook.com/shopA", "wan-chai"]]);
  assert.equal(districtForRecord({ input_url: "https://facebook.com/shopA/" }, map), "wan-chai");
  assert.equal(districtForRecord({ url: "https://www.facebook.com/shopA" }, map), "wan-chai");
  assert.equal(districtForRecord({ url: "https://www.facebook.com/other" }, map), null);
});

test("groupRecords builds posts per district and drops unmatched or price-less records", () => {
  const { urlToDistrict } = parseSeeds({ "wan-chai": ["https://www.facebook.com/shopA"] });
  const records = [
    { url: "https://www.facebook.com/shopA/posts/1", input_url: "https://www.facebook.com/shopA", content: "今日食咗海皇粥，人均 $65 好正" },
    { url: "https://www.facebook.com/shopA/posts/2", input_url: "https://www.facebook.com/shopA", content: "no price here" },
    { url: "https://www.facebook.com/stranger/posts/3", content: "人均 $90" },
  ];
  const grouped = groupRecords(records, urlToDistrict, "2026-10-26T00:00:00.000Z");
  assert.equal(grouped.get("wan-chai").length, 1);
  assert.equal(grouped.get("wan-chai")[0].perPerson, 65);
  assert.equal(grouped.get("wan-chai")[0].source, "Facebook");
  assert.equal(grouped.size, 1);
});

test("trigger sends one {url} per input to the posts dataset and returns snapshot_id", async () => {
  const calls = [];
  const id = await triggerCollection(cfg, ["https://www.facebook.com/a", "https://www.facebook.com/b"], {
    fetchImpl: jsonFetch(calls, { snapshot_id: "s_123" }),
  });
  assert.equal(id, "s_123");
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].url, /datasets\/v3\/trigger\?dataset_id=gd_test/);
  assert.deepEqual(calls[0].body, [{ url: "https://www.facebook.com/a" }, { url: "https://www.facebook.com/b" }]);
});

test("progress and snapshot calls use the snapshot id", async () => {
  const calls = [];
  assert.equal(await snapshotProgress(cfg, "s_123", { fetchImpl: jsonFetch(calls, { status: "ready" }) }), "ready");
  assert.match(calls[0].url, /progress\/s_123$/);
  const recs = await snapshotRecords(cfg, "s_123", { fetchImpl: jsonFetch(calls, [{ url: "x" }]) });
  assert.equal(recs.length, 1);
  assert.match(calls[1].url, /snapshot\/s_123\?format=json$/);
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
  process.env.BRIGHTDATA_API_KEY = "k";
  const res = mockRes();
  await handler({ method: "GET", headers: {}, query: { action: "progress", snapshot: "abcd" } }, res);
  assert.equal(res.statusCode, 401);
  const res2 = mockRes();
  await handler({ method: "GET", headers: { authorization: "Bearer wrong!!" }, query: { action: "progress", snapshot: "abcd" } }, res2);
  assert.equal(res2.statusCode, 401);
});

test("API validates action, method, body and snapshot id", async () => {
  process.env.CRON_SECRET = "s3cret";
  process.env.BRIGHTDATA_API_KEY = "k";
  const auth = { authorization: "Bearer s3cret" };
  const unknown = mockRes();
  await handler({ method: "GET", headers: auth, query: { action: "nope" } }, unknown);
  assert.equal(unknown.statusCode, 400);
  const badBody = mockRes();
  await handler({ method: "POST", headers: auth, query: { action: "trigger" }, body: { urls: "x" } }, badBody);
  assert.equal(badBody.statusCode, 400);
  const notFb = mockRes();
  await handler({ method: "POST", headers: auth, query: { action: "trigger" }, body: { urls: ["https://example.com"] } }, notFb);
  assert.equal(notFb.statusCode, 400);
  const badId = mockRes();
  await handler({ method: "GET", headers: auth, query: { action: "progress", snapshot: "../../etc" } }, badId);
  assert.equal(badId.statusCode, 400);
});
