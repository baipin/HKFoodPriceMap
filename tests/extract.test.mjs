import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPrices, extractRestaurant, districtStats, mergePosts, MIN_PRICE, MAX_PRICE } from "../lib/extract.mjs";

test("extractPrices finds per-person prices and rejects noise", () => {
  assert.deepEqual(extractPrices("人均 $128 很好吃"), [128]);
  assert.deepEqual(extractPrices("人均HK$88，推荐"), [88]);
  assert.deepEqual(extractPrices("HK$160 per person"), [160]);
  assert.deepEqual(extractPrices("港币230/位"), [230]);
  assert.deepEqual(extractPrices("人均 5 元"), []); // below MIN_PRICE
  assert.deepEqual(extractPrices("人均 99999"), []); // too many digits
  assert.ok(MIN_PRICE < MAX_PRICE);
});

test("extractRestaurant prefers 【】 and the title head", () => {
  assert.equal(extractRestaurant("", "今日去咗【翠華餐廳】食早餐"), "翠華餐廳");
  assert.equal(extractRestaurant("大排档 | 中环美食", ""), "大排档");
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
