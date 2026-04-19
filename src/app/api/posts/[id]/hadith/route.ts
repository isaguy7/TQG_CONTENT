import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

async function ownsPost(
  db: ReturnType<typeof createClient>,
  postId: string,
  userId: string
): Promise<boolean> {
  const { data } = await db
    .from("posts")
    .select("id")
    .eq("id", postId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/**
 * POST /api/posts/[id]/hadith — attach a hadith_verifications row to
 * this post. Body: { hadith_id }. Idempotent.
 */
export async function POST(req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: { hadith_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.hadith_id || !isUuid(body.hadith_id)) {
    return NextResponse.json(
      { error: "Missing or invalid 'hadith_id'" },
      { status: 400 }
    );
  }

  const db = createClient();
  if (!(await ownsPost(db, params.id, auth.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { count } = await db
    .from("post_hadith_refs")
    .select("*", { count: "exact", head: true })
    .eq("post_id", params.id);

  const { error } = await db
    .from("post_hadith_refs")
    .upsert({
      post_id: params.id,
      hadith_id: body.hadith_id,
      position: count || 0,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/posts/[id]/hadith?hadith_id=... — detach a hadith ref.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const hadithId = req.nextUrl.searchParams.get("hadith_id");
  if (!hadithId || !isUuid(hadithId)) {
    return NextResponse.json(
      { error: "Missing or invalid 'hadith_id'" },
      { status: 400 }
    );
  }

  const db = createClient();
  if (!(await ownsPost(db, params.id, auth.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await db
    .from("post_hadith_refs")
    .delete()
    .eq("post_id", params.id)
    .eq("hadith_id", hadithId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
