// Driver used by GitHub Actions (.github/workflows/crawl.yml).
// No social media is crawled directly. For each district:
//   1. run 3 Google Custom Search queries (through the Vercel proxy /api/search)
//   2. ask Pollinations to extract restaurant names and per-person prices from the results
//   3. merge the validated posts into data/districts.json and record usage in data/usage.json
//
// Env: CRAWL_URL (e.g. https://hkfoodpricemap.vercel.app), CRON_SECRET
import { DISTRICTS_FILE, USAGE_FILE, applyCrawlResult, emptyDb, readJson, writeJson } from "../lib/store.mjs";
import { normalizeLedger, recordRun, runBudget, PER_RUN_CAP } from "../lib/quota.mjs";
import { DISTRICTS } from "../lib/districts.mjs";
import { QUERIES_PER_DISTRICT } from "../lib/search.mjs";
import { runDistrict } from "../lib/pipeline.mjs";
import { extractForDistrict } from "../lib/llm.mjs";

const baseUrl = process.env.CRAWL_URL;
const secret = process.env.CRON_SECRET;
if (!baseUrl || !secret) {
  console.error("CRAWL_URL and CRON_SECRET must be set");
  process.exit(1);
}

const startedAt = new Date();
let ledger = normalizeLedger(await readJson(USAGE_FILE, null), startedAt);
const runCap = runBudget(ledger, startedAt);
console.log(`Month ${ledger.month}: used ${ledger.used}, run budget ${runCap} (cap ${PER_RUN_CAP})`);

if (runCap < QUERIES_PER_DISTRICT) {
  console.log("Not enough search budget for a run. Skipping.");
  process.exit(0);
}

// Search through the Vercel proxy (holds the Google key).
async function search(query) {
  const url = new URL("/api/search", baseUrl);
  url.searchParams.set("q", query);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
  let json = {};
  try { json = await res.json(); } catch { /* non-JSON */ }
  if (res.status === 401 || res.status === 400) {
    console.error(`HTTP ${res.status}: ${json.error || "rejected"}. Check CRON_SECRET / CRAWL_URL.`);
    process.exit(1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${json.error || "error"}`);
  return json.items || [];
}

// Pollinations is called directly from the runner (no key needed).
let db = await readJson(DISTRICTS_FILE, emptyDb(startedAt));
let spent = 0;
let updated = 0;
const fetchedAt = new Date().toISOString();

for (const d of DISTRICTS) {
  if (spent + QUERIES_PER_DISTRICT > runCap) {
    console.log(`Budget reached before ${d.id}; remaining districts keep their data.`);
    break;
  }
  spent += QUERIES_PER_DISTRICT; // charged per query attempted, to stay on the safe side
  const result = await runDistrict(d, {
    search,
    extract: extractForDistrict,
    fetchedAt,
  });
  for (const e of result.errors) console.error(`${d.id}: ${e}`);
  db = applyCrawlResult(db, d.id, { posts: result.posts }, new Date());
  if (result.posts.length) updated++;
  console.log(`${d.id}: ${result.items} result(s), ${result.posts.length} post(s) with prices`);
}

ledger = recordRun(
  ledger,
  { startedAt: startedAt.toISOString(), credits: spent, districts: updated, note: "google-cse+pollinations" },
  startedAt
);

await writeJson(DISTRICTS_FILE, db);
await writeJson(USAGE_FILE, ledger);
console.log(`Run finished: ${updated} district(s) with posts, ${spent} search credits. Month total ${ledger.used}/${ledger.limit}.`);
