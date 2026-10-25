// One district: run its search queries, dedupe the results, extract prices with
// Pollinations, and turn the validated extractions into post records.
import { queriesFor } from "./search.mjs";
import { extractForDistrict } from "./llm.mjs";
import { buildPostFromExtraction } from "./extract.mjs";

// Keep the prompt small: at most this many distinct results per district.
export const MAX_ITEMS_PER_DISTRICT = 25;

// `search(query)` returns [{ title, link, snippet, source }] (may throw).
// `extract(zh, items)` returns validated extractions (may throw).
export async function runDistrict(district, { search, extract = extractForDistrict, fetchedAt }) {
  const errors = [];
  const byLink = new Map();
  let searches = 0;

  for (const q of queriesFor(district)) {
    searches++;
    try {
      const results = await search(q);
      for (const r of results) {
        if (!byLink.has(r.link)) byLink.set(r.link, r);
      }
    } catch (err) {
      errors.push(`search "${q}": ${err.message}`);
    }
  }

  const items = [...byLink.values()].slice(0, MAX_ITEMS_PER_DISTRICT);
  let extractions = [];
  try {
    extractions = await extract(district.zh, items);
  } catch (err) {
    errors.push(`extract: ${err.message}`);
  }

  const posts = extractions.map((x) =>
    buildPostFromExtraction({
      item: x.item,
      restaurant: x.restaurant,
      price: x.price,
      fetchedAt,
    })
  );
  return { posts, searches, items: items.length, errors };
}
