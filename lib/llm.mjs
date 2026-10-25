// The only data source of the crawler: Pollinations' GPT-5.4 Nano (openai/gpt-5.4-nano).
// One call per district. The model is asked for TYPICAL PRICES of common food items
// (for example a two-dish rice meal or a cha chaan teng set), not for named restaurants:
// restaurant names were a frequent source of hallucinated places. The model answers from its
// own knowledge (no web search), so every price is labelled as unverified.
//
// Endpoint: POST https://gen.pollinations.ai/v1/chat/completions (OpenAI-compatible).
// POLLINATIONS_API_KEY is sent as a Bearer token when set.
import { MIN_PRICE, MAX_PRICE } from "./extract.mjs";

export const POLLINATIONS_ENDPOINT = "https://gen.pollinations.ai/v1/chat/completions";
// Overridable with the POLLINATIONS_MODEL variable (GitHub: Settings → Variables).
export const POLLINATIONS_MODEL = process.env.POLLINATIONS_MODEL || "openai/gpt-5.4-nano";
export const MAX_ITEMS_PER_DISTRICT = 12;
export const UNVERIFIED_SOURCE = "AI 知識（未核實）";

export function pollinationsHeaders(env = process.env) {
  const headers = { "Content-Type": "application/json" };
  if (env.POLLINATIONS_API_KEY) headers.Authorization = `Bearer ${env.POLLINATIONS_API_KEY}`;
  return headers;
}

// The prompt is the contract: exact schema, a worked example, and what to do when nothing is known.
export function buildMessages(districtZh) {
  const system = [
    "You are a Hong Kong food-price reference. Using your general knowledge of typical Hong Kong prices, give the TYPICAL price of common affordable food items sold in the given district.",
    "Focus on categories: 兩餸飯 (two-dish rice, price for one plate with two dishes), 茶餐廳 (cha chaan teng set meals and common items such as 奶茶, 西多士, 叉燒飯), and 其他 (other everyday meals).",
    "Do NOT name restaurants or shops. Only give dish or meal types and their typical prices.",
    "",
    "OUTPUT RULES (strict):",
    "- Reply with ONE JSON object only. No prose, no markdown, no code fence.",
    '- Schema: {"prices": [ {"category": string, "item": string, "priceHKD": number, "priceBasis": string, "evidence": string} ]}',
    '- category: one of "兩餸飯", "茶餐廳", "其他".',
    "- item: the dish or meal type in Chinese, for example 「叉燒兩餸飯（一餸兩味）」 or 「凍奶茶」. Never a shop name.",
    "- priceHKD: a plain number of HKD, for example 45 (not a string, no currency symbol). Use the typical middle price.",
    '- priceBasis: "每位" if the price is per person, or "每份" if it is the price of one portion.',
    "- evidence: a short note, at most 30 characters, saying this is a typical estimate, for example 「常見價錢估計」.",
    "- Only include items you are reasonably confident are sold in Hong Kong at about that price. Do not invent.",
    "- If you do not know any, return {\"prices\": []}.",
    `- At most ${MAX_ITEMS_PER_DISTRICT} items.`,
    "",
    "EXAMPLE reply:",
    '{"prices": [{"category": "兩餸飯", "item": "叉燒兩餸飯（一餸兩味）", "priceHKD": 55, "priceBasis": "每份", "evidence": "常見價錢估計"}, {"category": "茶餐廳", "item": "凍奶茶", "priceHKD": 25, "priceBasis": "每份", "evidence": "常見價錢估計"}]}',
  ].join("\n");
  const user = `District: ${districtZh} (香港地區). Return the JSON object with typical prices for this district.`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// Parse a model reply. Accepts an object with a list field, a bare array, or either
// wrapped in prose / a code fence. Returns the entries array, or null if none can be read.
export function parseModelReply(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  const candidates = [t];
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());
  const objStart = t.indexOf("{");
  const objEnd = t.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) candidates.push(t.slice(objStart, objEnd + 1));
  const arrStart = t.indexOf("[");
  const arrEnd = t.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) candidates.push(t.slice(arrStart, arrEnd + 1));

  for (const c of candidates) {
    let v;
    try { v = JSON.parse(c); } catch { continue; }
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      for (const key of ["prices", "items", "results", "data"]) {
        if (Array.isArray(v[key])) return v[key];
      }
    }
  }
  return null;
}

