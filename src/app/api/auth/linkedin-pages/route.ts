import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  getConnection,
  markConnectionStatus,
} from "@/lib/oauth-connections";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACLS_ENDPOINT =
  "https://api.linkedin.com/v2/organizationalEntityAcls" +
  "?q=roleAssignee&role=ADMINISTRATOR" +
  "&projection=(elements*(organizationalTarget~" +
  "(localizedName,vanityName,logoV2(original~:playableStreams))))";

type AclElement = {
  "organizationalTarget~"?: {
    id?: number | string;
    localizedName?: string;
    vanityName?: string;
    logoV2?: unknown;
  };
  organizationalTarget?: string;
};

type AclResponse = { elements?: AclElement[] };

type LinkedInPage = {
  organization_id: string;
  name: string;
  vanity_name: string | null;
  urn: string;
  connected: boolean;
  connection_id?: string;
};

/**
 * GET /api/auth/linkedin-pages
 * Returns the list of LinkedIn Pages the signed-in member administers,
 * plus a `connected` flag indicating whether we already have an
 * organization-type oauth_connection row for each Page.
 */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const conn = await getConnection(auth.user.id, "linkedin", "personal");
  if (!conn || conn.status !== "active") {
    return NextResponse.json(
      { error: "LinkedIn not connected", needsReauth: true },
      { status: 400 }
    );
  }

  const res = await fetch(ACLS_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    await markConnectionStatus(conn.id, "expired");
    return NextResponse.json(
      {
        error:
          "LinkedIn rejected the token. Reconnect and grant the Pages scopes.",
        needsReauth: true,
      },
      { status: 401 }
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return NextResponse.json(
      {
        error: `LinkedIn ${res.status}: ${body.slice(0, 300)}`,
      },
      { status: 502 }
    );
  }

  const data = (await res.json().catch(() => ({}))) as AclResponse;
  const db = getSupabaseServer();
  const { data: existingRows } = await db
    .from("oauth_connections")
    .select("id,account_id,status")
    .eq("user_id", auth.user.id)
    .eq("platform", "linkedin")
    .eq("account_type", "organization");
  const existing = new Map<string, { id: string; active: boolean }>();
  for (const r of (existingRows as Array<{
    id: string;
    account_id: string;
    status: string;
  }>) || []) {
    existing.set(r.account_id, { id: r.id, active: r.status === "active" });
  }

  const pages: LinkedInPage[] = [];
  for (const el of data.elements || []) {
    const target = el["organizationalTarget~"];
    // Historically the id sits on the expanded target object. The
    // organizationalTarget string ("urn:li:organization:12345") is a
    // reliable fallback.
    let orgId: string | null = null;
    if (target?.id != null) orgId = String(target.id);
    else if (typeof el.organizationalTarget === "string") {
      const m = el.organizationalTarget.match(/urn:li:organization:(\d+)/);
      orgId = m ? m[1] : null;
    }
    if (!orgId) continue;
    const match = existing.get(orgId);
    pages.push({
      organization_id: orgId,
      name: target?.localizedName || "LinkedIn Page",
      vanity_name: target?.vanityName || null,
      urn: `urn:li:organization:${orgId}`,
      connected: !!(match && match.active),
      connection_id: match?.id,
    });
  }

  return NextResponse.json({ pages });
}

/**
 * POST /api/auth/linkedin-pages
 * Body: { organization_id: string, name: string }
 * Persists a second oauth_connections row (account_type='organization')
 * that reuses the same access token — LinkedIn's UGC API accepts the
 * member's token when posting as an organisation the member administers.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: { organization_id?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgId = body.organization_id?.toString().trim();
  const name = body.name?.toString().trim() || "LinkedIn Page";
  if (!orgId || !/^\d+$/.test(orgId)) {
    return NextResponse.json(
      { error: "Missing or invalid organization_id" },
      { status: 400 }
    );
  }

  const personal = await getConnection(auth.user.id, "linkedin", "personal");
  if (!personal || personal.status !== "active") {
    return NextResponse.json(
      { error: "LinkedIn not connected", needsReauth: true },
      { status: 400 }
    );
  }

  const db = getSupabaseServer();
  const { error } = await db.from("oauth_connections").upsert(
    {
      user_id: auth.user.id,
      platform: "linkedin",
      account_type: "organization",
      account_id: orgId,
      account_name: name,
      access_token: personal.access_token,
      refresh_token: personal.refresh_token,
      token_expires_at: personal.token_expires_at,
      scopes: personal.scopes,
      metadata: { organization_urn: `urn:li:organization:${orgId}` },
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,platform,account_type,account_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
