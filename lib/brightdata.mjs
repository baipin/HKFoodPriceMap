// Minimal Bright Data client: SERP API only (search results).
// We deliberately do NOT use Web Unlocker (paid per page). Post content is taken
// from search-result titles and snippets instead.
// Endpoint: POST https://api.brightdata.com/request
// The API key and zone name are read from environment variables only.
// Every call must be preceded by meter.charge(1) (see quota.mjs).

const ENDPOINT = "https://api.brightdata.com/request";

export function readConfig(env = process.env) {
  const apiKey = env.BRIGHTDATA_API_KEY;
  const serpZone = env.BRIGHTDATA_ZONE_SERP;
  if (!apiKey || !serpZone) {
    throw new Error("Missing BRIGHTDATA_API_KEY / BRIGHTDATA_ZONE_SERP");
  }
  return { apiKey, serpZone };
}

// Run a Google search through the SERP API. Returns [{ title, link, snippet }].
export async function serpSearch(cfg, query, { meter, fetchImpl = fetch, num = 10 }) {
  meter.charge(1);
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
  if (!res.ok) {
    throw new Error(`Bright Data HTTP ${res.status}`);
  }
  let json;
  try {
    json = JSON.parse(await res.text());
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
