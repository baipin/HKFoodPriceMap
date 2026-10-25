// The only data source of the crawler: Pollinations.
// One call per district to a search-enabled Pollinations model, which looks up
// public web pages about restaurants in that district and returns, as JSON,
// restaurant names, per-person prices (HKD) and the page each one came from.
//
// Endpoint: POST https://gen.pollinations.ai/v1/chat/completions (OpenAI-compatible).
// POLLINATIONS_API_KEY is sent as a Bearer token when set.
//
// Output is validated strictly, because the model's answer is not trusted:
//   - each source must be an http(s) URL; entries without one are dropped;
//   - prices must be numbers within MIN_PRICE..MAX_PRICE;
//   - names and titles are length-limited and stripped of control characters.
// A failed call yields no posts for that district; the site keeps its last data.
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

export function buildMessages(districtZh) {
  const system =
    "You search the public web for restaurants in Hong Kong and report their per-person prices. " +
    "Search in Traditional Chinese and English, for example 兩餸飯, 茶餐廳, 食評, 人均, HK$. " +
    "Reply with a JSON array only, no prose, no code fence. Each element must be: " +
    '{"restaurant": "<restaurant name>", "perPerson": <number, HKD per person>, ' +
    '"url": "<the page that states the price>", "title": "<page title>"}. ' +
    "Include only restaurants located in the given district that a page explicitly prices per person in HKD. " +
    "Do not guess prices. Return at most " + MAX_RESULTS_PER_DISTRICT + " elements.";
  const user = `District: ${districtZh}\nReturn the JSON array.`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// Pull the first JSON array out of a model reply (it may be wrapped in text or a code fence).
export function parseJsonArray(text) {
  const t = String(text || "");
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(t.slice(start, end + 1));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function cleanText(s, max) {
  return String(s || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function httpUrl(u) {
  try {
    const url = new URL(String(u).trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

// Keep only well-formed entries with a valid source URL and a price in range.
// Returns [{ item: { title, link, snippet, source }, restaurant, price }].
export function validateCollection(entries) {
  const out = [];
  const seen = new Set();
  for (const e of entries || []) {
    if (!e || typeof e !== "object") continue;
    const link = httpUrl(e.url);
    if (!link || seen.has(link)) continue;
    const price = Number(e.perPerson);
    if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE) continue;
    const restaurant = cleanText(e.restaurant, 60);
    const title = cleanText(e.title, 200) || restaurant;
    seen.add(link);
    out.push({
      item: {
        title,
        link,
        // The page was not fetched; the snippet is the model's own one-line summary.
        snippet: restaurant ? `${restaurant}：人均 HK$${Math.round(price)}` : `人均 HK$${Math.round(price)}`,
        source: sourceLabel(link) || "web",
      },
      restaurant,
      price: Math.round(price),
    });
    if (out.length >= MAX_RESULTS_PER_DISTRICT) break;
  }
  return out;
}

// One Pollinations call for a district. Returns validated collections.
export async function collectForDistrict(districtZh, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(POLLINATIONS_ENDPOINT, {
    method: "POST",
    headers: pollinationsHeaders(),
    body: JSON.stringify({
      model: POLLINATIONS_MODEL,
      messages: buildMessages(districtZh),
      temperature: 0,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "";
  return validateCollection(parseJsonArray(content));
}
