// Vercel Serverless Function: thin, authenticated proxy to the Bright Data
// Facebook posts dataset. The Bright Data key lives only in Vercel environment
// variables. GitHub Actions drives the three steps (see scripts/run-crawl.mjs):
//
//   POST /api/crawl?action=trigger    body: { "urls": ["https://www.facebook.com/..."] }
//                                     -> { snapshot_id, credits }
//   GET  /api/crawl?action=progress&snapshot=ID   -> { status }
//   GET  /api/crawl?action=snapshot&snapshot=ID   -> { records }
//
// Every request must send  Authorization: Bearer <CRON_SECRET>.
import { timingSafeEqual } from "node:crypto";
import { readConfig, triggerCollection, snapshotProgress, snapshotRecords } from "../lib/brightdata.mjs";
import { Meter, PER_RUN_CAP } from "../lib/quota.mjs";
import { normalizeUrl } from "../lib/crawl.mjs";

const SNAPSHOT_RE = /^[A-Za-z0-9_-]{4,100}$/;

function authorized(req) {
  const secret = process.env.CRON_SECRET || "";
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body;
}

export default async function handler(req, res) {
  if (!authorized(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const action = String(req.query?.action || "");

  try {
    const cfg = readConfig(process.env);

    if (action === "trigger") {
      if (req.method !== "POST") return res.status(405).json({ error: "use POST" });
      const body = parseBody(req);
      if (!body || !Array.isArray(body.urls)) {
        return res.status(400).json({ error: "body must be { urls: [...] }" });
      }
      const urls = [...new Set(body.urls.map(normalizeUrl).filter((u) => u && /facebook\.com/.test(u)))];
      if (!urls.length) return res.status(400).json({ error: "no valid Facebook URLs" });
      if (urls.length > PER_RUN_CAP) {
        return res.status(400).json({ error: `too many URLs (max ${PER_RUN_CAP})` });
      }
      // One credit (one record) per input URL, charged before the job starts.
      const meter = new Meter(urls.length);
      meter.charge(urls.length);
      const snapshotId = await triggerCollection(cfg, urls);
      return res.status(200).json({ snapshot_id: snapshotId, credits: meter.used });
    }

    if (action === "progress" || action === "snapshot") {
      if (req.method !== "GET") return res.status(405).json({ error: "use GET" });
      const id = String(req.query?.snapshot || "");
      if (!SNAPSHOT_RE.test(id)) return res.status(400).json({ error: "bad snapshot id" });
      if (action === "progress") {
        return res.status(200).json({ status: await snapshotProgress(cfg, id) });
      }
      return res.status(200).json({ records: await snapshotRecords(cfg, id) });
    }

    return res.status(400).json({ error: "unknown action" });
  } catch (err) {
    // Do not echo internal details (keys, dataset internals) back to the caller.
    console.error("crawl proxy failed:", err.message);
    return res.status(500).json({ error: "upstream failed" });
  }
}
