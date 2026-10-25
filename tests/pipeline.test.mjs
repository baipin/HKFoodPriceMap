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
  MAX_ITEMS_PER_DISTRICT,
  UNVERIFIED_SOURCE,
} from "../lib/llm.mjs";
import { runDistrict } from "../lib/pipeline.mjs";
import { buildPostFromExtraction, districtStats, mergePosts } from "../lib/extract.mjs";
import { getDistrict } from "../lib/districts.mjs";

const wanChai = getDistrict("wan-chai");
const reply = (content, status = 200) => async () =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });

test("GPT-5.4 Nano is the default model and is sent to the chat endpoint with a JSON response format", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url: String(url), body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"prices":[]}' } }] }), { status: 200 });
  };
  await collectForDistrict("灣仔", { fetchImpl });
  assert.equal(seen.url, "https://gen.pollinations.ai/v1/chat/completions");
  assert.equal(POLLINATIONS_MODEL, "openai/gpt-5.4-nano");
  assert.equal(seen.body.model, POLLINATIONS_MODEL);
  assert.deepEqual(seen.body.response_format, { type: "json_object" });
  assert.match(seen.body.messages[1].content, /District: 灣仔/);
});

test("a 400 on response_format is retried once without it", async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) return new Response("bad format", { status: 400 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"prices":[]}' } }] }), { status: 200 });
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

test("parseModelReply reads the prices list, a bare array, a fenced block, or text around JSON", () => {
  assert.deepEqual(parseModelReply('{"prices":[{"item":"A"}]}'), [{ item: "A" }]);
  assert.deepEqual(parseModelReply('[{"item":"B"}]'), [{ item: "B" }]);
  assert.deepEqual(parseModelReply('Here:\n```json\n{"items":[{"item":"C"}]}\n```'), [{ item: "C" }]);
  assert.deepEqual(parseModelReply('Sure. {"prices":[{"item":"D"}]} Done.'), [{ item: "D" }]);
  assert.equal(parseModelReply("I do not know."), null);
});

test("parsePrice accepts numbers, currency text and ranges", () => {
  assert.equal(parsePrice(45), 45);
  assert.equal(parsePrice("45"), 45);
  assert.equal(parsePrice("HK$45"), 45);
  assert.equal(parsePrice("約 $1,200"), 1200);
  assert.equal(parsePrice("40-60元"), 50);
  assert.ok(Number.isNaN(parsePrice("免費")));
});

test("validateCollection keeps item price points and drops unusable ones", () => {
  const { accepted, dropped } = validateCollection([
    { category: "兩餸飯", item: "叉燒兩餸飯（一餸兩味）", priceHKD: "HK$55", priceBasis: "每份", evidence: "常見價錢估計" },
    { category: "茶餐廳", item: "凍奶茶", priceHKD: 25 },
    { category: "茶餐廳", item: "", priceHKD: 30 },
    { category: "茶餐廳", item: "太貴", priceHKD: 9999 },
    { category: "茶餐廳", item: "沒有價錢" },
    { category: "茶餐廳", item: "凍奶茶", priceHKD: 26 },
  ]);
  assert.equal(accepted.length, 2);
  assert.equal(accepted[0].priceItem, "叉燒兩餸飯（一餸兩味）");
  assert.equal(accepted[0].price, 55);
  assert.equal(accepted[0].basis, "每份");
  assert.equal(accepted[0].item.source, UNVERIFIED_SOURCE);
  assert.equal(accepted[1].basis, "每份", "basis defaults to 每份");
  assert.equal(dropped.noItem, 1);
  assert.equal(dropped.badPrice, 1);
  assert.equal(dropped.noPrice, 1);
  assert.equal(dropped.duplicate, 1);
});

test("validateCollection caps the number of items per district", () => {
  const many = Array.from({ length: MAX_ITEMS_PER_DISTRICT + 5 }, (_, i) => ({ category: "其他", item: "項目" + i, priceHKD: 50 }));
  assert.equal(validateCollection(many).accepted.length, MAX_ITEMS_PER_DISTRICT);
});

test("collectForDistrict returns diagnostics for an unreadable reply", async () => {
  const { collected, diagnostics } = await collectForDistrict("灣仔", { fetchImpl: reply("sorry, no idea") });
  assert.deepEqual(collected, []);
  assert.equal(diagnostics.parsed, false);
  assert.match(diagnostics.sample, /sorry/);
});

test("collectForDistrict returns accepted items and counts", async () => {
  const content = '{"prices":[{"category":"茶餐廳","item":"凍奶茶","priceHKD":"25","priceBasis":"每份","evidence":"常見價錢估計"}]}';
  const { collected, diagnostics } = await collectForDistrict("灣仔", { fetchImpl: reply(content) });
  assert.equal(collected.length, 1);
  assert.equal(collected[0].priceItem, "凍奶茶");
  assert.equal(diagnostics.entries, 1);
  assert.equal(diagnostics.accepted, 1);
});

test("a non-OK answer throws with its status; a 'needs paid Pollen' sentence throws 402", async () => {
  await assert.rejects(collectForDistrict("灣仔", { fetchImpl: reply("no", 503) }), (e) => e.status === 503);
  await assert.rejects(
    collectForDistrict("灣仔", { fetchImpl: reply("The account has no credits. Please top up.") }),
    (e) => e.status === 402
  );
});

test("the prompt asks for price items and forbids naming restaurants", () => {
  const sys = buildMessages("灣仔")[0].content;
  assert.match(sys, /ONE JSON object/);
  assert.match(sys, /Do NOT name restaurants/);
  assert.match(sys, /"prices"/);
  assert.match(sys, /EXAMPLE reply/);
});

test("runDistrict turns collected items into price records and passes diagnostics through", async () => {
  const collect = async () => ({
    collected: [{
      item: { title: "凍奶茶（每份）", link: "", snippet: "常見價錢估計", source: UNVERIFIED_SOURCE, category: "茶餐廳" },
      priceItem: "凍奶茶",
      category: "茶餐廳",
      price: 25,
      basis: "每份",
    }],
    diagnostics: { parsed: true },
  });
  const res = await runDistrict(wanChai, { collect, fetchedAt: "2026-10-26T00:00:00.000Z" });
  assert.equal(res.posts.length, 1);
  assert.equal(res.posts[0].perPerson, 25);
  assert.equal(res.posts[0].priceItem, "凍奶茶");
  assert.equal(res.posts[0].restaurant, "");
  assert.deepEqual(res.diagnostics, { parsed: true });
});

test("runDistrict reports a failed call and returns no posts", async () => {
  const res = await runDistrict(wanChai, { collect: async () => { throw new Error("boom"); }, fetchedAt: "t" });
  assert.equal(res.posts.length, 0);
  assert.equal(res.errors.length, 1);
});

test("price records merge without URLs and feed the statistics", () => {
  const a = buildPostFromExtraction({ item: { title: "x", link: "", snippet: "s", source: UNVERIFIED_SOURCE, category: "茶餐廳" }, priceItem: "凍奶茶", price: 25, basis: "每份", fetchedAt: "t1" });
  const b = buildPostFromExtraction({ item: { title: "y", link: "", snippet: "s", source: UNVERIFIED_SOURCE, category: "兩餸飯" }, priceItem: "叉燒飯", price: 55, basis: "每份", fetchedAt: "t2" });
  assert.equal(mergePosts([], [a, b]).length, 2);
  assert.equal(districtStats([a, b]).avgPerPerson, 40);
});
