import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  listConnections,
  revokeConnection,
  type OAuthPlatform,
} from "@/lib/oauth-connections";

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
        platform: c.platform,
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
  if (platform !== "linkedin" && platform !== "x") {
    return NextResponse.json(
      { error: "Missing or invalid 'platform'" },
      { status: 400 }
    );
  }
  await revokeConnection(auth.user.id, platform as OAuthPlatform);
  return NextResponse.json({ ok: true });
}
