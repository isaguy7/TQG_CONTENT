import { getSupabaseServer } from "@/lib/supabase";

export type OAuthPlatform = "linkedin" | "x";

export type OAuthConnection = {
  id: string;
  user_id: string;
  platform: OAuthPlatform;
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

export async function getConnection(
  userId: string,
  platform: OAuthPlatform
): Promise<OAuthConnection | null> {
  const db = getSupabaseServer();
  const { data } = await db
    .from("oauth_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("platform", platform)
    .maybeSingle();
  return (data as OAuthConnection) || null;
}

export async function listConnections(
  userId: string
): Promise<OAuthConnection[]> {
  const db = getSupabaseServer();
  const { data } = await db
    .from("oauth_connections")
    .select("*")
    .eq("user_id", userId);
  return ((data as OAuthConnection[]) || []).sort((a, b) =>
    a.platform.localeCompare(b.platform)
  );
}

export async function markConnectionStatus(
  id: string,
  status: OAuthConnection["status"]
): Promise<void> {
  const db = getSupabaseServer();
  await db
    .from("oauth_connections")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function revokeConnection(
  userId: string,
  platform: OAuthPlatform
): Promise<void> {
  const db = getSupabaseServer();
  await db
    .from("oauth_connections")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("platform", platform);
}
