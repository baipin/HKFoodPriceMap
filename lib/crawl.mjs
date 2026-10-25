// Map seed URLs to districts and group collected Facebook records by district.
import { buildPostFromRecord } from "./extract.mjs";
import { DISTRICTS } from "./districts.mjs";

// Normalise a URL for matching: lower-case host, no query/fragment, no trailing slash.
export function normalizeUrl(u) {
  try {
    const url = new URL(String(u).trim());
    url.hash = "";
    // Some Facebook URLs carry their identity in the query (profile.php?id=...).
    if (!/\/(profile|permalink|story)\.php$/.test(url.pathname)) url.search = "";
    url.hostname = url.hostname.toLowerCase().replace(/^m\./, "www.").replace(/^web\./, "www.");
    if (!url.hostname.startsWith("www.") && url.hostname.endsWith("facebook.com")) {
      url.hostname = "www.facebook.com";
    }
    return url.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

// data/seeds.json: { "<district-id>": ["https://www.facebook.com/...", ...] }
// Returns a Map normalised-url -> district id, and the deduplicated URL list.
export function parseSeeds(seeds) {
  const valid = new Set(DISTRICTS.map((d) => d.id));
  const urlToDistrict = new Map();
  for (const [districtId, urls] of Object.entries(seeds || {})) {
    if (districtId.startsWith("_")) continue; // comments, e.g. "_comment"
    if (!valid.has(districtId)) throw new Error(`seeds.json: unknown district "${districtId}"`);
    if (!Array.isArray(urls)) throw new Error(`seeds.json: "${districtId}" must be an array`);
    for (const raw of urls) {
      const n = normalizeUrl(raw);
      if (!n || !/facebook\.com/.test(n)) continue; // only Facebook URLs are accepted
      if (!urlToDistrict.has(n)) urlToDistrict.set(n, districtId);
    }
  }
  return { urlToDistrict, urls: [...urlToDistrict.keys()] };
}

// Which seed URL does a record belong to? Checks the fields Bright Data may use.
export function districtForRecord(rec, urlToDistrict) {
  const candidates = [rec.input_url, rec.input, rec.url, rec.post_url, rec.page_url, rec.user_url];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const n = normalizeUrl(c);
    if (n && urlToDistrict.has(n)) return urlToDistrict.get(n);
  }
  return null;
}

// Group records into { districtId: [post, ...] }. Records that match no seed are dropped.
export function groupRecords(records, urlToDistrict, fetchedAt) {
  const byDistrict = new Map();
  for (const rec of records || []) {
    if (!rec || typeof rec !== "object") continue;
    const districtId = districtForRecord(rec, urlToDistrict);
    if (!districtId) continue;
    const post = buildPostFromRecord(rec, fetchedAt);
    if (!post) continue;
    if (!byDistrict.has(districtId)) byDistrict.set(districtId, []);
    byDistrict.get(districtId).push(post);
  }
  return byDistrict;
}
