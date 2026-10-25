// Turn Facebook records into structured post records and per-district statistics.
// Pure functions only (no network), so they can be unit-tested.

export const ALLOWED_SOURCES = [{ host: "facebook.com", name: "Facebook" }];

// Price sanity range for a single per-person price in HKD.
export const MIN_PRICE = 20;
export const MAX_PRICE = 2000;

export function sourceFor(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const s of ALLOWED_SOURCES) {
    if (host === s.host || host.endsWith("." + s.host)) return s.name;
  }
  return null;
}

// Find per-person prices (HKD) mentioned in text.
export function extractPrices(text = "") {
  const found = [];
  const patterns = [
    // 人均 $128 / 人均HK$128 / 人均港币128 / 人均:128元
    /人均\s*[:：]?\s*(?:HK\$|HKD|港[幣币]|[$＄])?\s*(\d{2,4})(?!\d)/g,
    // HK$128 人 / $128 per person / 128蚊/位
    /(?:HK\$|HKD|港[幣币]|[$＄])\s*(\d{2,4})(?!\d)\s*(?:\/|每|per)?\s*(?:人|位|pp|per\s*person)/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const v = Number(m[1]);
      if (v >= MIN_PRICE && v <= MAX_PRICE) found.push(v);
    }
  }
  return [...new Set(found)];
}

// Best-effort restaurant name from a post title or body.
export function extractRestaurant(title = "", text = "") {
  const bracket = (title + " " + text).match(/【([^】]{2,30})】/);
  if (bracket) return bracket[1].trim();
  const at = text.match(/(?:📍|地址[:：]?|店名[:：])\s*([^\s#，,。!！]{2,30})/);
  if (at) return at[1].trim();
  const head = title.split(/\s[|｜\-–—]\s/)[0].trim();
  return head.length >= 2 && head.length <= 30 ? head : "";
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// Aggregate posts into the numbers shown on the map.
export function districtStats(posts) {
  const perPerson = posts.map((p) => p.perPerson).filter((v) => v != null);
  if (!perPerson.length) {
    return { avgPerPerson: null, medianPerPerson: null, priceSamples: 0, postCount: posts.length };
  }
  const avg = perPerson.reduce((a, b) => a + b, 0) / perPerson.length;
  return {
    avgPerPerson: Math.round(avg),
    medianPerPerson: median(perPerson),
    priceSamples: perPerson.length,
    postCount: posts.length,
  };
}

// Turn one Bright Data Facebook record into a post. Returns null unless the
// record has Facebook text with at least one per-person price.
export function buildPostFromRecord(rec, fetchedAt) {
  const url = String(rec.url || rec.post_url || rec.input_url || "");
  if (!sourceFor(url)) return null;
  const text = String(rec.content || rec.post_text || rec.text || rec.message || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const prices = extractPrices(text);
  if (!prices.length) return null;
  const title = text.slice(0, 80);
  return {
    url,
    source: "Facebook",
    title,
    restaurant: extractRestaurant(title, text),
    prices,
    perPerson: median(prices),
    excerpt: text.slice(0, 220),
    fetchedAt,
  };
}

// Merge new posts into existing ones, de-duplicated by URL, newest first, capped.
export function mergePosts(existing = [], incoming = [], cap = 200) {
  const byUrl = new Map();
  for (const p of [...incoming, ...existing]) {
    if (!byUrl.has(p.url)) byUrl.set(p.url, p);
  }
  return [...byUrl.values()]
    .sort((a, b) => (b.fetchedAt || "").localeCompare(a.fetchedAt || ""))
    .slice(0, cap);
}
