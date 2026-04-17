import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Suggestion = {
  key: string;
  surah: number;
  name_en: string;
  name_ar: string;
  ayah_count: number;
  est_seconds: number;
  best_for: Array<"x" | "instagram_reels" | "youtube_shorts" | "facebook">;
  verse_range: string;
};

// Hand-picked surahs that work well for short-form clips. Duration estimates
// are conservative (~4s per ayah average at a moderate pace).
const CATALOG: Omit<Suggestion, "key">[] = [
  {
    surah: 108,
    name_en: "Al-Kawthar",
    name_ar: "الكوثر",
    ayah_count: 3,
    est_seconds: 10,
    best_for: ["x", "facebook"],
    verse_range: "108:1-3",
  },
  {
    surah: 112,
    name_en: "Al-Ikhlas",
    name_ar: "الإخلاص",
    ayah_count: 4,
    est_seconds: 12,
    best_for: ["x", "facebook"],
    verse_range: "112:1-4",
  },
  {
    surah: 113,
    name_en: "Al-Falaq",
    name_ar: "الفلق",
    ayah_count: 5,
    est_seconds: 14,
    best_for: ["x", "facebook"],
    verse_range: "113:1-5",
  },
  {
    surah: 114,
    name_en: "An-Nas",
    name_ar: "الناس",
    ayah_count: 6,
    est_seconds: 16,
    best_for: ["x", "facebook"],
    verse_range: "114:1-6",
  },
  {
    surah: 1,
    name_en: "Al-Fatiha",
    name_ar: "الفاتحة",
    ayah_count: 7,
    est_seconds: 22,
    best_for: ["instagram_reels", "youtube_shorts"],
    verse_range: "1:1-7",
  },
  {
    surah: 103,
    name_en: "Al-Asr",
    name_ar: "العصر",
    ayah_count: 3,
    est_seconds: 12,
    best_for: ["x", "facebook"],
    verse_range: "103:1-3",
  },
  {
    surah: 99,
    name_en: "Az-Zalzalah",
    name_ar: "الزلزلة",
    ayah_count: 8,
    est_seconds: 28,
    best_for: ["instagram_reels", "youtube_shorts"],
    verse_range: "99:1-8",
  },
  {
    surah: 101,
    name_en: "Al-Qari'ah",
    name_ar: "القارعة",
    ayah_count: 11,
    est_seconds: 35,
    best_for: ["instagram_reels", "youtube_shorts"],
    verse_range: "101:1-11",
  },
  {
    surah: 36,
    name_en: "Ya-Sin (opening)",
    name_ar: "يس",
    ayah_count: 12,
    est_seconds: 55,
    best_for: ["youtube_shorts"],
    verse_range: "36:1-12",
  },
];

export async function GET() {
  const db = getSupabaseServer();

  // Only return suggestions that have Quran data imported; otherwise flag
  // them so the UI can nudge the user toward the importer.
  const surahs = Array.from(new Set(CATALOG.map((s) => s.surah)));
  const { data } = await db
    .from("quran_cache")
    .select("surah")
    .in("surah", surahs);
  const haveData = new Set((data || []).map((r) => r.surah as number));

  const suggestions: Suggestion[] = CATALOG.map((s) => ({
    ...s,
    key: `${s.surah}`,
  }));

  return NextResponse.json({
    suggestions,
    quran_imported: haveData.size > 0,
    surahs_available: Array.from(haveData),
  });
}
