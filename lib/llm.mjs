// Extract restaurant names and per-person prices from search results using
// Pollinations (public, no API key needed). Output is validated strictly:
//   - the model refers to results by index, so it cannot invent URLs;
//   - prices must be numbers within MIN_PRICE..MAX_PRICE;
//   - restaurant names are length-limited and stripped of control characters.
// Pollinations is a free community service with no SLA; a failed call just
// yields no posts for that district.
import { MIN_PRICE, MAX_PRICE } from "./extract.mjs";

export const POLLINATIONS_ENDPOINT = "https://text.pollinations.ai/openai";
export const POLLINATIONS_MODEL = "openai";

export function buildMessages(districtZh, items) {
  const list = items
    .map((it, i) => `[${i}] title: ${it.title}\n    snippet: ${it.snippet}\n    source: ${it.source}`)
    .join("\n");
  const system =
    "You extract restaurant price information from web search results about Hong Kong. " +
    "Reply with a JSON array only, no prose. Each element: " +
    '{"i": <result index>, "inDistrict": <true|false>, "restaurant": "<name or empty>", "perPerson": <number in HKD>}. ' +
    "Include only results that explicitly state a per-person price (人均 / per person / HK$ per head). " +
    "Use only facts present in the title or snippet. Do not guess prices.";
  const user = `District: ${districtZh}\nSearch results:\n${list}\n\nJSON array:`;
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

function cleanName(s) {
  return String(s || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

// Keep only well-formed entries that point at a real search result.
export function validateExtraction(entries, items) {
  const out = [];
  for (const e of entries || []) {
    if (!e || typeof e !== "object") continue;
    const i = Number(e.i);
    if (!Number.isInteger(i) || i < 0 || i >= items.length) continue;
    if (e.inDistrict === false) continue;
    const price = Number(e.perPerson);
    if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE) continue;
    out.push({ item: items[i], restaurant: cleanName(e.restaurant), price: Math.round(price) });
  }
  return out;
}

// Call Pollinations once for a district's results. Returns validated extractions.
export async function extractForDistrict(districtZh, items, { fetchImpl = fetch } = {}) {
  if (!items.length) return [];
  const res = await fetchImpl(POLLINATIONS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: POLLINATIONS_MODEL,
      messages: buildMessages(districtZh, items),
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "";
  return validateExtraction(parseJsonArray(content), items);
}
