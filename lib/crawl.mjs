// Crawl one district using only the SERP API (1 credit per query).
// Search results from allowed social domains become post records; the title
// and snippet of each result are the source text (no page fetching).
import { serpSearch } from "./brightdata.mjs";
import { buildPostFromSearch, sourceFor } from "./extract.mjs";
import { QuotaExceeded } from "./quota.mjs";

// Four queries per district: two Xiaohongshu, two Facebook, Chinese and HK-style.
export function queriesFor(district) {
  return [
    `site:xiaohongshu.com ${district.zh} 美食 人均`,
    `site:xiaohongshu.com ${district.zh} 餐廳 人均 HK$`,
    `site:facebook.com ${district.zh} 餐廳 人均 HK$`,
    `site:facebook.com ${district.zh} 美食 人均 $`,
  ];
}

export const CREDITS_PER_DISTRICT = queriesFor({ zh: "x" }).length;

export async function crawlDistrict(district, { cfg, meter, fetchImpl, now = new Date() }) {
  const errors = [];
  const fetchedAt = now.toISOString();
  const posts = [];
  const seen = new Set();
  let quotaHit = false;

  for (const q of queriesFor(district)) {
    try {
      const results = await serpSearch(cfg, q, { meter, fetchImpl });
      for (const r of results) {
        if (!sourceFor(r.link) || seen.has(r.link)) continue;
        seen.add(r.link);
        const post = buildPostFromSearch({
          url: r.link,
          title: r.title,
          snippet: r.snippet,
          fetchedAt,
        });
        if (post) posts.push(post);
      }
    } catch (err) {
      if (err instanceof QuotaExceeded) {
        quotaHit = true;
        break;
      }
      errors.push(`search: ${err.message}`);
    }
  }

  return { posts, errors, quotaHit, creditsUsed: meter.used };
}
