import { createClient } from "@/lib/supabase/admin";

export type OAuthPlatform = "linkedin" | "x";
export type OAuthAccountType = "personal" | "organization";

export type OAuthConnection = {
  id: string;
  user_id: string;
  platform: OAuthPlatform;
  account_type: OAuthAccountType;
  account_id: string;
  account_name: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  metadata: Record<string, unknown> | null;
  status: "active" | "expired" | "revoked";
  created_at: string;
  updated_at: string;
};

/**
 * Look up a single connection for (user, platform, account_type).
 * Defaults to 'personal' because the bulk of internal code — X posts,
 * LinkedIn posts as the signed-in member — targets the personal row.
 */
export async function getConnection(
  userId: string,
  platform: OAuthPlatform,
  accountType: OAuthAccountType = "personal"
): Promise<OAuthConnection | null> {
  const db = createClient();
  const { data } = await db
    .from("oauth_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("account_type", accountType)
    .maybeSingle();
  return (data as OAuthConnection) || null;
}

/**
 * Look up the organization connection for a specific LinkedIn Page (by its
 * organization URN number, e.g. `12345678`). Used by the publish path when
 * the user opts to post as a Page they administer.
 */
export async function getOrgConnection(
  userId: string,
  platform: OAuthPlatform,
  accountId: string
): Promise<OAuthConnection | null> {
  const db = createClient();
  const { data } = await db
    .from("oauth_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("account_type", "organization")
    .eq("account_id", accountId)
    .maybeSingle();
  return (data as OAuthConnection) || null;
}

export async function listConnections(
  userId: string
): Promise<OAuthConnection[]> {
  const db = createClient();
  const { data } = await db
    .from("oauth_connections")
    .select("*")
    .eq("user_id", userId);
  return ((data as OAuthConnection[]) || []).sort((a, b) => {
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
    // Personal first, organization after.
    return a.account_type.localeCompare(b.account_type);
  });
}

export async function markConnectionStatus(
  id: string,
  status: OAuthConnection["status"]
): Promise<void> {
  const db = createClient();
  await db
    .from("oauth_connections")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/**
 * Revoke every connection matching (user, platform). When the user signs
 * out of LinkedIn we want to drop both the personal and the organisation
 * rows — otherwise a stale Page connection would remain.
 */
export async function revokeConnection(
  userId: string,
  platform: OAuthPlatform
): Promise<void> {
  const db = createClient();
  await db
    .from("oauth_connections")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("platform", platform);
}

/**
 * Revoke a single (user, platform, account_type, account_id) row. Used when
 * the user disconnects a specific LinkedIn Page but wants to keep their
 * personal connection active.
 */
export async function revokeConnectionById(id: string): Promise<void> {
  const db = createClient();
  await db
    .from("oauth_connections")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", id);
}
