// Web search through the Bright Data SERP API (1 credit per request).
// Endpoint: POST https://api.brightdata.com/request with a Google search URL and
// brd_json=1, which returns the organic results as JSON.
// The API key and SERP zone name are read from environment variables only, and
// are used only by the Vercel proxy (api/search.js).
import { DISTRICTS } from "./districts.mjs";

const ENDPOINT = "https://api.brightdata.com/request";

// Three searches per district: 兩餸飯, 茶餐廳, and food reviews with per-person prices.
export function queriesFor(district) {
  return [
    `${district.zh} 兩餸飯 人均 價錢`,
    `${district.zh} 茶餐廳 人均 價錢`,
    `${district.zh} 食評 人均 HK$`,
  ];
}

export const QUERIES_PER_DISTRICT = queriesFor(DISTRICTS[0]).length;

// Human-readable source label from a result URL. Social media is labelled but
// its content is only the search snippet (we do not fetch pages).
const LABELS = [
  ["facebook.com", "Facebook"],
  ["xiaohongshu.com", "小红书"],
  ["xhslink.com", "小红书"],
  ["hk01.com", "HK01"],
  ["stheadline.com", "星島"],
  ["hkcd.com.hk", "香港商報"],
  ["ufood.com.hk", "UFood"],
  ["i-cable.com", "i-CABLE"],
  ["openrice.com", "OpenRice"],
  ["discuss.com.hk", "連登"],
  ["babydiscuss.com", "Babydiscuss"],
];

export function sourceLabel(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [domain, label] of LABELS) {
    if (host === domain || host.endsWith("." + domain)) return label;
  }
  return host.replace(/^www\./, "");
}

// Map a SERP response (`organic` array) to [{ title, link, snippet, source }].
export function parseSerpResponse(json) {
  const organic = Array.isArray(json?.organic) ? json.organic : [];
  return organic
    .filter((r) => r && typeof r.link === "string" && /^https?:\/\//.test(r.link))
    .map((r) => ({
      title: String(r.title || ""),
      link: r.link,
      snippet: String(r.description || r.snippet || ""),
      source: sourceLabel(r.link) || "web",
    }));
}

// Run one search through the Bright Data SERP API. Returns [{ title, link, snippet, source }].
export async function serpSearch(cfg, query, { fetchImpl = fetch, num = 10 } = {}) {
  const searchUrl =
    "https://www.google.com/search?hl=zh-HK&gl=hk&num=" +
    num +
    "&brd_json=1&q=" +
    encodeURIComponent(query);
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ zone: cfg.serpZone, url: searchUrl, format: "raw" }),
  });
  if (!res.ok) throw new Error(`Bright Data SERP HTTP ${res.status}`);
  let json;
  try {
    json = JSON.parse(await res.text());
  } catch {
    return [];
  }
  return parseSerpResponse(json);
}

export function readSearchConfig(env = process.env) {
  const apiKey = env.BRIGHTDATA_API_KEY;
  const serpZone = env.BRIGHTDATA_ZONE_SERP;
  if (!apiKey || !serpZone) throw new Error("Missing BRIGHTDATA_API_KEY / BRIGHTDATA_ZONE_SERP");
  return { apiKey, serpZone };
}
