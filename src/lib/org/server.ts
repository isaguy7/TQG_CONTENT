// Server-only org helpers. Uses the session-scoped Supabase client (cookies).
// Never import from a Client Component.
import { createClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/types/org";

export class AuthError extends Error {
  readonly code = "AUTH_REQUIRED" as const;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthError";
  }
}

export class OrgError extends Error {
  readonly code = "ORG_FORBIDDEN" as const;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "OrgError";
  }
}

const ROLE_RANK: Record<OrgRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

export async function getActiveOrgId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  const { data } = await supabase
    .from("user_profiles")
    .select("active_organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return (data?.active_organization_id as string | null) ?? null;
}

export interface RequireRoleResult {
  userId: string;
  organizationId: string;
  role: OrgRole;
}

export async function requireRole(
  required: OrgRole,
  opts?: { organizationId?: string }
): Promise<RequireRoleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  let organizationId = opts?.organizationId;
  if (!organizationId) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("active_organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const activeId = profile?.active_organization_id as string | null | undefined;
    if (!activeId) throw new OrgError("No active organization");
    organizationId = activeId;
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) throw new OrgError("Not a member of this organization");

  const actualRole = member.role as OrgRole;
  if (ROLE_RANK[actualRole] < ROLE_RANK[required]) {
    throw new OrgError(`Requires ${required}, have ${actualRole}`);
  }

  return { userId: user.id, organizationId, role: actualRole };
}
