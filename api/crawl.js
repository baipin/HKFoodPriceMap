// Vercel Serverless Function: authenticated proxy to the Bright Data Facebook
// synchronous scraper. The Bright Data key lives only in Vercel environment
// variables. GitHub Actions calls it once per seed URL (see scripts/run-crawl.mjs):
//
//   POST /api/crawl   body: { "url": "https://www.facebook.com/..." }   (post, group or page)
//   -> { status: "ok", kind, records: [...], credits }
//   -> { status: "timeout", kind, credits }   (Bright Data did not finish within one minute)
//
// Every request must send  Authorization: Bearer <CRON_SECRET>.
import { timingSafeEqual } from "node:crypto";
import { readConfig, scrapeUrl } from "../lib/brightdata.mjs";
import { Meter } from "../lib/quota.mjs";
import { normalizeUrl } from "../lib/crawl.mjs";
import { classifyUrl, creditCost } from "../lib/facebook-kind.mjs";

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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "use POST" });
  }

  const body = parseBody(req);
  const url = body && typeof body.url === "string" ? normalizeUrl(body.url) : null;
  const kind = url && /facebook\.com/.test(url) ? classifyUrl(url) : null;
  if (!kind) {
    return res.status(400).json({ error: "body must be { url: <facebook post, group or page url> }" });
  }

  try {
    const cfg = readConfig(process.env);
    // Charge the URL's cost (1 for a post, LIMIT_PER_INPUT for a group or page)
    // before the request is sent.
    const cost = creditCost(kind);
    const meter = new Meter(cost);
    meter.charge(cost);
    const result = await scrapeUrl(cfg, url, kind);
    return res.status(200).json({ ...result, kind, credits: meter.used });
  } catch (err) {
    // Do not echo internal details (keys, dataset internals) back to the caller.
    console.error("crawl proxy failed:", err.message);
    return res.status(500).json({ error: "upstream failed" });
  }
}
