// Bright Data Facebook Scraper API client (dataset API, asynchronous).
// Flow: trigger(urls) -> snapshot_id; poll progress(snapshot_id) until "ready";
// then snapshot(snapshot_id) returns the collected records as JSON.
//
// Dataset: "Facebook posts - collect by post URL" (gd_lyclm1571iy3mv57zw).
// Input is a list of Facebook post / page URLs maintained in data/seeds.json.
// The API key is read from the environment only (BRIGHTDATA_API_KEY).

const BASE = "https://api.brightdata.com/datasets/v3";
export const FACEBOOK_POSTS_DATASET = "gd_lyclm1571iy3mv57zw";

export function readConfig(env = process.env) {
  const apiKey = env.BRIGHTDATA_API_KEY;
  if (!apiKey) throw new Error("Missing BRIGHTDATA_API_KEY");
  return { apiKey, dataset: env.BRIGHTDATA_DATASET_ID || FACEBOOK_POSTS_DATASET };
}

async function call(cfg, method, url, body, fetchImpl) {
  const res = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Bright Data HTTP ${res.status}`);
  return res.json();
}

// Start a collection job for a list of URLs. Returns the snapshot_id.
export async function triggerCollection(cfg, urls, { fetchImpl = fetch } = {}) {
  // Async endpoint per the Bright Data docs: POST /datasets/v3/trigger?dataset_id=...
  // Body: a plain JSON array of objects, e.g. [{ "url": "https://www.facebook.com/..." }]
  const url = `${BASE}/trigger?dataset_id=${encodeURIComponent(cfg.dataset)}&format=json`;
  const json = await call(cfg, "POST", url, urls.map((u) => ({ url: u })), fetchImpl);
  if (!json || !json.snapshot_id) throw new Error("Bright Data trigger returned no snapshot_id");
  return json.snapshot_id;
}

// Returns "running" | "ready" | "failed" (and other statuses as reported).
export async function snapshotProgress(cfg, snapshotId, { fetchImpl = fetch } = {}) {
  const json = await call(cfg, "GET", `${BASE}/progress/${encodeURIComponent(snapshotId)}`, null, fetchImpl);
  return String(json.status || "unknown");
}

// Download the records of a finished snapshot. Returns an array of objects.
export async function snapshotRecords(cfg, snapshotId, { fetchImpl = fetch } = {}) {
  const json = await call(
    cfg,
    "GET",
    `${BASE}/snapshot/${encodeURIComponent(snapshotId)}?format=json`,
    null,
    fetchImpl
  );
  return Array.isArray(json) ? json : [];
}
