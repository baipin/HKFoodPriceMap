// Driver used by GitHub Actions (.github/workflows/crawl.yml).
//   1. read data/seeds.json (Facebook post URLs per district) and the credit ledger
//   2. call /api/crawl once per URL (synchronous Bright Data scrape, 4 at a time)
//   3. turn the records into posts, grouped by the district that owns the URL
//   4. merge into data/districts.json and record the spend in data/usage.json
//
// Env: CRAWL_URL (e.g. https://hkfoodpricemap.vercel.app), CRON_SECRET
import { DISTRICTS_FILE, USAGE_FILE, SEEDS_FILE, applyCrawlResult, emptyDb, readJson, writeJson } from "../lib/store.mjs";
import { normalizeLedger, recordRun, runBudget, PER_RUN_CAP } from "../lib/quota.mjs";
import { parseSeeds, normalizeUrl } from "../lib/crawl.mjs";
import { buildPostFromRecord } from "../lib/extract.mjs";
import { classifyUrl, creditCost } from "../lib/facebook-kind.mjs";
import { DISTRICTS } from "../lib/districts.mjs";

const baseUrl = process.env.CRAWL_URL;
const secret = process.env.CRON_SECRET;
if (!baseUrl || !secret) {
  console.error("CRAWL_URL and CRON_SECRET must be set");
  process.exit(1);
}

const CONCURRENCY = 4;

async function scrape(url) {
  const endpoint = new URL("/api/crawl", baseUrl);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  let json = {};
  try { json = await res.json(); } catch { /* non-JSON error page */ }
  if (res.status === 401 || res.status === 400) {
    console.error(`HTTP ${res.status}: ${json.error || "rejected"}. Check CRON_SECRET / CRAWL_URL / seeds.json.`);
    process.exit(1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${json.error || "error"}`);
  return json; // { status: "ok" | "timeout", records?, credits }
}

// Run fn over items with a fixed number of workers.
async function pool(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

const startedAt = new Date();
const seeds = parseSeeds(await readJson(SEEDS_FILE, {}));
let ledger = normalizeLedger(await readJson(USAGE_FILE, null), startedAt);
const runCap = runBudget(ledger, startedAt);
console.log(`Month ${ledger.month}: used ${ledger.used}, run budget ${runCap} (cap ${PER_RUN_CAP})`);

if (!seeds.urls.length) {
  console.log("data/seeds.json has no Facebook URLs. Nothing to crawl.");
  process.exit(0);
}
if (runCap <= 0) {
  console.log("Monthly credit budget reached (reserve kept). Skipping crawl.");
  process.exit(0);
}

// Pick URLs in order while their total credit cost fits the run budget.
// A post costs 1 credit; a group or page costs LIMIT_PER_INPUT credits.
const urls = [];
let planned = 0;
for (const url of seeds.urls) {
  const kind = classifyUrl(url);
  if (!kind) {
    console.log(`skipped (not a post, group or page URL): ${url}`);
    continue;
  }
  const cost = creditCost(kind);
  if (planned + cost > runCap) break;
  planned += cost;
  urls.push(url);
}
console.log(`Scraping ${urls.length} URL(s) for ~${planned} credit(s), ${CONCURRENCY} at a time ...`);

const fetchedAt = new Date().toISOString();
const postsByDistrict = new Map(); // districtId -> posts
let spent = 0;
let ok = 0;
let timeouts = 0;
let failures = 0;

await pool(urls, CONCURRENCY, async (url) => {
  const districtId = seeds.urlToDistrict.get(normalizeUrl(url));
  try {
    const result = await scrape(url);
    spent += Number(result.credits) || 1;
    if (result.status !== "ok") {
      timeouts++;
      console.log(`timeout (not finished within 1 min): ${url}`);
      return;
    }
    ok++;
    const posts = (result.records || [])
      .map((rec) => buildPostFromRecord(rec, fetchedAt))
      .filter(Boolean);
    if (!postsByDistrict.has(districtId)) postsByDistrict.set(districtId, []);
    postsByDistrict.get(districtId).push(...posts);
    console.log(`ok: ${url} -> ${posts.length} post(s) with prices`);
  } catch (err) {
    // Unknown spend on failure: count one credit to stay on the safe side.
    spent += 1;
    failures++;
    console.error(`failed: ${url}: ${err.message}`);
  }
});

let db = await readJson(DISTRICTS_FILE, emptyDb(startedAt));
let districtsUpdated = 0;
// Only districts that have seed URLs are refreshed; others keep their data.
const seededDistricts = new Set(seeds.urlToDistrict.values());
for (const d of DISTRICTS) {
  if (!seededDistricts.has(d.id)) continue;
  const posts = postsByDistrict.get(d.id) || [];
  db = applyCrawlResult(db, d.id, { posts }, new Date());
  if (posts.length) districtsUpdated++;
}

ledger = recordRun(
  ledger,
  {
    startedAt: startedAt.toISOString(),
    credits: spent,
    districts: districtsUpdated,
    note: `ok=${ok} timeout=${timeouts} failed=${failures}`,
  },
  startedAt
);

await writeJson(DISTRICTS_FILE, db);
await writeJson(USAGE_FILE, ledger);
console.log(
  `Run finished: ${ok} ok, ${timeouts} timeout, ${failures} failed; ${districtsUpdated} district(s) with posts; ` +
  `${spent} credits. Month total ${ledger.used}/${ledger.limit}.`
);
