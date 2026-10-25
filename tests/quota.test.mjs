import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Meter,
  QuotaExceeded,
  MONTHLY_LIMIT,
  MONTHLY_RESERVE,
  PER_RUN_CAP,
  monthKey,
  normalizeLedger,
  runBudget,
  recordRun,
} from "../lib/quota.mjs";

const oct = new Date("2026-10-15T00:00:00Z");
const nov = new Date("2026-11-01T00:00:00Z");

test("Meter refuses to exceed its budget before sending", () => {
  const m = new Meter(3);
  m.charge(1);
  m.charge(2);
  assert.equal(m.used, 3);
  assert.throws(() => m.charge(1), QuotaExceeded);
  assert.equal(m.used, 3, "failed charge must not be counted");
});

test("monthKey uses UTC year-month", () => {
  assert.equal(monthKey(oct), "2026-10");
});

test("month rollover resets the counter", () => {
  const ledger = { month: "2026-10", used: 4000, runs: [] };
  assert.equal(normalizeLedger(ledger, oct).used, 4000);
  assert.equal(normalizeLedger(ledger, nov).used, 0);
});

test("runBudget respects per-run cap and monthly reserve", () => {
  assert.equal(runBudget({ month: "2026-10", used: 0 }, oct), PER_RUN_CAP);
  // Only 4500 usable per month (5000 - 500 reserve).
  const nearEnd = { month: "2026-10", used: MONTHLY_LIMIT - MONTHLY_RESERVE - 50 };
  assert.equal(runBudget(nearEnd, oct), 50);
  const over = { month: "2026-10", used: MONTHLY_LIMIT };
  assert.equal(runBudget(over, oct), 0);
});

test("runBudget is full again after rollover", () => {
  const over = { month: "2026-10", used: MONTHLY_LIMIT };
  assert.equal(runBudget(over, nov), PER_RUN_CAP);
});

test("recordRun accumulates credits and keeps history bounded", () => {
  let l = { month: "2026-10", used: 0, runs: [] };
  for (let i = 0; i < 60; i++) {
    l = recordRun(l, { startedAt: "x", credits: 1, districts: 1 }, oct);
  }
  assert.equal(l.used, 60);
  assert.equal(l.runs.length, 50);
});
