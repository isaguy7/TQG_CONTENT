/**
 * LinkedIn UGC posting using the access token captured during Supabase
 * OAuth login. The token has the `w_member_social` scope (requested in
 * the login page) and authors posts as the signed-in member — or, when
 * `asOrganization` is provided and the member administers that
 * organisation, as the organisation itself.
 */
import {
  getConnection,
  getOrgConnection,
  markConnectionStatus,
  type OAuthConnection,
} from "@/lib/oauth-connections";

const UGC_ENDPOINT = "https://api.linkedin.com/v2/ugcPosts";

export type PostResult =
  | { success: true; postId: string; permalink?: string | null }
  | { success: false; error: string; needsReauth?: boolean };

export async function postToLinkedIn(
  userId: string,
  content: string,
  imageUrl?: string | null,
  asOrganization?: string | null
): Promise<PostResult> {
  // If asOrganization is supplied we look up the per-Page connection row —
  // it may have a different account_name but reuses the member's token.
  const conn = asOrganization
    ? await getOrgConnection(userId, "linkedin", asOrganization)
    : await getConnection(userId, "linkedin", "personal");

  if (!conn || conn.status !== "active") {
    const target = asOrganization ? "LinkedIn Page" : "LinkedIn";
    return {
      success: false,
      error: `${target} not connected. Sign in with LinkedIn first.`,
      needsReauth: true,
    };
  }

  if (isExpired(conn)) {
    await markConnectionStatus(conn.id, "expired");
    return {
      success: false,
      error: "LinkedIn token expired. Please sign in again.",
      needsReauth: true,
    };
  }

  const author = asOrganization
    ? `urn:li:organization:${asOrganization}`
    : `urn:li:person:${conn.account_id}`;
  const body = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: content },
        shareMediaCategory: imageUrl ? "ARTICLE" : "NONE",
        ...(imageUrl
          ? {
              media: [
                {
                  status: "READY",
                  originalUrl: imageUrl,
                  description: { text: "" },
                  title: { text: "" },
                },
              ],
            }
          : {}),
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const res = await fetch(UGC_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 401) {
      await markConnectionStatus(conn.id, "expired");
      return {
        success: false,
        error: "LinkedIn token rejected. Please sign in again.",
        needsReauth: true,
      };
    }
    return {
      success: false,
      error: `LinkedIn ${res.status}: ${err.slice(0, 300)}`,
    };
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string };
  const postId = data.id || res.headers.get("x-restli-id") || "";
  const permalink = postId
    ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}`
    : null;
  return { success: true, postId, permalink };
}

function isExpired(conn: OAuthConnection): boolean {
  if (!conn.token_expires_at) return false;
  return new Date(conn.token_expires_at).getTime() <= Date.now();
}
