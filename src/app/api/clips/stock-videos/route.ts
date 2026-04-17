import { NextRequest, NextResponse } from "next/server";
import {
  pexelsAvailable,
  searchPexelsVideos,
  type StockVideo,
} from "@/lib/pexels";
import {
  DEFAULT_QUICK_PICK,
  THEME_QUERIES,
  matchThemes,
  type ThemeCategory,
} from "@/lib/clip-themes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simple in-process cache — 24h TTL per key. Keeps the page snappy and
// conserves Pexels rate limit (200 req/mo on free tier).
type CacheEntry = { at: number; data: StockVideo[] };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 24 * 3600 * 1000;

export async function GET(req: NextRequest) {
  if (!pexelsAvailable()) {
    return NextResponse.json({
      available: false,
      reason:
        "Set PEXELS_API_KEY in .env.local to enable stock-video search. Free tier gives 200 req/month.",
      results: [],
      quick_pick: [],
    });
  }

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const themeText = sp.get("match")?.trim() || "";
  const orientation =
    (sp.get("orientation") as "landscape" | "portrait" | "square" | null) ||
    "square";
  const width = orientation === "portrait" ? 1080 : 1080;
  const height = orientation === "portrait" ? 1920 : 1080;
  const perPage = Math.min(12, Number(sp.get("per_page") ?? "6"));
  const mode = sp.get("mode"); // "quick_pick" → return the 5 default categories

  const fetchOne = async (query: string, key: string) => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
    try {
      const rows = await searchPexelsVideos(query, {
        perPage,
        orientation,
        targetWidth: width,
        targetHeight: height,
      });
      cache.set(key, { at: Date.now(), data: rows });
      return rows;
    } catch (err) {
      return { error: (err as Error).message } as unknown as StockVideo[];
    }
  };

  if (mode === "quick_pick") {
    // Return the five default categories, each with ~3 thumbnails. Cached
    // so subsequent clip adds are instant.
    const results: Array<{
      category: ThemeCategory;
      query: string;
      videos: StockVideo[];
    }> = [];
    for (const cat of DEFAULT_QUICK_PICK) {
      const query = THEME_QUERIES[cat];
      const rows = await fetchOne(
        query,
        `quick:${cat}:${orientation}`
      );
      results.push({
        category: cat,
        query,
        videos: Array.isArray(rows) ? rows.slice(0, 3) : [],
      });
    }
    return NextResponse.json({ available: true, quick_pick: results });
  }

  let query = q;
  let matchedThemes: ThemeCategory[] = [];
  if (!query && themeText) {
    matchedThemes = matchThemes(themeText);
    if (matchedThemes.length > 0) {
      query = THEME_QUERIES[matchedThemes[0]];
    }
  }
  if (!query) {
    return NextResponse.json({
      available: true,
      results: [],
      matched_themes: [],
    });
  }

  const rows = await fetchOne(
    query,
    `search:${query}:${orientation}:${perPage}`
  );
  if (!Array.isArray(rows)) {
    return NextResponse.json(
      { available: true, error: (rows as { error: string }).error },
      { status: 502 }
    );
  }
  return NextResponse.json({
    available: true,
    query,
    matched_themes: matchedThemes,
    results: rows,
  });
}
