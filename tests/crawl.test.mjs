import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSeeds, normalizeUrl, districtForRecord, groupRecords } from "../lib/crawl.mjs";
import { scrapeUrl, parseRecords } from "../lib/brightdata.mjs";
import handler from "../api/crawl.js";

const cfg = { apiKey: "k", dataset: "gd_test" };

function fakeFetch(calls, { status = 200, body = "[]" } = {}) {
  return async (url, init) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body) : null });
    return new Response(body, { status });
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

test("districtForRecord matches on the input/url fields", () => {
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

test("parseRecords accepts a JSON array and NDJSON", () => {
  assert.deepEqual(parseRecords('[{"a":1},{"a":2}]'), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(parseRecords('{"a":1}\n{"a":2}\n'), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(parseRecords(""), []);
});

test("scrapeUrl posts one URL to the synchronous /scrape endpoint", async () => {
  const calls = [];
  const res = await scrapeUrl(cfg, "https://www.facebook.com/a/posts/1", {
    fetchImpl: fakeFetch(calls, { body: '[{"url":"https://www.facebook.com/a/posts/1","content":"人均 $80"}]' }),
  });
  assert.equal(res.status, "ok");
  assert.equal(res.records.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].url, /datasets\/v3\/scrape\?dataset_id=gd_test&format=json$/);
  assert.deepEqual(calls[0].body, [{ url: "https://www.facebook.com/a/posts/1" }]);
  assert.doesNotMatch(calls[0].url, /trigger|snapshot|progress/);
});

test("scrapeUrl reports 202 as timeout (no snapshot is fetched)", async () => {
  const calls = [];
  const res = await scrapeUrl(cfg, "https://www.facebook.com/a/posts/1", {
    fetchImpl: fakeFetch(calls, { status: 202, body: '{"snapshot_id":"s_1"}' }),
  });
  assert.equal(res.status, "timeout");
  assert.equal(calls.length, 1, "no follow-up request");
});

test("scrapeUrl throws on HTTP errors", async () => {
  await assert.rejects(
    scrapeUrl(cfg, "https://www.facebook.com/a", { fetchImpl: fakeFetch([], { status: 500 }) }),
    /HTTP 500/
  );
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
  await handler({ method: "POST", headers: {}, body: { url: "https://www.facebook.com/a" } }, res);
  assert.equal(res.statusCode, 401);
  const res2 = mockRes();
  await handler({ method: "POST", headers: { authorization: "Bearer wrong!!" }, body: { url: "https://www.facebook.com/a" } }, res2);
  assert.equal(res2.statusCode, 401);
});

test("API validates method and body", async () => {
  process.env.CRON_SECRET = "s3cret";
  process.env.BRIGHTDATA_API_KEY = "k";
  const auth = { authorization: "Bearer s3cret" };
  const get = mockRes();
  await handler({ method: "GET", headers: auth, query: {} }, get);
  assert.equal(get.statusCode, 405);
  const badBody = mockRes();
  await handler({ method: "POST", headers: auth, body: { url: 42 } }, badBody);
  assert.equal(badBody.statusCode, 400);
  const notFb = mockRes();
  await handler({ method: "POST", headers: auth, body: { url: "https://example.com/x" } }, notFb);
  assert.equal(notFb.statusCode, 400);
});
