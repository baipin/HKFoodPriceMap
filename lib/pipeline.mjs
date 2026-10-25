// One district: ask Pollinations (search-enabled model) for restaurants in that
// district, validate the answer, and turn it into post records.
// Pollinations is the only data source.
import { collectForDistrict } from "./llm.mjs";
import { buildPostFromExtraction } from "./extract.mjs";

// `collect(zh)` returns { collected, diagnostics } (may throw).
export async function runDistrict(district, { collect = collectForDistrict, fetchedAt }) {
  const errors = [];
  let collected = [];
  let diagnostics = null;
  try {
    ({ collected, diagnostics } = await collect(district.zh));
  } catch (err) {
    errors.push(`pollinations: ${err.message}`);
  }
  const posts = collected.map((x) =>
    buildPostFromExtraction({
      item: x.item,
      restaurant: x.restaurant,
      price: x.price,
      fetchedAt,
    })
  );
  return { posts, found: collected.length, errors, diagnostics };
}
