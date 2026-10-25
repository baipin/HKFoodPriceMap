// Read / write the public data files that the static site renders.
//   data/districts.json  - per-district stats + recent posts (served to the browser)
//   data/usage.json      - credit ledger (never shown to the browser)
import { promises as fs } from "node:fs";
import path from "node:path";
import { DISTRICTS } from "./districts.mjs";
import { districtStats, mergePosts } from "./extract.mjs";

export const DATA_DIR = path.resolve(process.cwd(), "data");
export const DISTRICTS_FILE = path.join(DATA_DIR, "districts.json");
export const USAGE_FILE = path.join(DATA_DIR, "usage.json");
export const SEEDS_FILE = path.join(DATA_DIR, "seeds.json");

export function emptyDb(now = new Date()) {
  return {
    generatedAt: now.toISOString(),
    status: "empty",
    districts: Object.fromEntries(
      DISTRICTS.map((d) => [
        d.id,
        {
          id: d.id,
          zh: d.zh,
          en: d.en,
          lat: d.lat,
          lng: d.lng,
          avgPerPerson: null,
          medianPerPerson: null,
          priceSamples: 0,
          postCount: 0,
          updatedAt: null,
          posts: [],
        },
      ])
    ),
  };
}

// Merge one district crawl result into the database. Pure (returns new object).
export function applyCrawlResult(db, districtId, result, now = new Date()) {
  const prev = db.districts[districtId];
  if (!prev) throw new Error(`Unknown district ${districtId}`);
  const posts = mergePosts(prev.posts, result.posts || []);
  const stats = districtStats(posts);
  const next = {
    ...db,
    generatedAt: now.toISOString(),
    status: "ok",
    districts: {
      ...db.districts,
      [districtId]: {
        ...prev,
        ...stats,
        updatedAt: result.posts?.length ? now.toISOString() : prev.updatedAt,
        posts,
      },
    },
  };
  return next;
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

export async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}
