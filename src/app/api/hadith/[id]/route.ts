import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("hadith_verifications")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ hadith: data });
}

/**
 * PATCH /api/hadith/[id] — update verification status or notes.
 * Toggling verified=true is the manual human decision that unlocks
 * posts from the publish gate.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  let body: {
    verified?: boolean;
    verification_notes?: string | null;
    reference_text?: string;
    narrator?: string | null;
    grade?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.verified === "boolean") {
    update.verified = body.verified;
    update.verified_at = body.verified ? new Date().toISOString() : null;
  }
  if (body.verification_notes !== undefined) {
    update.verification_notes = body.verification_notes;
  }
  if (body.reference_text !== undefined) {
    update.reference_text = body.reference_text;
  }
  if (body.narrator !== undefined) update.narrator = body.narrator;
  if (body.grade !== undefined) update.grade = body.grade;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("hadith_verifications")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ hadith: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const db = getSupabaseServer();
  const { error } = await db
    .from("hadith_verifications")
    .delete()
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
