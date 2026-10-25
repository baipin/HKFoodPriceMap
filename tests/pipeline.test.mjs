import { test } from "node:test";
import assert from "node:assert/strict";
import { queriesFor, QUERIES_PER_DISTRICT, sourceLabel, parseSerpResponse, serpSearch } from "../lib/search.mjs";
import { parseJsonArray, validateExtraction, buildMessages, extractForDistrict } from "../lib/llm.mjs";
import { runDistrict, MAX_ITEMS_PER_DISTRICT } from "../lib/pipeline.mjs";
import { buildPostFromExtraction, extractPrices, extractRestaurant, districtStats } from "../lib/extract.mjs";
import { getDistrict } from "../lib/districts.mjs";
import handler from "../api/search.js";

const wanChai = getDistrict("wan-chai");

test("three queries per district, in Chinese", () => {
  const qs = queriesFor(wanChai);
  assert.equal(qs.length, 3);
  assert.equal(QUERIES_PER_DISTRICT, 3);
  assert.ok(qs.every((q) => q.includes(wanChai.zh)), "every query names the district");
});

test("sourceLabel labels known sites, including social media", () => {
  assert.equal(sourceLabel("https://www.facebook.com/x/posts/1"), "Facebook");
  assert.equal(sourceLabel("https://www.xiaohongshu.com/explore/1"), "小红书");
  assert.equal(sourceLabel("https://www.hk01.com/a"), "HK01");
  assert.equal(sourceLabel("https://blog.example.org/p"), "blog.example.org");
});

test("parseSerpResponse keeps only http(s) organic results", () => {
  const items = parseSerpResponse({
    organic: [
      { title: "A", link: "https://www.hk01.com/a", description: "人均 $60" },
      { title: "bad", link: "javascript:alert(1)", description: "" },
      { link: "https://example.com", snippet: "x" },
    ],
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].source, "HK01");
  assert.equal(items[0].snippet, "人均 $60");
  assert.equal(items[1].title, "");
});

test("serpSearch posts to the Bright Data request endpoint with the zone and a Google URL", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url: String(url), body: JSON.parse(init.body), auth: init.headers.Authorization };
    return new Response(JSON.stringify({ organic: [{ title: "t", link: "https://www.hk01.com/a", description: "s" }] }), { status: 200 });
  };
  const items = await serpSearch({ apiKey: "K", serpZone: "Z" }, "灣仔 茶餐廳", { fetchImpl });
  assert.equal(seen.url, "https://api.brightdata.com/request");
  assert.equal(seen.auth, "Bearer K");
  assert.equal(seen.body.zone, "Z");
  assert.match(seen.body.url, /google\.com\/search/);
  assert.match(seen.body.url, /brd_json=1/);
  assert.equal(items.length, 1);
});

test("parseJsonArray finds the array even when wrapped in text or a code fence", () => {
  assert.deepEqual(parseJsonArray('Here you go:\n```json\n[{"i":0}]\n```'), [{ i: 0 }]);
  assert.equal(parseJsonArray("no json here"), null);
  assert.equal(parseJsonArray("[oops"), null);
});

test("validateExtraction rejects bad indexes, out-of-range prices and out-of-district results", () => {
  const items = [
    { title: "a", link: "https://www.hk01.com/a", snippet: "", source: "HK01" },
    { title: "b", link: "https://www.hk01.com/b", snippet: "", source: "HK01" },
  ];
  const out = validateExtraction(
    [
      { i: 0, inDistrict: true, restaurant: "  海皇粥店\u0007 ", perPerson: 65 },
      { i: 5, inDistrict: true, restaurant: "x", perPerson: 65 }, // index out of range
      { i: 1, inDistrict: true, restaurant: "y", perPerson: 9999 }, // price too high
      { i: 1, inDistrict: false, restaurant: "z", perPerson: 80 }, // outside district
      { i: 1, inDistrict: true, restaurant: "w", perPerson: "abc" },
    ],
    items
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].price, 65);
  assert.equal(out[0].restaurant, "海皇粥店");
  assert.equal(out[0].item.link, "https://www.hk01.com/a", "URL comes from our results, not the model");
});

