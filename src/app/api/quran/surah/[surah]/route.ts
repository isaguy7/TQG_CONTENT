import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { surah: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const surah = Number(params.surah);
  if (!Number.isFinite(surah) || surah < 1 || surah > 114) {
    return NextResponse.json({ error: "Invalid surah number" }, { status: 400 });
  }
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("quran_cache")
    .select("verse_key,surah,ayah,text_uthmani,translation_en")
    .eq("surah", surah)
    .order("ayah", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ayahs: data || [] });
}
