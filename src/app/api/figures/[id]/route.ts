import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const db = getSupabaseServer();

  const [figureRes, postsRes] = await Promise.all([
    db.from("islamic_figures").select("*").eq("id", params.id).single(),
    db
      .from("posts")
      .select("id,title,status,updated_at")
      .eq("figure_id", params.id)
      .order("updated_at", { ascending: false }),
  ]);

  if (figureRes.error) {
    return NextResponse.json({ error: figureRes.error.message }, { status: 404 });
  }

  return NextResponse.json({
    figure: figureRes.data,
    posts: postsRes.data || [],
  });
}
