// Bright Data Facebook Scraper API client (synchronous /scrape endpoint).
// One Facebook URL per request. Per the Bright Data docs, the response contains
// the records directly when collection finishes within one minute. If it takes
// longer, the API answers HTTP 202 with a snapshot_id; we do not use snapshots,
// so such URLs are reported as "timeout" and skipped for this run.
//
// Dataset: "Facebook posts - collect by post URL" (gd_lyclm1571iy3mv57zw).
// The API key is read from the environment only (BRIGHTDATA_API_KEY).

const BASE = "https://api.brightdata.com/datasets/v3";
export const FACEBOOK_POSTS_DATASET = "gd_lyclm1571iy3mv57zw";

export function readConfig(env = process.env) {
  const apiKey = env.BRIGHTDATA_API_KEY;
  if (!apiKey) throw new Error("Missing BRIGHTDATA_API_KEY");
  return { apiKey, dataset: env.BRIGHTDATA_DATASET_ID || FACEBOOK_POSTS_DATASET };
}

// Parse a JSON array body, or NDJSON (one JSON object per line) as a fallback.
export function parseRecords(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  try {
    const json = JSON.parse(t);
    return Array.isArray(json) ? json : [json];
  } catch {
    return t
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  }
}

// Scrape one Facebook URL synchronously.
// Returns { status: "ok", records } or { status: "timeout" } when the API answers 202.
export async function scrapeUrl(cfg, url, { fetchImpl = fetch } = {}) {
  const endpoint =
    `${BASE}/scrape?dataset_id=${encodeURIComponent(cfg.dataset)}&format=json`;
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{ url }]),
  });
  if (res.status === 202) return { status: "timeout" };
  if (!res.ok) throw new Error(`Bright Data HTTP ${res.status}`);
  return { status: "ok", records: parseRecords(await res.text()) };
}
