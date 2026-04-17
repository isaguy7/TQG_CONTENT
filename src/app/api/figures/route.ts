import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = getSupabaseServer();
  const type = req.nextUrl.searchParams.get("type");

  let query = db
    .from("islamic_figures")
    .select(
      "id,name_en,name_ar,title,type,era,bio_short,themes,hook_angles,notable_events,quran_refs,posts_written,last_posted_at"
    )
    .order("name_en", { ascending: true });

  if (type) query = query.eq("type", type);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ figures: data || [] });
}
