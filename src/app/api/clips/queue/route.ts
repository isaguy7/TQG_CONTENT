import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const status = req.nextUrl.searchParams.get("status");
  const db = createClient();
  let query = db
    .from("clip_batch")
    .select("id,name,status,created_at,processed_at,results,error")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(25);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ batches: data || [] });
}
