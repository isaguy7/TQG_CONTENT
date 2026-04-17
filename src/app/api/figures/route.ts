import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getSupabaseServer();
  const { data: figures, error } = await db
    .from("islamic_figures")
    .select(
      "id,name_en,name_ar,title,type,era,bio_short,themes,quran_refs,posts_written,last_posted_at"
    )
    .order("name_en", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const figuresList = figures || [];
  const ids = figuresList.map((f) => f.id);

  const counts: Record<string, { hadith: number; quran: number }> = {};
  for (const id of ids) counts[id] = { hadith: 0, quran: 0 };

  if (ids.length > 0) {
    const [{ data: hadithRows }, { data: quranRows }] = await Promise.all([
      db.from("figure_hadith_refs").select("figure_id").in("figure_id", ids),
      db.from("figure_quran_refs").select("figure_id").in("figure_id", ids),
    ]);
    for (const r of hadithRows || []) {
      const bucket = counts[r.figure_id as string];
      if (bucket) bucket.hadith += 1;
    }
    for (const r of quranRows || []) {
      const bucket = counts[r.figure_id as string];
      if (bucket) bucket.quran += 1;
    }
  }

  return NextResponse.json({
    figures: figuresList.map((f) => ({
      ...f,
      hadith_ref_count: counts[f.id]?.hadith ?? 0,
      quran_ref_count: counts[f.id]?.quran ?? 0,
    })),
  });
}
