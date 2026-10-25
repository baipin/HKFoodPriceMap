import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseModelReply,
  parsePrice,
  validateCollection,
  buildMessages,
  collectForDistrict,
  pollinationsHeaders,
  POLLINATIONS_MODEL,
  MAX_RESULTS_PER_DISTRICT,
} from "../lib/llm.mjs";
import { runDistrict } from "../lib/pipeline.mjs";
import { buildPostFromExtraction, sourceLabel, districtStats, mergePosts } from "../lib/extract.mjs";
import { getDistrict } from "../lib/districts.mjs";

const wanChai = getDistrict("wan-chai");
const reply = (content, status = 200) => async () =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });

test("Pollinations GPT-5.4 Nano is the only data source, sent to the chat endpoint with a JSON response format", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url: String(url), body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"restaurants":[]}' } }] }), { status: 200 });
  };
  await collectForDistrict("灣仔", { fetchImpl });
  assert.equal(seen.url, "https://gen.pollinations.ai/v1/chat/completions");
  assert.equal(seen.body.model, POLLINATIONS_MODEL);
  assert.equal(POLLINATIONS_MODEL, "openai/gpt-5.4-nano");
  assert.deepEqual(seen.body.response_format, { type: "json_object" });
  assert.match(seen.body.messages[1].content, /District: 灣仔/);
});

test("a 400 on response_format is retried once without it", async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) return new Response("bad format", { status: 400 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"restaurants":[]}' } }] }), { status: 200 });
  };
  const { diagnostics } = await collectForDistrict("灣仔", { fetchImpl });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].response_format, undefined);
  assert.equal(diagnostics.retried, true);
});

test("the API key is sent as a Bearer token only when it is set", () => {
  assert.equal(pollinationsHeaders({}).Authorization, undefined);
  assert.equal(pollinationsHeaders({ POLLINATIONS_API_KEY: "K" }).Authorization, "Bearer K");
});

test("parseModelReply reads an object, a bare array, a fenced block, or text around JSON", () => {
  assert.deepEqual(parseModelReply('{"restaurants":[{"restaurant":"A"}]}'), [{ restaurant: "A" }]);
  assert.deepEqual(parseModelReply('[{"restaurant":"B"}]'), [{ restaurant: "B" }]);
  assert.deepEqual(parseModelReply('Here:\n```json\n{"results":[{"restaurant":"C"}]}\n```'), [{ restaurant: "C" }]);
  assert.deepEqual(parseModelReply('Sure. {"restaurants":[{"restaurant":"D"}]} Done.'), [{ restaurant: "D" }]);
  assert.equal(parseModelReply("I could not find anything."), null);
});

test("parsePrice accepts numbers, currency text and ranges", () => {
  assert.equal(parsePrice(65), 65);
  assert.equal(parsePrice("65"), 65);
  assert.equal(parsePrice("HK$65"), 65);
  assert.equal(parsePrice("約 $1,200"), 1200);
  assert.equal(parsePrice("60-80元"), 70);
  assert.ok(Number.isNaN(parsePrice("免費")));
});

test("validateCollection accepts text prices and keeps entries without a URL", () => {
  const { accepted, dropped } = validateCollection([
    { restaurant: "海皇粥店", perPerson: "HK$65", source_url: "https://www.hk01.com/a", source_title: "T", category: "其他", evidence: "人均 $65" },
    { restaurant: "無網址店", perPerson: 80 },
    { restaurant: "", perPerson: 70 },
    { restaurant: "太貴", perPerson: 9999 },
    { restaurant: "沒有價錢" },
    { restaurant: "壞網址", perPerson: 50, source_url: "javascript:alert(1)" },
  ]);
  assert.equal(accepted.length, 3);
  assert.equal(accepted[0].restaurant, "海皇粥店");
  assert.equal(accepted[0].price, 65);
  assert.equal(accepted[0].item.source, "HK01");
  assert.equal(accepted[1].item.link, "");
  assert.equal(accepted[1].item.source, "AI 知識（未核實）");
  assert.equal(accepted[2].item.link, "");
  assert.equal(dropped.noName, 1);
  assert.equal(dropped.badPrice, 1);
  assert.equal(dropped.noPrice, 1);
});

