import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase";
import { getUserProfile } from "@/lib/user-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  role: string;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * GET /api/admin/users — list all user_profiles. Admin only.
 * Joins auth.users through the service-role client so we can surface the
 * email address (the app's primary user-facing handle).
 */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const profile = await getUserProfile(auth.user.id);
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getSupabaseServer();
  const { data: profiles } = await db
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false });
  const rows = (profiles as ProfileRow[]) || [];

  // admin.listUsers pulls emails that aren't exposed to the public schema.
  const { data: authList } = await db.auth.admin.listUsers({ perPage: 200 });
  const emails = new Map<string, string | null>();
  for (const u of authList?.users || []) {
    emails.set(u.id, u.email ?? null);
  }

  const users = rows.map((r) => ({
    user_id: r.user_id,
    email: emails.get(r.user_id) ?? null,
    display_name: r.display_name,
    role: r.role,
    approved_at: r.approved_at,
    approved_by: r.approved_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return NextResponse.json({
    users,
    counts: {
      pending: users.filter((u) => u.role === "pending").length,
      member: users.filter((u) => u.role === "member").length,
      admin: users.filter((u) => u.role === "admin").length,
      rejected: users.filter((u) => u.role === "rejected").length,
    },
  });
}
