// Credit (额度) guard for Bright Data.
// Plan: 5000 credits / month. SERP API: 1 credit per request.
// We never use Web Unlocker, Browser API or Scraper API.
//
// The ledger lives in data/usage.json (committed by the crawl workflow).
// Every call that spends credits MUST go through a Meter, which refuses to
// exceed the per-run budget, so the monthly cap cannot be overrun.

export const MONTHLY_LIMIT = 5000;
// Keep a reserve so manual testing / unexpected retries never exhaust the plan.
export const MONTHLY_RESERVE = 500;
// Hard ceiling per crawl run (a weekly run uses at most this many credits).
export const PER_RUN_CAP = 300;

export function monthKey(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function emptyLedger(now = new Date()) {
  return { month: monthKey(now), used: 0, limit: MONTHLY_LIMIT, reserve: MONTHLY_RESERVE, runs: [] };
}

// Returns a ledger for the current month (resets the counter on month rollover).
export function normalizeLedger(ledger, now = new Date()) {
  if (!ledger || typeof ledger !== "object") return emptyLedger(now);
  if (ledger.month !== monthKey(now)) return emptyLedger(now);
  return {
    month: ledger.month,
    used: Number.isFinite(ledger.used) ? ledger.used : 0,
    limit: MONTHLY_LIMIT,
    reserve: MONTHLY_RESERVE,
    runs: Array.isArray(ledger.runs) ? ledger.runs.slice(-50) : [],
  };
}

// How many credits a run may spend right now.
export function runBudget(ledger, now = new Date()) {
  const l = normalizeLedger(ledger, now);
  const monthlyLeft = MONTHLY_LIMIT - MONTHLY_RESERVE - l.used;
  return Math.max(0, Math.min(PER_RUN_CAP, monthlyLeft));
}

export class QuotaExceeded extends Error {
  constructor(message) {
    super(message);
    this.name = "QuotaExceeded";
  }
}

// Counts spending for one run. charge() throws BEFORE the request is sent.
export class Meter {
  constructor(budget) {
    this.budget = budget;
    this.used = 0;
  }
  remaining() {
    return this.budget - this.used;
  }
  charge(n = 1) {
    if (this.used + n > this.budget) {
      throw new QuotaExceeded(
        `Credit budget exhausted (used ${this.used}, budget ${this.budget})`
      );
    }
    this.used += n;
  }
}

export function recordRun(ledger, { startedAt, credits, districts, note }, now = new Date()) {
  const l = normalizeLedger(ledger, now);
  l.used += credits;
  l.runs.push({ startedAt, credits, districts, note: note || "" });
  l.runs = l.runs.slice(-50);
  return l;
}
