// Driver used by GitHub Actions (.github/workflows/crawl.yml).
// Pollinations is the only data source. For each district it makes one call to a
// search-enabled Pollinations model, validates the answer, and merges the posts
// into data/districts.json. Usage is recorded in data/usage.json (one request per district).
//
// Env: POLLINATIONS_API_KEY (optional, sent as a Bearer token when set)
import { DISTRICTS_FILE, USAGE_FILE, applyCrawlResult, emptyDb, readJson, writeJson } from "../lib/store.mjs";
import { normalizeLedger, recordRun, runBudget, PER_RUN_CAP } from "../lib/quota.mjs";
import { DISTRICTS } from "../lib/districts.mjs";
import { runDistrict } from "../lib/pipeline.mjs";

const startedAt = new Date();
let ledger = normalizeLedger(await readJson(USAGE_FILE, null), startedAt);
const runCap = runBudget(ledger, startedAt);
console.log(`Month ${ledger.month}: used ${ledger.used}, run budget ${runCap} (cap ${PER_RUN_CAP})`);

// One Pollinations request per district.
const plannedCalls = DISTRICTS.length;
if (runCap < plannedCalls) {
  console.log(`Budget ${runCap} is below the ${plannedCalls} requests a full run needs. Skipping.`);
  process.exit(0);
}

let db = await readJson(DISTRICTS_FILE, emptyDb(startedAt));
const fetchedAt = new Date().toISOString();
let calls = 0;
let updated = 0;

for (const d of DISTRICTS) {
  calls++;
  const result = await runDistrict(d, { fetchedAt });
  for (const e of result.errors) console.error(`${d.id}: ${e}`);
  db = applyCrawlResult(db, d.id, { posts: result.posts }, new Date());
  if (result.posts.length) updated++;
  console.log(`${d.id}: ${result.found} restaurant(s) with a sourced price`);
}

ledger = recordRun(
  ledger,
  { startedAt: startedAt.toISOString(), credits: calls, districts: updated, note: "pollinations" },
  startedAt
);

await writeJson(DISTRICTS_FILE, db);
await writeJson(USAGE_FILE, ledger);
console.log(`Run finished: ${updated} district(s) with posts, ${calls} request(s). Month total ${ledger.used}/${ledger.limit}.`);