// Read a price from a number or from text such as "HK$45", "約 $80", "40-60元", "$1,200".
// A range is averaged. Returns NaN when no number is present.
export function parsePrice(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/,/g, "");
  const range = s.match(/(\d+(?:\.\d+)?)\s*[-~～至到]\s*(\d+(?:\.\d+)?)/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const one = s.match(/\d+(?:\.\d+)?/);
  return one ? Number(one[0]) : NaN;
}

function cleanText(s, max) {
  return String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Validate entries. An item name and an in-range price are required.
// Returns { accepted: [{ item, priceItem, category, price, basis }], dropped }.
export function validateCollection(entries) {
  const accepted = [];
  const dropped = { noItem: 0, noPrice: 0, badPrice: 0, duplicate: 0 };
  const seen = new Set();
  for (const e of entries || []) {
    if (!e || typeof e !== "object") { dropped.noItem++; continue; }
    const priceItem = cleanText(e.item ?? e.name, 60);
    if (!priceItem) { dropped.noItem++; continue; }
    const rawPrice = e.priceHKD ?? e.price ?? e.perPerson;
    if (rawPrice == null || rawPrice === "") { dropped.noPrice++; continue; }
    const price = parsePrice(rawPrice);
    if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE) { dropped.badPrice++; continue; }
    const category = cleanText(e.category, 20) || "其他";
    const basis = cleanText(e.priceBasis, 10) || "每份";
    const key = `${category}|${priceItem}`;
    if (seen.has(key)) { dropped.duplicate++; continue; }
    seen.add(key);
    const evidence = cleanText(e.evidence, 60) || "常見價錢估計";
    accepted.push({
      item: {
        title: `${priceItem}（${basis}）`,
        link: "",
        snippet: evidence,
        source: UNVERIFIED_SOURCE,
        category,
      },
      priceItem,
      category,
      price: Math.round(price),
      basis,
    });
    if (accepted.length >= MAX_ITEMS_PER_DISTRICT) break;
  }
  return { accepted, dropped };
}

// One Pollinations call for a district. Returns { collected, diagnostics }.
// If the server rejects response_format, the call is retried once without it.
export async function collectForDistrict(districtZh, { fetchImpl = fetch } = {}) {
  const diagnostics = { district: districtZh, status: null, retried: false, chars: 0, parsed: false, entries: 0, accepted: 0, dropped: null };
  const body = (withFormat) => JSON.stringify({
    model: POLLINATIONS_MODEL,
    messages: buildMessages(districtZh),
    temperature: 0,
    stream: false,
    ...(withFormat ? { response_format: { type: "json_object" } } : {}),
  });

  let res = await fetchImpl(POLLINATIONS_ENDPOINT, { method: "POST", headers: pollinationsHeaders(), body: body(true) });
  if (res.status === 400) {
    diagnostics.retried = true;
    res = await fetchImpl(POLLINATIONS_ENDPOINT, { method: "POST", headers: pollinationsHeaders(), body: body(false) });
  }
  diagnostics.status = res.status;
  if (!res.ok) {
    // Keep the status so the driver can stop early on billing / auth errors.
    throw Object.assign(new Error(`Pollinations HTTP ${res.status}`), { status: res.status });
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "";
  // Pollinations can answer HTTP 200 with a plain sentence when the account lacks credit.
  if (/top up|paid pollen|enough credits/i.test(String(content)) && !/prices|\[/.test(String(content))) {
    throw Object.assign(new Error("Pollinations: this model needs paid Pollen and the account has no balance (" + POLLINATIONS_MODEL + ")"), { status: 402 });
  }
  diagnostics.chars = String(content).length;
  const entries = parseModelReply(content);
  diagnostics.parsed = Array.isArray(entries);
  diagnostics.entries = entries ? entries.length : 0;
  if (!entries) {
    diagnostics.sample = String(content).slice(0, 200);
    return { collected: [], diagnostics };
  }
  const { accepted, dropped } = validateCollection(entries);
  diagnostics.accepted = accepted.length;
  diagnostics.dropped = dropped;
  return { collected: accepted, diagnostics };
}
