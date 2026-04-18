import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase";
import { getUserProfile } from "@/lib/user-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  action?: "approve" | "reject" | "promote" | "demote";
};

/**
 * PATCH /api/admin/users/[userId]
 * Body: { action: 'approve' | 'reject' | 'promote' | 'demote' }
 *
 * - approve: pending / rejected → member (records approved_by + approved_at)
 * - reject:  any → rejected
 * - promote: member → admin
 * - demote:  admin → member
 *
 * Admin only. An admin can't demote themselves (guards the only-admin case).
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const actorProfile = await getUserProfile(auth.user.id);
  if (actorProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await ctx.params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = body.action;
  if (
    action !== "approve" &&
    action !== "reject" &&
    action !== "promote" &&
    action !== "demote"
  ) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (action === "demote" && userId === auth.user.id) {
    return NextResponse.json(
      { error: "You can't demote yourself — ask another admin." },
      { status: 400 }
    );
  }

  const db = getSupabaseServer();
  const now = new Date().toISOString();
  let update: Record<string, unknown> = { updated_at: now };
  if (action === "approve") {
    update = {
      ...update,
      role: "member",
      approved_at: now,
      approved_by: auth.user.id,
    };
  } else if (action === "reject") {
    update = { ...update, role: "rejected" };
  } else if (action === "promote") {
    update = { ...update, role: "admin", approved_at: now, approved_by: auth.user.id };
  } else if (action === "demote") {
    update = { ...update, role: "member" };
  }

  const { data, error } = await db
    .from("user_profiles")
    .update(update)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ user: data });
}
