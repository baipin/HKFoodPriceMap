// Bright Data Facebook Scraper API client (synchronous /scrape endpoint).
// One Facebook URL per request; the dataset is chosen by the URL kind
// (post / group / page, see facebook-kind.mjs).
//
// Per the Bright Data docs, records come back directly when collection finishes
// within one minute. Otherwise the API answers HTTP 202 with a snapshot_id. We do
// not use snapshots, so those URLs are reported as "timeout" and skipped.
//
// The API key is read from the environment only (BRIGHTDATA_API_KEY).
import { DATASETS, LIMIT_PER_INPUT } from "./facebook-kind.mjs";

const BASE = "https://api.brightdata.com/datasets/v3";

export function readConfig(env = process.env) {
  const apiKey = env.BRIGHTDATA_API_KEY;
  if (!apiKey) throw new Error("Missing BRIGHTDATA_API_KEY");
  return { apiKey };
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

// Request body per the docs: a plain array for single posts; an object with
// `input` and `limit_per_input` for groups and pages.
export function buildBody(url, kind) {
  if (kind === "post") return [{ url }];
  return { input: [{ url }], limit_per_input: LIMIT_PER_INPUT };
}

// Scrape one Facebook URL synchronously.
// Returns { status: "ok", records } or { status: "timeout" } when the API answers 202.
export async function scrapeUrl(cfg, url, kind, { fetchImpl = fetch } = {}) {
  const dataset = DATASETS[kind];
  if (!dataset) throw new Error(`Unknown kind: ${kind}`);
  const endpoint = `${BASE}/scrape?dataset_id=${encodeURIComponent(dataset)}&format=json`;
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildBody(url, kind)),
  });
  if (res.status === 202) return { status: "timeout" };
  if (!res.ok) throw new Error(`Bright Data HTTP ${res.status}`);
  return { status: "ok", records: parseRecords(await res.text()) };
}
