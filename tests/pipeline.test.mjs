import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCollection,
  parseJsonArray,
  buildMessages,
  collectForDistrict,
  pollinationsHeaders,
  POLLINATIONS_MODEL,
  MAX_RESULTS_PER_DISTRICT,
} from "../lib/llm.mjs";
import { runDistrict } from "../lib/pipeline.mjs";
import { buildPostFromExtraction, sourceLabel, districtStats } from "../lib/extract.mjs";
import { getDistrict } from "../lib/districts.mjs";

const wanChai = getDistrict("wan-chai");

test("the search model is the only data source and is requested with the chat endpoint", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url: String(url), body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), { status: 200 });
  };
  await collectForDistrict("灣仔", { fetchImpl });
  assert.equal(seen.url, "https://gen.pollinations.ai/v1/chat/completions");
  assert.equal(seen.body.model, POLLINATIONS_MODEL);
  assert.equal(POLLINATIONS_MODEL, "google/gemini-2.5-flash-lite:search");
  assert.equal(seen.body.stream, false);
  assert.match(seen.body.messages[1].content, /District: 灣仔/);
});

test("the API key is sent as a Bearer token only when it is set", () => {
  assert.equal(pollinationsHeaders({}).Authorization, undefined);
  assert.equal(pollinationsHeaders({ POLLINATIONS_API_KEY: "K" }).Authorization, "Bearer K");
});

test("parseJsonArray finds the array even when wrapped in text or a code fence", () => {
  assert.deepEqual(parseJsonArray('Here:\n```json\n[{"a":1}]\n```'), [{ a: 1 }]);
  assert.equal(parseJsonArray("no json"), null);
  assert.equal(parseJsonArray("[oops"), null);
});

test("validateCollection keeps only http(s) sources with an in-range price", () => {
  const out = validateCollection([
    { restaurant: "  海皇粥店\u0007 ", perPerson: 65, url: "https://www.hk01.com/a", title: "T" },
    { restaurant: "no url", perPerson: 65, url: "javascript:alert(1)" },
    { restaurant: "too dear", perPerson: 9999, url: "https://www.hk01.com/b" },
    { restaurant: "cheap", perPerson: 5, url: "https://www.hk01.com/c" },
    { restaurant: "text price", perPerson: "abc", url: "https://www.hk01.com/d" },
    { restaurant: "dup", perPerson: 70, url: "https://www.hk01.com/a" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].restaurant, "海皇粥店");
  assert.equal(out[0].price, 65);
  assert.equal(out[0].item.link, "https://www.hk01.com/a");
  assert.equal(out[0].item.source, "HK01");
});

test("validateCollection caps the number of results per district", () => {
  const many = Array.from({ length: MAX_RESULTS_PER_DISTRICT + 5 }, (_, i) => ({
    restaurant: "R" + i, perPerson: 50, url: `https://www.hk01.com/${i}`,
  }));
  assert.equal(validateCollection(many).length, MAX_RESULTS_PER_DISTRICT);
});

test("collectForDistrict returns only validated entries from the model's reply", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    choices: [{ message: { content: '[{"restaurant":"茶記","perPerson":70,"url":"https://www.stheadline.com/x","title":"星島"}]' } }],
  }), { status: 200 });
  const out = await collectForDistrict("灣仔", { fetchImpl });
  assert.equal(out.length, 1);
  assert.equal(out[0].item.source, "星島");
});

test("a non-OK answer from Pollinations throws", async () => {
  const fetchImpl = async () => new Response("no", { status: 503 });
  await assert.rejects(collectForDistrict("灣仔", { fetchImpl }), /HTTP 503/);
});

test("buildMessages asks for JSON only and names the fields", () => {
  const msgs = buildMessages("灣仔");
  assert.match(msgs[0].content, /JSON array only/);
  assert.match(msgs[0].content, /"url"/);
});

test("runDistrict turns collected entries into posts", async () => {
  const collect = async () => [
    {
      item: { title: "T", link: "https://www.hk01.com/a", snippet: "海皇粥店：人均 HK$65", source: "HK01" },
      restaurant: "海皇粥店",
      price: 65,
    },
  ];
  const res = await runDistrict(wanChai, { collect, fetchedAt: "2026-10-26T00:00:00.000Z" });
  assert.equal(res.posts.length, 1);
  assert.equal(res.posts[0].perPerson, 65);
  assert.equal(res.posts[0].restaurant, "海皇粥店");
  assert.deepEqual(res.errors, []);
});

test("runDistrict reports a failed call and returns no posts", async () => {
  const collect = async () => { throw new Error("boom"); };
  const res = await runDistrict(wanChai, { collect, fetchedAt: "t" });
  assert.equal(res.posts.length, 0);
  assert.equal(res.errors.length, 1);
});

test("buildPostFromExtraction and districtStats", () => {
  const post = buildPostFromExtraction({
    item: { title: "【海皇粥店】", link: "https://www.hk01.com/a", snippet: "x", source: "HK01" },
    restaurant: "",
    price: 65,
    fetchedAt: "t",
  });
  assert.equal(post.restaurant, "海皇粥店");
  assert.equal(districtStats([post, { perPerson: 85 }]).avgPerPerson, 75);
  assert.equal(sourceLabel("https://www.hk01.com/a"), "HK01");
  assert.equal(sourceLabel("https://blog.example.org/p"), "blog.example.org");
});
