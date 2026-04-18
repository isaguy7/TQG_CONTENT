/**
 * X (Twitter) v2 tweet posting using the OAuth2 user access token captured
 * during Supabase OAuth login. Requires `tweet.write` scope.
 */
import {
  getConnection,
  markConnectionStatus,
  type OAuthConnection,
} from "@/lib/oauth-connections";

const TWEETS_ENDPOINT = "https://api.x.com/2/tweets";
const X_TWEET_LIMIT = 280;

export type PostResult =
  | { success: true; tweetId: string; permalink?: string | null }
  | { success: false; error: string; needsReauth?: boolean };

export async function postToX(
  userId: string,
  content: string
): Promise<PostResult> {
  const conn = await getConnection(userId, "x");
  if (!conn || conn.status !== "active") {
    return {
      success: false,
      error: "X not connected. Sign in with X first.",
      needsReauth: true,
    };
  }
  if (isExpired(conn)) {
    await markConnectionStatus(conn.id, "expired");
    return {
      success: false,
      error: "X token expired. Please sign in again.",
      needsReauth: true,
    };
  }

  const text = content.length > X_TWEET_LIMIT
    ? content.slice(0, X_TWEET_LIMIT)
    : content;

  const res = await fetch(TWEETS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 401) {
      await markConnectionStatus(conn.id, "expired");
      return {
        success: false,
        error: "X token rejected. Please sign in again.",
        needsReauth: true,
      };
    }
    return {
      success: false,
      error: `X ${res.status}: ${err.slice(0, 300)}`,
    };
  }

  const data = (await res.json().catch(() => ({}))) as {
    data?: { id?: string };
  };
  const id = data.data?.id || "";
  const permalink = id
    ? `https://x.com/${conn.account_name || "i"}/status/${id}`
    : null;
  return { success: true, tweetId: id, permalink };
}

function isExpired(conn: OAuthConnection): boolean {
  if (!conn.token_expires_at) return false;
  return new Date(conn.token_expires_at).getTime() <= Date.now();
}
