// Minimal Bright Data client: Web Unlocker (page fetch) and SERP API (search).
// Both go through the same synchronous endpoint: POST https://api.brightdata.com/request
// The API key and zone names are read from environment variables only.
// Every call must be preceded by meter.charge(1) (see quota.mjs).

const ENDPOINT = "https://api.brightdata.com/request";

export function readConfig(env = process.env) {
  const apiKey = env.BRIGHTDATA_API_KEY;
  const unlockerZone = env.BRIGHTDATA_ZONE_UNLOCKER;
  const serpZone = env.BRIGHTDATA_ZONE_SERP;
  if (!apiKey || !unlockerZone || !serpZone) {
    throw new Error(
      "Missing BRIGHTDATA_API_KEY / BRIGHTDATA_ZONE_UNLOCKER / BRIGHTDATA_ZONE_SERP"
    );
  }
  return { apiKey, unlockerZone, serpZone };
}

async function post(cfg, body, fetchImpl) {
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Bright Data HTTP ${res.status}`);
  }
  return res.text();
}

// Fetch one page through Web Unlocker. Returns raw HTML/text.
export async function unlockPage(cfg, url, { meter, fetchImpl = fetch }) {
  meter.charge(1);
  return post(cfg, { zone: cfg.unlockerZone, url, format: "raw" }, fetchImpl);
}

// Run a Google search through the SERP API. Returns [{ title, link, snippet }].
export async function serpSearch(cfg, query, { meter, fetchImpl = fetch, num = 10 }) {
  meter.charge(1);
  const searchUrl =
    "https://www.google.com/search?hl=zh-HK&gl=hk&num=" +
    num +
    "&brd_json=1&q=" +
    encodeURIComponent(query);
  const text = await post(cfg, { zone: cfg.serpZone, url: searchUrl, format: "raw" }, fetchImpl);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const organic = Array.isArray(json.organic) ? json.organic : [];
  return organic
    .filter((r) => r && typeof r.link === "string")
    .map((r) => ({
      title: String(r.title || ""),
      link: r.link,
      snippet: String(r.description || r.snippet || ""),
    }));
}
