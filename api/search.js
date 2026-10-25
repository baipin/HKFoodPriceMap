// Vercel Serverless Function: authenticated proxy to the Bright Data SERP API.
// The Bright Data key and SERP zone live only in Vercel environment variables
// (BRIGHTDATA_API_KEY, BRIGHTDATA_ZONE_SERP). GitHub Actions calls this endpoint.
//
//   GET /api/search?q=<query>
//   -> { items: [{ title, link, snippet, source }] }
//
// Every request must send  Authorization: Bearer <CRON_SECRET>.
import { timingSafeEqual } from "node:crypto";
import { readSearchConfig, serpSearch } from "../lib/search.mjs";

const MAX_QUERY_LENGTH = 200;

function authorized(req) {
  const secret = process.env.CRON_SECRET || "";
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (!authorized(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "use GET" });
  }
  const q = String(req.query?.q || "").trim();
  if (!q || q.length > MAX_QUERY_LENGTH) {
    return res.status(400).json({ error: "q is required (max 200 chars)" });
  }
  try {
    const cfg = readSearchConfig(process.env);
    const items = await serpSearch(cfg, q);
    return res.status(200).json({ items });
  } catch (err) {
    // Do not echo the key or the upstream body back to the caller.
    console.error("search proxy failed:", err.message);
    return res.status(500).json({ error: "upstream failed" });
  }
}
