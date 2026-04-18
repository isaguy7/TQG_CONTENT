import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { recordPublished } from "@/lib/gap-alerts";
import { postToLinkedIn } from "@/lib/linkedin-api";
import { postToX } from "@/lib/x-api";
import { isUuid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Platform = "linkedin" | "x";

type PublishItem = {
  platform: Platform;
  content: string;
  image_url?: string | null;
  // LinkedIn only — numeric org URN (e.g. "12345678") when posting as a
  // Page the signed-in member administers. Omit / null for personal.
  as_organization?: string | null;
};

type PerPlatformResult = {
  platform: Platform;
  success: boolean;
  postId?: string | null;
  permalink?: string | null;
  error?: string;
  needsReauth?: boolean;
};

/**
 * POST /api/publish
 * Body:
 *   {
 *     post_id: string,
 *     items: [{ platform: "linkedin"|"x", content: string, image_url?: string }],
 *     schedule_at?: string  // ISO; if present, only marks the post as scheduled
 *   }
 *
 * When schedule_at is present we don't call any provider — we just stamp
 * `scheduled_for` and `status = scheduled` so the post shows on the calendar.
 * When schedule_at is absent we attempt to post to every platform now.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: {
    post_id?: string;
    items?: PublishItem[];
    schedule_at?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.post_id || !isUuid(body.post_id)) {
    return NextResponse.json(
      { error: "Missing or invalid 'post_id'" },
      { status: 400 }
    );
  }
  const items = (body.items || []).filter(
    (i) => (i.platform === "linkedin" || i.platform === "x") && i.content?.trim()
  );
  if (items.length === 0) {
    return NextResponse.json({ error: "No items to publish" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Verify ownership before doing anything destructive.
  const { data: post } = await db
    .from("posts")
    .select("id,performance,status")
    .eq("id", body.post_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // Schedule path — no provider call, just stamp the post.
  if (body.schedule_at) {
    const when = new Date(body.schedule_at);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json(
        { error: "Invalid 'schedule_at'" },
        { status: 400 }
      );
    }
    await db
      .from("posts")
      .update({
        status: "scheduled",
        scheduled_for: when.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.post_id)
      .eq("user_id", auth.user.id);
    return NextResponse.json({
      scheduled: true,
      scheduled_for: when.toISOString(),
      results: items.map((i) => ({
        platform: i.platform,
        success: true,
      })),
    });
  }

  // Publish-now path — fan out to each provider.
  const results: PerPlatformResult[] = [];
  for (const item of items) {
    if (item.platform === "linkedin") {
      const r = await postToLinkedIn(
        auth.user.id,
        item.content,
        item.image_url || null,
        item.as_organization || null
      );
      results.push({
        platform: "linkedin",
        success: r.success,
        postId: r.success ? r.postId : null,
        permalink: r.success ? r.permalink || null : null,
        error: r.success ? undefined : r.error,
        needsReauth: r.success ? undefined : r.needsReauth,
      });
    } else {
      const r = await postToX(auth.user.id, item.content);
      results.push({
        platform: "x",
        success: r.success,
        postId: r.success ? r.tweetId : null,
        permalink: r.success ? r.permalink || null : null,
        error: r.success ? undefined : r.error,
        needsReauth: r.success ? undefined : r.needsReauth,
      });
    }
  }

  const anySuccess = results.some((r) => r.success);
  if (anySuccess) {
    const prevPerf = (post.performance as Record<string, unknown>) || {};
    const directPosts = (prevPerf.direct_posts as Array<Record<string, unknown>>) || [];
    const stamped = results
      .filter((r) => r.success)
      .map((r) => ({
        platform: r.platform,
        post_id: r.postId,
        permalink: r.permalink,
        published_at: new Date().toISOString(),
      }));
    await db
      .from("posts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        performance: {
          ...prevPerf,
          direct_posts: [...directPosts, ...stamped],
        },
      })
      .eq("id", body.post_id)
      .eq("user_id", auth.user.id);
    try {
      await recordPublished(body.post_id);
    } catch {
      // Non-critical — calendar counters can recover next week.
    }
  }

  return NextResponse.json({
    scheduled: false,
    results,
  });
}
