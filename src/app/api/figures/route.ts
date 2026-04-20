import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = createClient();
  const { data: figures, error } = await db
    .from("islamic_figures")
    .select(
      "id,slug,name_en,name_ar,title,type,era,bio_short,themes,hook_angles,quran_refs,posts_written,last_posted_at,created_at,updated_at"
    )
    .order("name_en", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const figuresList = figures || [];
  const ids = figuresList.map((f) => f.id);

  const counts: Record<
    string,
    { hadith: number; quran: number; post: number }
  > = {};
  for (const id of ids) counts[id] = { hadith: 0, quran: 0, post: 0 };

  if (ids.length > 0) {
    // Default PostgREST row cap is 1000, so raise it explicitly — a single
    // figure can easily have hundreds of linked hadith. Matching ref-count
    // pattern for post_count: fetch figure_id lists + aggregate in JS.
    // Correlated-subquery via PostgREST FK syntax is noisier to filter
    // by deleted_at; 15-70 figures × ~N posts each is trivial either way.
    const [
      { data: hadithRows },
      { data: quranRows },
      { data: postRows },
    ] = await Promise.all([
      db
        .from("figure_hadith_refs")
        .select("figure_id")
        .in("figure_id", ids)
        .limit(100000),
      db
        .from("figure_quran_refs")
        .select("figure_id")
        .in("figure_id", ids)
        .limit(100000),
      db
        .from("posts")
        .select("figure_id")
        .in("figure_id", ids)
        .is("deleted_at", null)
        .limit(100000),
    ]);
    for (const r of hadithRows || []) {
      const bucket = counts[r.figure_id as string];
      if (bucket) bucket.hadith += 1;
    }
    for (const r of quranRows || []) {
      const bucket = counts[r.figure_id as string];
      if (bucket) bucket.quran += 1;
    }
    for (const r of postRows || []) {
      const bucket = counts[r.figure_id as string];
      if (bucket) bucket.post += 1;
    }
  }

  return NextResponse.json({
    figures: figuresList.map((f) => ({
      ...f,
      hadith_ref_count: counts[f.id]?.hadith ?? 0,
      quran_ref_count: counts[f.id]?.quran ?? 0,
      post_count: counts[f.id]?.post ?? 0,
    })),
  });
}
