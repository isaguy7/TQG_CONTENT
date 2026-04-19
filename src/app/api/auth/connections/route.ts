import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  listConnections,
  revokeConnection,
  revokeConnectionById,
  type OAuthPlatform,
} from "@/lib/oauth-connections";
import { createClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const conns = await listConnections(auth.user.id);
  const now = Date.now();

  return NextResponse.json({
    connections: conns.map((c) => {
      const expired = c.token_expires_at
        ? new Date(c.token_expires_at).getTime() <= now
        : false;
      return {
        id: c.id,
        platform: c.platform,
        account_type: c.account_type,
        account_name: c.account_name,
        account_id: c.account_id,
        status: expired && c.status === "active" ? "expired" : c.status,
        token_expires_at: c.token_expires_at,
        scopes: c.scopes,
        avatar_url:
          (c.metadata && (c.metadata.avatar_url as string | undefined)) || null,
        connected_at: c.created_at,
      };
    }),
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const platform = req.nextUrl.searchParams.get("platform");
  const connectionId = req.nextUrl.searchParams.get("id");

  // If the caller passes ?id=… we only drop that one row — used to
  // disconnect a single LinkedIn Page without killing the personal login.
  if (connectionId) {
    const db = createClient();
    const { data } = await db
      .from("oauth_connections")
      .select("id,user_id")
      .eq("id", connectionId)
      .maybeSingle();
    if (!data || data.user_id !== auth.user.id) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }
    await revokeConnectionById(connectionId);
    return NextResponse.json({ ok: true });
  }

  if (platform !== "linkedin" && platform !== "x") {
    return NextResponse.json(
      { error: "Missing or invalid 'platform'" },
      { status: 400 }
    );
  }
  await revokeConnection(auth.user.id, platform as OAuthPlatform);
  return NextResponse.json({ ok: true });
}