test("buildMessages lists results by index and names the district", () => {
  const msgs = buildMessages("灣仔", [{ title: "T", snippet: "S", source: "HK01" }]);
  assert.match(msgs[1].content, /District: 灣仔/);
  assert.match(msgs[1].content, /\[0\] title: T/);
});

test("extractForDistrict calls Pollinations and validates the reply", async () => {
  const items = [{ title: "T", link: "https://www.hk01.com/a", snippet: "人均 $70", source: "HK01" }];
  let body;
  const fetchImpl = async (url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: '[{"i":0,"inDistrict":true,"restaurant":"茶記","perPerson":70}]' } }],
    }), { status: 200 });
  };
  const out = await extractForDistrict("灣仔", items, { fetchImpl });
  assert.equal(body.temperature, 0);
  assert.equal(out.length, 1);
  assert.equal(out[0].price, 70);
});

test("runDistrict dedupes results across queries, caps items, and builds posts", async () => {
  const calls = [];
  const search = async (q) => {
    calls.push(q);
    return [
      { title: "T1", link: "https://www.hk01.com/shared", snippet: "人均 $70", source: "HK01" },
      { title: `T-${q}`, link: `https://x.example/${q}`, snippet: "", source: "x" },
    ];
  };
  const extract = async (zh, items) => {
    assert.ok(items.length <= MAX_ITEMS_PER_DISTRICT);
    return [{ item: items[0], restaurant: "茶記", price: 70 }];
  };
  const res = await runDistrict(wanChai, { search, extract, fetchedAt: "2026-10-26T00:00:00.000Z" });
  assert.equal(calls.length, 3);
  assert.equal(res.items, 4, "3 queries, 1 shared link + 3 unique = 4 items");
  assert.equal(res.posts.length, 1);
  assert.equal(res.posts[0].perPerson, 70);
  assert.equal(res.posts[0].restaurant, "茶記");
});

test("runDistrict keeps going when a search fails and reports the error", async () => {
  const search = async (q) => {
    if (q.includes("茶餐廳")) throw new Error("boom");
    return [{ title: "T", link: `https://x.example/${q.length}`, snippet: "", source: "x" }];
  };
  const res = await runDistrict(wanChai, { search, extract: async () => [], fetchedAt: "t" });
  assert.equal(res.errors.length, 1);
  assert.equal(res.posts.length, 0);
});

test("buildPostFromExtraction and districtStats", () => {
  const post = buildPostFromExtraction({
    item: { title: "【海皇粥店】", link: "https://www.hk01.com/a", snippet: "人均 $65", source: "HK01" },
    restaurant: "",
    price: 65,
    fetchedAt: "t",
  });
  assert.equal(post.restaurant, "海皇粥店");
  assert.equal(post.source, "HK01");
  assert.equal(districtStats([post, { perPerson: 85 }]).avgPerPerson, 75);
  assert.deepEqual(extractPrices("人均 $128"), [128]);
  assert.equal(extractRestaurant("大排档 | 中环美食", ""), "大排档");
});

function mockRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = () => {};
  return r;
}

test("search proxy requires CRON_SECRET and a query", async () => {
  process.env.CRON_SECRET = "s3cret";
  const noAuth = mockRes();
  await handler({ method: "GET", headers: {}, query: { q: "x" } }, noAuth);
  assert.equal(noAuth.statusCode, 401);
  const auth = { authorization: "Bearer s3cret" };
  const noQ = mockRes();
  await handler({ method: "GET", headers: auth, query: {} }, noQ);
  assert.equal(noQ.statusCode, 400);
  const post = mockRes();
  await handler({ method: "POST", headers: auth, query: { q: "x" } }, post);
  assert.equal(post.statusCode, 405);
});
