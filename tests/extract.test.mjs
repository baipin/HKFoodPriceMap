import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sourceFor,
  extractPrices,
  extractRestaurant,
  buildPostFromSearch,
  districtStats,
  mergePosts,
} from "../lib/extract.mjs";

test("sourceFor only accepts Facebook and Xiaohongshu hosts", () => {
  assert.equal(sourceFor("https://www.facebook.com/x/posts/1"), "Facebook");
  assert.equal(sourceFor("https://www.xiaohongshu.com/explore/abc"), "小红书");
  assert.equal(sourceFor("https://xhslink.com/abc"), "小红书");
  assert.equal(sourceFor("https://evil.example.com/facebook.com"), null);
  assert.equal(sourceFor("not a url"), null);
});

test("extractPrices finds per-person prices and rejects noise", () => {
  assert.deepEqual(extractPrices("人均 $128 很好吃"), [128]);
  assert.deepEqual(extractPrices("人均HK$88，推荐"), [88]);
  assert.deepEqual(extractPrices("HK$160 per person"), [160]);
  assert.deepEqual(extractPrices("港币230/位"), [230]);
  assert.deepEqual(extractPrices("人均 5 元"), []); // below MIN_PRICE
  assert.deepEqual(extractPrices("人均 99999"), []); // too many digits
});

test("extractRestaurant prefers 【】 and title head", () => {
  assert.equal(extractRestaurant("", "今日去咗【翠華餐廳】食早餐"), "翠華餐廳");
  assert.equal(extractRestaurant("大排档 | 中环美食", ""), "大排档");
});

test("buildPostFromSearch needs an allowed source and a price", () => {
  assert.equal(
    buildPostFromSearch({ url: "https://example.com/x", title: "人均 $100", snippet: "", fetchedAt: "t" }),
    null
  );
  assert.equal(
    buildPostFromSearch({ url: "https://www.facebook.com/p/1", title: "login", snippet: "", fetchedAt: "t" }),
    null
  );
});

test("buildPostFromSearch produces a structured record", () => {
  const post = buildPostFromSearch({
    url: "https://www.xiaohongshu.com/explore/1",
    title: "【海皇粥店】中環 - 小红书",
    snippet: "地址：中环 人均 $65 好正",
    fetchedAt: "2026-10-26T00:00:00.000Z",
  });
  assert.equal(post.source, "小红书");
  assert.equal(post.restaurant, "海皇粥店");
  assert.deepEqual(post.prices, [65]);
  assert.equal(post.perPerson, 65);
});

test("districtStats uses means and medians, ignoring null prices", () => {
  const s = districtStats([
    { perPerson: 50 },
    { perPerson: 100 },
    { perPerson: 150 },
    { perPerson: null },
  ]);
  assert.equal(s.avgPerPerson, 100);
  assert.equal(s.medianPerPerson, 100);
  assert.equal(s.priceSamples, 3);
  assert.equal(s.postCount, 4);
  assert.equal(districtStats([]).avgPerPerson, null);
});

test("mergePosts de-duplicates by URL, newest first, capped", () => {
  const existing = [{ url: "a", fetchedAt: "2026-01-01" }];
  const incoming = [
    { url: "a", fetchedAt: "2026-02-01" },
    { url: "b", fetchedAt: "2026-03-01" },
  ];
  const out = mergePosts(existing, incoming, 10);
  assert.deepEqual(out.map((p) => p.url), ["b", "a"]);
  assert.equal(out[1].fetchedAt, "2026-02-01", "incoming wins on duplicate");
  assert.equal(mergePosts(existing, incoming, 1).length, 1);
});
