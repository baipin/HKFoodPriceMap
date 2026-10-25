// Vercel Serverless Function: crawl ONE district with Bright Data.
// The Bright Data key lives only in Vercel environment variables, so it is
// never present in the repo or in GitHub. The GitHub Actions workflow calls
// this endpoint once per district and stores the returned posts in data/.
//
//   GET /api/crawl?district=wan-chai&budget=12
//   Authorization: Bearer <CRON_SECRET>
import { timingSafeEqual } from "node:crypto";
import { getDistrict } from "../lib/districts.mjs";
import { readConfig } from "../lib/brightdata.mjs";
import { Meter, PER_RUN_CAP } from "../lib/quota.mjs";
import { crawlDistrict } from "../lib/crawl.mjs";

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
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  if (!authorized(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const district = getDistrict(String(req.query?.district || ""));
  if (!district) {
    return res.status(400).json({ error: "unknown district" });
  }

  // The caller proposes a budget; the server never allows more than PER_RUN_CAP.
  const requested = Number.parseInt(String(req.query?.budget ?? PER_RUN_CAP), 10);
  const budget = Math.min(
    Number.isFinite(requested) && requested > 0 ? requested : 0,
    PER_RUN_CAP
  );
  if (budget <= 0) {
    return res.status(400).json({ error: "budget must be a positive integer" });
  }

  try {
    const cfg = readConfig(process.env);
    const meter = new Meter(budget);
    const result = await crawlDistrict(district, { cfg, meter });
    return res.status(200).json({
      district: district.id,
      creditsUsed: result.creditsUsed,
      quotaHit: result.quotaHit,
      errors: result.errors.slice(0, 20),
      posts: result.posts,
    });
  } catch (err) {
    // Do not echo internal details (keys, zone names) back to the caller.
    console.error("crawl failed:", err.message);
    return res.status(500).json({ error: "crawl failed" });
  }
}
