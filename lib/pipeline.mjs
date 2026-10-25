// One district: ask Pollinations (GPT-5.4 Nano) for typical food prices in that
// district, validate the answer, and turn it into price records.
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
    // Billing or auth failures affect every district: let the driver stop the run.
    if (err.status === 401 || err.status === 402 || err.status === 403) throw err;
    errors.push(`pollinations: ${err.message}`);
  }
  const posts = collected.map((x) =>
    buildPostFromExtraction({
      item: x.item,
      priceItem: x.priceItem,
      price: x.price,
      basis: x.basis,
      fetchedAt,
    })
  );
  return { posts, found: collected.length, errors, diagnostics };
}
