import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const db = createClient();
  const status = req.nextUrl.searchParams.get("status");
  const deleted = req.nextUrl.searchParams.get("deleted");
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "") || null;

  let query = db.from("posts").select("*").eq("user_id", auth.user.id);

  if (deleted === "true") {
    query = query
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
  } else {
    query = query
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
  }

  if (status) query = query.eq("status", status);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data || [] });
}

/**
 * POST /api/posts — create a draft. Status=ready is rejected at creation
 * by the DB trigger (see migration 20260416000002_publish_gate.sql).
 * Always create as idea/drafting, attach hadith, verify, then PATCH to ready.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: {
    title?: string;
    platform?: string;
    figure_id?: string | null;
    final_content?: string | null;
    source_url?: string | null;
    transcript?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = createClient();
  const { data, error } = await db
    .from("posts")
    .insert({
      title: body.title || "Untitled draft",
      platform: body.platform || "linkedin",
      figure_id: body.figure_id || null,
      final_content: body.final_content || null,
      source_url: body.source_url || null,
      transcript: body.transcript || null,
      status: "idea",
      user_id: auth.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data }, { status: 201 });
}
