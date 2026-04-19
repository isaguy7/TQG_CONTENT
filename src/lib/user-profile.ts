import { createClient } from "@/lib/supabase/admin";

export type UserRole = "pending" | "member" | "admin" | "rejected";

export type UserProfile = {
  user_id: string;
  display_name: string | null;
  role: UserRole;
  approved_at: string | null;
  approved_by: string | null;
  local_tunnel_url: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Fetch the user_profiles row for a user. Uses the service-role client so
 * it works from middleware (which runs before cookie-bound server clients
 * have a session) and from admin-only routes.
 *
 * Returns null when no row exists — the trigger creates rows on signup,
 * but legacy users predating that trigger won't have one until someone
 * manually inserts.
 */
export async function getUserProfile(
  userId: string
): Promise<UserProfile | null> {
  const db = createClient();
  const { data } = await db
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as UserProfile) || null;
}

export function roleIsApproved(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "member";
}
