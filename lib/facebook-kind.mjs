// Classify a Facebook URL and decide which Bright Data dataset to use.
//
//   post   - a single post                   -> "posts by post URL"  (1 record per URL)
//   group  - a Facebook group                -> "posts by group URL"  (up to LIMIT_PER_INPUT records)
//   page   - a Facebook page or profile      -> "page posts by profile URL" (up to LIMIT_PER_INPUT records)
//
// Dataset IDs come from the Bright Data Facebook Scraper API docs.
export const DATASETS = {
  post: "gd_lyclm1571iy3mv57zw",
  group: "gd_lz11l67o2cb3r0lkj3",
  page: "gd_lkaxegm826bjpoo9m5",
};

// Max posts returned per group/page URL. Also the credit cost of one such URL.
export const LIMIT_PER_INPUT = 10;

const RESERVED = new Set(["groups", "pages", "people", "profile.php", "watch", "share", "events", "marketplace", "photo", "photo.php", "reel", "reels", "story.php", "permalink.php", "hashtag", "search", "login", "sharer"]);

export function classifyUrl(u) {
  let url;
  try {
    url = new URL(String(u));
  } catch {
    return null;
  }
  const path = url.pathname;
  const segs = path.split("/").filter(Boolean);
  // Single post shapes.
  if (
    /\/posts\/[^/]+/.test(path) ||
    /\/permalink\.php/.test(path) ||
    /\/story\.php/.test(path) ||
    /\/photos?\//.test(path) ||
    /\/videos?\//.test(path) ||
    /\/reel\//.test(path) ||
    /\/share\/[pr]\//.test(path) ||
    url.searchParams.has("story_fbid")
  ) {
    return "post";
  }
  if (segs[0] === "groups" && segs[1]) return "group";
  if (segs.length >= 1 && !RESERVED.has(segs[0].toLowerCase())) return "page";
  if (segs[0] === "profile.php" && url.searchParams.get("id")) return "page";
  return null;
}

// Credits charged for one URL of a given kind.
export function creditCost(kind) {
  return kind === "post" ? 1 : LIMIT_PER_INPUT;
}
