// The only data source of the crawler: Pollinations.
// One call per district to a search-enabled Pollinations model. The prompt asks for
// a fixed JSON schema; the reply is parsed leniently (object or array, prices as
// numbers or text) and then validated, so one odd field does not drop a whole reply.
//
// Endpoint: POST https://gen.pollinations.ai/v1/chat/completions (OpenAI-compatible).
// POLLINATIONS_API_KEY is sent as a Bearer token when set.
import { MIN_PRICE, MAX_PRICE, sourceLabel } from "./extract.mjs";

export const POLLINATIONS_ENDPOINT = "https://gen.pollinations.ai/v1/chat/completions";
// Search-grounded model from the Pollinations model list (https://gen.pollinations.ai/text/models).
export const POLLINATIONS_MODEL = "google/gemini-2.5-flash-lite:search";
export const MAX_RESULTS_PER_DISTRICT = 15;

export function pollinationsHeaders(env = process.env) {
  const headers = { "Content-Type": "application/json" };
  if (env.POLLINATIONS_API_KEY) headers.Authorization = `Bearer ${env.POLLINATIONS_API_KEY}`;
  return headers;
}

// The prompt is the contract: exact schema, a worked example, and what to do when nothing is found.
export function buildMessages(districtZh) {
  const system = [
    "You are a research assistant. Use web search to find restaurants located in the given Hong Kong district (地區) that serve food and whose per-person price (人均消費) is stated on a public web page.",
    "Search in Traditional Chinese and English. Useful searches: 「<district> 兩餸飯 人均」, 「<district> 茶餐廳 人均」, 「<district> 食評 人均 HK$」, 「<district> 美食 人均消費」.",
    "",
    "OUTPUT RULES (strict):",
    "- Reply with ONE JSON object only. No prose, no markdown, no code fence.",
    '- Schema: {"restaurants": [ {"restaurant": string, "category": string, "perPerson": number, "currency": "HKD", "source_url": string, "source_title": string, "evidence": string} ]}',
    "- restaurant: the shop name as written on the page, in Chinese if the page uses Chinese.",
    '- category: one of "兩餸飯", "茶餐廳", "餐廳", "其他".',
    "- perPerson: a plain number of HKD per person, for example 65 (not a string, no currency symbol). If the page gives a range such as 60-80, use the average (70).",
    "- source_url: the full https URL of the page that states the price. Copy it exactly.",
    "- source_title: the page title. evidence: the short phrase from the page that states the price, at most 40 characters.",
    "- Only include restaurants physically in the given district, and only if a page explicitly states a per-person price in HKD.",
    "- Never guess or estimate a price. If you find nothing, return {\"restaurants\": []}.",
    `- At most ${MAX_RESULTS_PER_DISTRICT} restaurants.`,
    "",
    "EXAMPLE reply:",
    '{"restaurants": [{"restaurant": "海皇粥店", "category": "其他", "perPerson": 65, "currency": "HKD", "source_url": "https://www.example.com/post/1", "source_title": "中環海皇粥店食評", "evidence": "人均 $65 好正"}]}',
  ].join("\n");
  const user = `District: ${districtZh} (香港地區). Search the web now and return the JSON object.`;
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
      for (const key of ["restaurants", "results", "items", "data"]) {
        if (Array.isArray(v[key])) return v[key];
      }
    }
  }
  return null;
}

// Read a price from a number or from text such as "HK$65", "約 $80", "60-80元", "$1,200".
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

function httpUrl(u) {
  try {
    const url = new URL(String(u ?? "").trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

// Validate entries. A restaurant name and an in-range price are required; a source URL
// is optional (it is kept when valid). Returns the accepted list and counts of what was dropped.
export function validateCollection(entries) {
  const accepted = [];
  const dropped = { noName: 0, noPrice: 0, badPrice: 0, duplicate: 0 };
  const seen = new Set();
  for (const e of entries || []) {
    if (!e || typeof e !== "object") { dropped.noName++; continue; }
    const restaurant = cleanText(e.restaurant ?? e.name, 60);
    if (!restaurant) { dropped.noName++; continue; }
    const rawPrice = e.perPerson ?? e.price ?? e.per_person;
    if (rawPrice == null || rawPrice === "") { dropped.noPrice++; continue; }
    const price = parsePrice(rawPrice);
    if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE) { dropped.badPrice++; continue; }
    const link = httpUrl(e.source_url ?? e.url ?? e.link) || "";
    const key = link || `${restaurant}|${Math.round(price)}`;
    if (seen.has(key)) { dropped.duplicate++; continue; }
    seen.add(key);
    const title = cleanText(e.source_title ?? e.title, 200) || restaurant;
    const evidence = cleanText(e.evidence ?? e.snippet, 120);
    const category = cleanText(e.category, 20) || "餐廳";
    accepted.push({
      item: {
        title,
        link,
        snippet: evidence || `${restaurant}（${category}）人均 HK$${Math.round(price)}`,
        source: link ? (sourceLabel(link) || "web") : "AI 搜尋",
        category,
      },
      restaurant,
      price: Math.round(price),
    });
    if (accepted.length >= MAX_RESULTS_PER_DISTRICT) break;
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
