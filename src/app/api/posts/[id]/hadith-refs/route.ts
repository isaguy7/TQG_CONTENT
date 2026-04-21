import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * /api/posts/[id]/hadith-refs
 *
 * §7 hadith picker attach flow. Keyed on hadith_corpus_id (unlike the
 * legacy /api/posts/[id]/hadith route which takes hadith_verifications.id
 * directly — that route stays alive for the pre-V10 "Attach existing
 * reference" list in AttachedHadithPanel).
 *
 * Attach flow:
 *   1. Caller POSTs { hadith_corpus_id }.
 *   2. Server find-or-creates a hadith_verifications row for
 *      (post.organization_id, hadith_corpus_id) with verified=true
 *      (the corpus-picker path auto-verifies per decision 2026-04-21).
 *   3. Server inserts a post_hadith_refs row with
 *      source='corpus_picker' and position = MAX(position)+1.
 *   4. Server returns { ref, verification, corpus } joined.
 *
 * Detach flow:
 *   DELETE ?ref_id=<hadith_verifications.id> — the junction row's
 *   hadith_id column is the FK to hadith_verifications.id, so ref_id
 *   is the verification id. Matches the legacy route's keying.
 *
 * List flow (GET):
 *   Returns all attached refs for the post, joined to
 *   hadith_verifications + hadith_corpus, sorted by position.
 */

async function fetchPostOwned(
  db: ReturnType<typeof createClient>,
  postId: string,
  userId: string
): Promise<{ id: string; organization_id: string } | null> {
  const { data } = await db
    .from("posts")
    .select("id, organization_id")
    .eq("id", postId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? { id: data.id, organization_id: data.organization_id } : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const db = createClient();
  const post = await fetchPostOwned(db, params.id, auth.user.id);
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Join junction → verification → corpus. PostgREST handles the FK
  // relationships directly via the embedded-select syntax.
  const { data, error } = await db
    .from("post_hadith_refs")
    .select(
      `
      post_id,
      hadith_id,
      position,
      source,
      verification:hadith_verifications!inner (
        id,
        reference_text,
        sunnah_com_url,
        narrator,
        arabic_text,
        translation_en,
        grade,
        verified,
        verification_notes,
        verified_at,
        verified_by,
        hadith_corpus_id,
        organization_id,
        corpus:hadith_corpus (
          id,
          collection,
          collection_name,
          hadith_number,
          chapter_number,
          chapter_title_en,
          arabic_text,
          english_text,
          narrator,
          grade,
          sunnah_com_url,
          in_book_reference
        )
      )
    `
    )
    .eq("post_id", params.id)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten into { ref, verification, corpus } per row. PostgREST returns
  // the embedded select as an object (single FK join), not an array.
  const refs = (data ?? []).map((row) => {
    const v = row.verification as unknown as {
      [key: string]: unknown;
      corpus: unknown;
    };
    const { corpus, ...verification } = v;
    return {
      ref: {
        post_id: row.post_id,
        hadith_id: row.hadith_id,
        position: row.position,
        source: row.source,
      },
      verification,
      corpus: corpus ?? null,
    };
  });

  return NextResponse.json({ refs });
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: { hadith_corpus_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.hadith_corpus_id || !isUuid(body.hadith_corpus_id)) {
    return NextResponse.json(
      { error: "Missing or invalid 'hadith_corpus_id'" },
      { status: 400 }
    );
  }

  const db = createClient();
  const post = await fetchPostOwned(db, params.id, auth.user.id);
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch the corpus row — need its fields for the verification
  // denormalization + to confirm the id actually exists.
  const { data: corpus, error: corpusErr } = await db
    .from("hadith_corpus")
    .select(
      "id, collection, collection_name, hadith_number, chapter_title_en, arabic_text, english_text, narrator, grade, sunnah_com_url, in_book_reference"
    )
    .eq("id", body.hadith_corpus_id)
    .maybeSingle();
  if (corpusErr) {
    return NextResponse.json({ error: corpusErr.message }, { status: 500 });
  }
  if (!corpus) {
    return NextResponse.json(
      { error: "CORPUS_NOT_FOUND", message: "Hadith corpus row not found" },
      { status: 404 }
    );
  }

  // Find-or-create the verification row for (org, corpus). The partial
  // unique index from §7 commit 1 makes this (org, corpus) pair unique.
  const { data: existingVer, error: findErr } = await db
    .from("hadith_verifications")
    .select("*")
    .eq("organization_id", post.organization_id)
    .eq("hadith_corpus_id", corpus.id)
    .maybeSingle();
  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }

  let verification = existingVer;
  if (!verification) {
    const referenceText = `${corpus.collection_name} ${corpus.hadith_number}`;
    const { data: inserted, error: insertErr } = await db
      .from("hadith_verifications")
      .insert({
        reference_text: referenceText,
        sunnah_com_url: corpus.sunnah_com_url,
        narrator: corpus.narrator,
        arabic_text: corpus.arabic_text,
        translation_en: corpus.english_text,
        grade: corpus.grade,
        verified: true,
        verified_at: new Date().toISOString(),
        verified_by: auth.user.id,
        organization_id: post.organization_id,
        hadith_corpus_id: corpus.id,
      })
      .select()
      .single();
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    verification = inserted;
  }

  // Already attached? Return the existing junction row so the UI can
  // treat duplicate-attach as a no-op instead of showing an error.
  const { data: existingRef } = await db
    .from("post_hadith_refs")
    .select("post_id, hadith_id, position, source")
    .eq("post_id", params.id)
    .eq("hadith_id", verification.id)
    .maybeSingle();
  if (existingRef) {
    return NextResponse.json({
      ref: existingRef,
      verification,
      corpus,
      already_attached: true,
    });
  }

  // Next position = MAX(position) + 1. Two-step (SELECT MAX then INSERT)
  // has a tiny race for concurrent attaches; fine for M1 single-user
  // per org, flagged for later if it matters (see REFACTOR_DEBT).
  const { data: maxRow } = await db
    .from("post_hadith_refs")
    .select("position")
    .eq("post_id", params.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (maxRow?.position ?? -1) + 1;

  const { data: ref, error: refErr } = await db
    .from("post_hadith_refs")
    .insert({
      post_id: params.id,
      hadith_id: verification.id,
      position: nextPosition,
      source: "corpus_picker",
    })
    .select("post_id, hadith_id, position, source")
    .single();
  if (refErr) {
    return NextResponse.json({ error: refErr.message }, { status: 500 });
  }

  return NextResponse.json({ ref, verification, corpus }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const refId = req.nextUrl.searchParams.get("ref_id");
  if (!refId || !isUuid(refId)) {
    return NextResponse.json(
      { error: "Missing or invalid 'ref_id'" },
      { status: 400 }
    );
  }

  const db = createClient();
  const post = await fetchPostOwned(db, params.id, auth.user.id);
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Detach only — delete the junction row. The hadith_verifications
  // row is intentionally left alive for reuse / audit / re-attach.
  // Orphan cleanup (deleting verifications when the last reference
  // is removed) is deferred to §9 per REFACTOR_DEBT.md.
  const { data, error } = await db
    .from("post_hadith_refs")
    .delete()
    .eq("post_id", params.id)
    .eq("hadith_id", refId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
