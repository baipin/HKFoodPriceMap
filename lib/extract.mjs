// Structured post records and per-district statistics from search-based extraction.
// Pure functions only (no network), so they can be unit-tested.

// Human-readable source label from a result URL. Social media is labelled but
// its content is only the search snippet (we do not fetch pages).
const LABELS = [
  ["facebook.com", "Facebook"],
  ["xiaohongshu.com", "小红书"],
  ["xhslink.com", "小红书"],
  ["hk01.com", "HK01"],
  ["stheadline.com", "星島"],
  ["hkcd.com.hk", "香港商報"],
  ["ufood.com.hk", "UFood"],
  ["i-cable.com", "i-CABLE"],
  ["openrice.com", "OpenRice"],
  ["discuss.com.hk", "連登"],
  ["babydiscuss.com", "Babydiscuss"],
];

export function sourceLabel(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [domain, label] of LABELS) {
    if (host === domain || host.endsWith("." + domain)) return label;
  }
  return host.replace(/^www\./, "");
}

// Price sanity range for a single per-person price in HKD.
export const MIN_PRICE = 20;
export const MAX_PRICE = 2000;

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

// Build a price record from one validated AI extraction (see lib/llm.mjs).
// The AI gives typical prices of food items, not restaurants, so `priceItem` is the item
// (e.g. 叉燒兩餸飯) and there is no restaurant name.
export function buildPostFromExtraction({ item, priceItem, price, basis, fetchedAt }) {
  return {
    url: item.link || "",
    source: item.source,
    title: item.title.slice(0, 200),
    priceItem: priceItem || "",
    restaurant: "",
    priceBasis: basis || "",
    prices: [price],
    perPerson: price,
    excerpt: item.snippet.slice(0, 220),
    category: item.category || "",
    fetchedAt,
  };
}

// Merge new posts into existing ones, de-duplicated by URL, newest first, capped.
export function mergePosts(existing = [], incoming = [], cap = 200) {
  const byUrl = new Map();
  for (const p of [...incoming, ...existing]) {
    const key = p.url || `${p.category}|${p.priceItem}|${p.perPerson}`;
    if (!byUrl.has(key)) byUrl.set(key, p);
  }
  return [...byUrl.values()]
    .sort((a, b) => (b.fetchedAt || "").localeCompare(a.fetchedAt || ""))
    .slice(0, cap);
}
