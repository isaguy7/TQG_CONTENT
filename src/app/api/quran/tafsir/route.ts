import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KNOWN_SLUGS = new Set([
  "en-tafisr-ibn-kathir",
  "en-al-jalalayn",
]);

const SLUG_ALIASES: Record<string, string> = {
  "ibn-kathir": "en-tafisr-ibn-kathir",
  "ibn_kathir": "en-tafisr-ibn-kathir",
  "jalalayn": "en-al-jalalayn",
};

type TafsirResponse = {
  author?: string;
  groupVerse?: string;
  content?: string;
  text?: string;
};

/**
 * GET /api/quran/tafsir?surah=12&ayah=4&tafsir=ibn-kathir
 * Fetches tafsir from the free spa5k/tafsir_api CDN and caches it in
 * tafsir_cache so subsequent lookups are instant.
 */
export async function GET(req: NextRequest) {
  const surahRaw = req.nextUrl.searchParams.get("surah");
  const ayahRaw = req.nextUrl.searchParams.get("ayah");
  const tafsirRaw = req.nextUrl.searchParams.get("tafsir") || "ibn-kathir";
  const slug = SLUG_ALIASES[tafsirRaw] || tafsirRaw;

  const surah = Number(surahRaw);
  const ayah = Number(ayahRaw);
  if (!Number.isFinite(surah) || surah < 1 || surah > 114) {
    return NextResponse.json({ error: "Invalid surah" }, { status: 400 });
  }
  if (!Number.isFinite(ayah) || ayah < 1) {
    return NextResponse.json({ error: "Invalid ayah" }, { status: 400 });
  }
  if (!KNOWN_SLUGS.has(slug)) {
    return NextResponse.json(
      { error: `Unknown tafsir slug '${slug}'` },
      { status: 400 }
    );
  }

  const db = createClient();

  // Cache lookup
  const { data: cached } = await db
    .from("tafsir_cache")
    .select("content,author,group_verse,fetched_at")
    .eq("surah", surah)
    .eq("ayah", ayah)
    .eq("tafsir_slug", slug)
    .maybeSingle();

  if (cached?.content) {
    return NextResponse.json({
      surah,
      ayah,
      tafsir_slug: slug,
      author: cached.author,
      group_verse: cached.group_verse,
      content: cached.content,
      cached: true,
    });
  }

  const url = `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/${slug}/${surah}/${ayah}.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Tafsir CDN returned ${res.status}` },
      { status: 502 }
    );
  }
  const json = (await res.json()) as TafsirResponse;
  const content = json.content || json.text || "";
  const author = json.author || null;
  const groupVerse = json.groupVerse || null;

  if (!content) {
    return NextResponse.json(
      { error: "Tafsir response missing content" },
      { status: 502 }
    );
  }

  // Best-effort cache write
  await db
    .from("tafsir_cache")
    .upsert({
      surah,
      ayah,
      tafsir_slug: slug,
      content,
      author,
      group_verse: groupVerse,
    })
    .select()
    .single()
    .then(() => undefined, () => undefined);

  return NextResponse.json({
    surah,
    ayah,
    tafsir_slug: slug,
    author,
    group_verse: groupVerse,
    content,
    cached: false,
  });
}
