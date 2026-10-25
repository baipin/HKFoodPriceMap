// Driver used by GitHub Actions (.github/workflows/crawl.yml).
//   1. read data/seeds.json (Facebook URLs per district) and the credit ledger
//   2. trigger one Bright Data collection job for the URLs (via /api/crawl)
//   3. poll its progress until ready, then download the records
//   4. group records by district, merge into data/districts.json, update usage.json
//
// Env: CRAWL_URL (e.g. https://hkfoodpricemap.vercel.app), CRON_SECRET
import { DISTRICTS_FILE, USAGE_FILE, SEEDS_FILE, applyCrawlResult, emptyDb, readJson, writeJson } from "../lib/store.mjs";
import { normalizeLedger, recordRun, runBudget, PER_RUN_CAP } from "../lib/quota.mjs";
import { parseSeeds, groupRecords } from "../lib/crawl.mjs";
import { DISTRICTS } from "../lib/districts.mjs";

const baseUrl = process.env.CRAWL_URL;
const secret = process.env.CRON_SECRET;
if (!baseUrl || !secret) {
  console.error("CRAWL_URL and CRON_SECRET must be set");
  process.exit(1);
}

const POLL_MS = 30_000;
const MAX_WAIT_MS = 45 * 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, params, body) {
  const url = new URL("/api/crawl", baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch { /* non-JSON error page */ }
  if (res.status === 401 || res.status === 400) {
    console.error(`HTTP ${res.status}: ${json.error || "rejected"}. Check CRON_SECRET / CRAWL_URL / seeds.json.`);
    process.exit(1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${json.error || "error"}`);
  return json;
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

const urls = seeds.urls.slice(0, runCap);
console.log(`Triggering collection for ${urls.length} URL(s) ...`);
const { snapshot_id: snapshotId, credits } = await api("POST", { action: "trigger" }, { urls });
console.log(`snapshot ${snapshotId}, credits reserved ${credits}`);

// Poll until the Bright Data job finishes.
const deadline = Date.now() + MAX_WAIT_MS;
let status = "running";
let errorsInRow = 0;
while (true) {
  try {
    const p = await api("GET", { action: "progress", snapshot: snapshotId });
    status = String(p.status || "unknown").toLowerCase();
    errorsInRow = 0;
    console.log(`progress: ${status}`);
  } catch (err) {
    // Transient errors must not skip the ledger write, so retry a few times.
    errorsInRow++;
    console.error(`progress check failed (${errorsInRow}): ${err.message}`);
    if (errorsInRow >= 5) { status = "error"; break; }
  }
  if (status === "ready" || status === "failed" || status === "error") break;
  if (Date.now() > deadline) {
    console.error("Timed out waiting for the snapshot.");
    status = "timeout";
    break;
  }
  await sleep(POLL_MS);
}

// Credits are charged per record; if the job failed we still count the reserved
// amount to stay on the safe side.
let spent = urls.length;
let db = await readJson(DISTRICTS_FILE, emptyDb(startedAt));
let districtsUpdated = 0;

if (status === "ready") {
  const { records } = await api("GET", { action: "snapshot", snapshot: snapshotId });
  const grouped = groupRecords(records, seeds.urlToDistrict, new Date().toISOString());
  console.log(`records: ${records.length}, matched to districts: ${[...grouped.keys()].length}`);
  for (const d of DISTRICTS) {
    const posts = grouped.get(d.id) || [];
    db = applyCrawlResult(db, d.id, { posts }, new Date());
    if (posts.length) districtsUpdated++;
  }
} else {
  console.error(`Snapshot did not complete (status: ${status}). Data left unchanged.`);
}

ledger = recordRun(
  ledger,
  { startedAt: startedAt.toISOString(), credits: spent, districts: districtsUpdated, note: `status=${status}` },
  startedAt
);

await writeJson(DISTRICTS_FILE, db);
await writeJson(USAGE_FILE, ledger);
console.log(`Run finished: ${districtsUpdated} district(s) with posts, ${spent} credits. Month total ${ledger.used}/${ledger.limit}.`);
