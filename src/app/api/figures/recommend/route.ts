import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getSupabaseServer();
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const { data: never } = await db
    .from("islamic_figures")
    .select("id,name_en,name_ar,title,type,themes,last_posted_at,posts_written")
    .is("last_posted_at", null)
    .limit(3);

  const recs: Array<{
    id: string;
    name_en: string;
    name_ar?: string | null;
    title?: string | null;
    type: string;
    themes?: string[] | null;
    reason: string;
  }> = [];

  for (const f of never || []) {
    recs.push({
      id: f.id,
      name_en: f.name_en,
      name_ar: f.name_ar,
      title: f.title,
      type: f.type,
      themes: f.themes,
      reason: "Never posted about.",
    });
    if (recs.length >= 3) break;
  }

  if (recs.length < 3) {
    const { data: stale } = await db
      .from("islamic_figures")
      .select("id,name_en,name_ar,title,type,themes,last_posted_at,posts_written")
      .lt("last_posted_at", cutoff)
      .order("last_posted_at", { ascending: true })
      .limit(3 - recs.length);
    for (const f of stale || []) {
      const days = f.last_posted_at
        ? Math.floor(
            (Date.now() - new Date(f.last_posted_at).getTime()) /
              (24 * 3600 * 1000)
          )
        : 0;
      recs.push({
        id: f.id,
        name_en: f.name_en,
        name_ar: f.name_ar,
        title: f.title,
        type: f.type,
        themes: f.themes,
        reason: `Last posted ${days} days ago.`,
      });
    }
  }

  return NextResponse.json({ recommendations: recs });
}
