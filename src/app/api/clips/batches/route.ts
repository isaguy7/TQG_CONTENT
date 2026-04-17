import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("clip_batch")
    .select("id,name,clip_ids,status,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const batches = (data || []).map((b: { id: string; name: string; clip_ids: string[] | null; status: string; created_at: string }) => ({
    id: b.id,
    name: b.name,
    status: b.status,
    created_at: b.created_at,
    clip_count: Array.isArray(b.clip_ids) ? b.clip_ids.length : 0,
  }));

  const totalClips = batches.reduce((n, b) => n + b.clip_count, 0);
  const lastBatchAt = batches[0]?.created_at || null;

  return NextResponse.json({
    batches,
    stats: { total_clips: totalClips, last_batch_at: lastBatchAt, batch_count: batches.length },
  });
}