test("validateCollection removes duplicate URLs and caps the list", () => {
  const dup = validateCollection([
    { restaurant: "A", perPerson: 50, source_url: "https://www.hk01.com/x" },
    { restaurant: "B", perPerson: 60, source_url: "https://www.hk01.com/x" },
  ]);
  assert.equal(dup.accepted.length, 1);
  assert.equal(dup.dropped.duplicate, 1);
  const many = Array.from({ length: MAX_RESULTS_PER_DISTRICT + 5 }, (_, i) => ({ restaurant: "R" + i, perPerson: 50 }));
  assert.equal(validateCollection(many).accepted.length, MAX_RESULTS_PER_DISTRICT);
});

test("collectForDistrict returns diagnostics for an unreadable reply", async () => {
  const { collected, diagnostics } = await collectForDistrict("灣仔", { fetchImpl: reply("sorry, no idea") });
  assert.deepEqual(collected, []);
  assert.equal(diagnostics.parsed, false);
  assert.match(diagnostics.sample, /sorry/);
});

test("collectForDistrict returns accepted entries and drop counts", async () => {
  const content = '{"restaurants":[{"restaurant":"茶記","perPerson":"70","source_url":"https://www.stheadline.com/x","source_title":"星島","evidence":"人均70"}]}';
  const { collected, diagnostics } = await collectForDistrict("灣仔", { fetchImpl: reply(content) });
  assert.equal(collected.length, 1);
  assert.equal(collected[0].item.source, "星島");
  assert.equal(diagnostics.entries, 1);
  assert.equal(diagnostics.accepted, 1);
});

test("a non-OK answer from Pollinations throws", async () => {
  await assert.rejects(collectForDistrict("灣仔", { fetchImpl: reply("no", 503) }), /HTTP 503/);
});

test("the prompt states the schema, the rules and an example", () => {
  const sys = buildMessages("灣仔")[0].content;
  assert.match(sys, /ONE JSON object/);
  assert.match(sys, /source_url/);
  assert.match(sys, /EXAMPLE reply/);
  assert.match(sys, /"restaurants": \[\]/);
});

test("runDistrict turns collected entries into posts and passes diagnostics through", async () => {
  const collect = async () => ({
    collected: [{
      item: { title: "T", link: "https://www.hk01.com/a", snippet: "人均 65", source: "HK01", category: "其他" },
      restaurant: "海皇粥店",
      price: 65,
    }],
    diagnostics: { parsed: true },
  });
  const res = await runDistrict(wanChai, { collect, fetchedAt: "2026-10-26T00:00:00.000Z" });
  assert.equal(res.posts.length, 1);
  assert.equal(res.posts[0].perPerson, 65);
  assert.equal(res.posts[0].restaurant, "海皇粥店");
  assert.deepEqual(res.diagnostics, { parsed: true });
  assert.deepEqual(res.errors, []);
});

test("runDistrict reports a failed call and returns no posts", async () => {
  const res = await runDistrict(wanChai, { collect: async () => { throw new Error("boom"); }, fetchedAt: "t" });
  assert.equal(res.posts.length, 0);
  assert.equal(res.errors.length, 1);
});

test("posts without a URL survive merging; statistics and labels", () => {
  const a = buildPostFromExtraction({ item: { title: "x", link: "", snippet: "s", source: "AI 搜尋" }, restaurant: "甲", price: 60, fetchedAt: "t1" });
  const b = buildPostFromExtraction({ item: { title: "y", link: "", snippet: "s", source: "AI 搜尋" }, restaurant: "乙", price: 80, fetchedAt: "t2" });
  assert.equal(mergePosts([], [a, b]).length, 2);
  assert.equal(districtStats([a, b]).avgPerPerson, 70);
  assert.equal(sourceLabel("https://www.hk01.com/a"), "HK01");
});
