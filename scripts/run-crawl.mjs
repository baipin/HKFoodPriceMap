// Driver used by GitHub Actions (.github/workflows/crawl.yml).
// For each district it calls the Vercel function /api/crawl, merges the posts
// into data/districts.json and records the spend in data/usage.json.
//
// Env: CRAWL_URL (e.g. https://your-site.vercel.app), CRON_SECRET
import { DISTRICTS } from "../lib/districts.mjs";
import { DISTRICTS_FILE, USAGE_FILE, applyCrawlResult, emptyDb, readJson, writeJson } from "../lib/store.mjs";
import { normalizeLedger, recordRun, runBudget, PER_RUN_CAP } from "../lib/quota.mjs";

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
if (runCap <= 0) {
  console.log("Monthly credit budget reached (reserve kept). Skipping crawl.");
  process.exit(0);
}

let db = await readJson(DISTRICTS_FILE, emptyDb(startedAt));
let spent = 0;
const perDistrict = Math.max(1, Math.floor(runCap / DISTRICTS.length));
let done = 0;

for (const d of DISTRICTS) {
  const remaining = runCap - spent;
  if (remaining <= 0) break;
  const budget = Math.min(perDistrict, remaining);
  try {
    const url = new URL("/api/crawl", baseUrl);
    url.searchParams.set("district", d.id);
    url.searchParams.set("budget", String(budget));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
    if (!res.ok) {
      // 401/400 are rejected before any Bright Data call, so nothing is spent.
      // Anything else may have spent credits: count the full budget (safe side).
      if (res.status === 401 || res.status === 400) {
        console.error(`${d.id}: rejected (HTTP ${res.status}), check CRON_SECRET / CRAWL_URL`);
        console.error("Aborting run: configuration problem.");
        process.exit(1);
      }
      spent += budget;
      console.error(`${d.id}: HTTP ${res.status}`);
      continue;
    }
    const result = await res.json();
    // Server-reported spend is bounded by the budget we sent.
    spent += Math.min(Number(result.creditsUsed) || 0, budget);
    db = applyCrawlResult(db, d.id, result, new Date());
    done++;
    console.log(`${d.id}: +${result.posts.length} posts, credits ${result.creditsUsed}, errors ${result.errors.length}`);
    if (result.quotaHit) {
      console.log("Quota guard hit; stopping run.");
      break;
    }
  } catch (err) {
    spent += budget; // conservative: assume the call may have spent credits
    console.error(`${d.id}: ${err.message}`);
  }
}

ledger = recordRun(
  ledger,
  { startedAt: startedAt.toISOString(), credits: spent, districts: done, note: "scheduled" },
  startedAt
);

await writeJson(DISTRICTS_FILE, db);
await writeJson(USAGE_FILE, ledger);
console.log(`Run finished: ${done}/${DISTRICTS.length} districts, ${spent} credits. Month total ${ledger.used}/${ledger.limit}.`);
