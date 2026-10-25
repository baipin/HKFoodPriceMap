// Crawl one district: search -> filter to allowed social domains -> fetch -> extract.
import { serpSearch, unlockPage } from "./brightdata.mjs";
import { buildPost, sourceFor } from "./extract.mjs";
import { QuotaExceeded } from "./quota.mjs";

export const MAX_PAGES_PER_DISTRICT = 8;
const CONCURRENCY = 4;

export function queriesFor(district) {
  return [
    `site:xiaohongshu.com ${district.zh} 美食 人均 餐厅`,
    `site:facebook.com ${district.zh} 餐厅 人均 HK$`,
  ];
}

// Run tasks with a concurrency limit, preserving order of results.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function crawlDistrict(district, { cfg, meter, fetchImpl, now = new Date() }) {
  const errors = [];
  const fetchedAt = now.toISOString();

  // 1. Search (SERP API, 1 credit per query)
  const candidates = new Map();
  let quotaHit = false;
  for (const q of queriesFor(district)) {
    try {
      const results = await serpSearch(cfg, q, { meter, fetchImpl });
      for (const r of results) {
        if (sourceFor(r.link) && !candidates.has(r.link)) {
          candidates.set(r.link, r.title);
        }
      }
    } catch (err) {
      if (err instanceof QuotaExceeded) {
        quotaHit = true;
        break;
      }
      errors.push(`search: ${err.message}`);
    }
  }

  // 2. Fetch pages (Web Unlocker, 1 credit per page)
  const urls = quotaHit ? [] : [...candidates.keys()].slice(0, MAX_PAGES_PER_DISTRICT);
  const posts = [];
  await mapLimit(urls, CONCURRENCY, async (url) => {
    if (quotaHit) return;
    try {
      const html = await unlockPage(cfg, url, { meter, fetchImpl });
      const post = buildPost({ url, html, searchTitle: candidates.get(url), fetchedAt });
      if (post) posts.push(post);
    } catch (err) {
      if (err instanceof QuotaExceeded) {
        quotaHit = true;
        return;
      }
      errors.push(`fetch ${url}: ${err.message}`);
    }
  });

  return { posts, errors, quotaHit, creditsUsed: meter.used };
}
