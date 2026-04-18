import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type SurahMeta = {
  surah: number;
  name_arabic: string;
  name_english: string;
  name_transliteration: string;
  revelation_place: string | null;
  ayah_count: number;
};

let cache: SurahMeta[] | null = null;

export async function GET() {
  if (cache) {
    return NextResponse.json({ surahs: cache });
  }
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("surah_metadata")
    .select("surah,name_arabic,name_english,name_transliteration,revelation_place,ayah_count")
    .order("surah", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  cache = (data || []) as SurahMeta[];
  return NextResponse.json({ surahs: cache });
}
