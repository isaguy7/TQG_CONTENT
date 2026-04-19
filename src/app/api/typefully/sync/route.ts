import { NextResponse } from "next/server";
import {
  listRecentlyPublished,
  listRecentlyScheduled,
  typefullyAvailable,
  type TypefullyDraft,
} from "@/lib/typefully";
import { createClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExtendedDraft = TypefullyDraft & {
  content?: string;
  text?: string;
  platform?: string;
  social_network?: string;
  published_date?: string;
  published_at?: string;
};

/**
 * POST /api/typefully/sync — pulls Typefully's recently-published and
 * recently-scheduled drafts, and upserts local posts to match.
 *
 * Matching strategy (in order):
 *  1. performance.typefully_draft_ids contains Typefully's id.
 *  2. final_content first 200 chars equals the Typefully content first
 *     200 chars (fallback for drafts pushed before we started storing the
 *     id).
 *
 * Only creates a new post when no existing match is found.
 */
export async function POST() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  if (!typefullyAvailable()) {
    return NextResponse.json(
      { available: false, reason: "TYPEFULLY_API_KEY missing" },
      { status: 200 }
    );
  }

  const [pubRes, schRes] = await Promise.all([
    listRecentlyPublished(),
    listRecentlyScheduled(),
  ]);

  const published = pubRes.available ? (pubRes.drafts as ExtendedDraft[]) : [];
  const scheduled = schRes.available ? (schRes.drafts as ExtendedDraft[]) : [];

  const db = createClient();
  const { data: existingPosts } = await db
    .from("posts")
    .select("id,title,final_content,status,platform,performance,published_at")
    .eq("user_id", auth.user.id)
    .is("deleted_at", null);

  const rows = (existingPosts || []) as Array<{
    id: string;
    title: string | null;
    final_content: string | null;
    status: string;
    platform: string;
    performance: Record<string, unknown> | null;
    published_at: string | null;
  }>;

  type Match = (typeof rows)[number];

  const byDraftId = new Map<string, Match>();
  for (const p of rows) {
    const ids = Array.isArray(p.performance?.typefully_draft_ids)
      ? (p.performance!.typefully_draft_ids as Array<string | number>)
      : [];
    for (const id of ids) byDraftId.set(String(id), p);
  }

  const normalize = (text: string | null | undefined) =>
    (text || "").replace(/\s+/g, " ").trim().slice(0, 200).toLowerCase();
  const byContent = new Map<string, Match>();
  for (const p of rows) {
    const key = normalize(p.final_content);
    if (key) byContent.set(key, p);
  }

  const matchDraft = (draft: ExtendedDraft): Match | null => {
    const id = String(draft.id);
    if (byDraftId.has(id)) return byDraftId.get(id)!;
    const text = draft.content || draft.text || "";
    const key = normalize(text);
    if (key && byContent.has(key)) return byContent.get(key)!;
    return null;
  };

  const detectPlatform = (draft: ExtendedDraft): string => {
    const raw = (draft.platform || draft.social_network || "")
      .toString()
      .toLowerCase();
    if (raw.includes("linkedin")) return "linkedin";
    if (raw.includes("twitter") || raw.includes("x")) return "x";
    if (raw.includes("instagram")) return "instagram";
    if (raw.includes("facebook")) return "facebook";
    return "linkedin";
  };

  const addDraftIdToPost = (p: Match, draft: ExtendedDraft) => {
    const prev = (p.performance as Record<string, unknown>) || {};
    const prevIds = Array.isArray(prev.typefully_draft_ids)
      ? (prev.typefully_draft_ids as Array<string | number>)
      : [];
    const id = draft.id;
    if (prevIds.includes(id)) return prev;
    return { ...prev, typefully_draft_ids: [...prevIds, id] };
  };

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const draft of published) {
    const match = matchDraft(draft);
    const text = draft.content || draft.text || "";
    const publishedAt =
      draft.published_date || draft.published_at || new Date().toISOString();
    const platform = detectPlatform(draft);
    if (match) {
      const nextPerf = addDraftIdToPost(match, draft);
      const patch: Record<string, unknown> = {
        performance: nextPerf,
        updated_at: new Date().toISOString(),
      };
      if (match.status !== "published") patch.status = "published";
      if (!match.published_at) patch.published_at = publishedAt;
      if (draft.share_url) {
        (patch.performance as Record<string, unknown>).typefully_share_url =
          draft.share_url;
      }
      await db
        .from("posts")
        .update(patch)
        .eq("id", match.id)
        .eq("user_id", auth.user.id);
      updated += 1;
    } else {
      if (!text.trim()) {
        skipped += 1;
        continue;
      }
      const title = text.split(/\n/, 1)[0].slice(0, 100) || "Imported from Typefully";
      await db.from("posts").insert({
        title,
        platform,
        status: "published",
        final_content: text,
        published_at: publishedAt,
        user_id: auth.user.id,
        performance: {
          typefully_draft_ids: [draft.id],
          typefully_share_url: draft.share_url || null,
          imported_from_typefully: true,
        },
      });
      created += 1;
    }
  }

  for (const draft of scheduled) {
    const match = matchDraft(draft);
    if (!match) continue;
    const nextPerf = addDraftIdToPost(match, draft);
    const patch: Record<string, unknown> = {
      performance: nextPerf,
      updated_at: new Date().toISOString(),
    };
    if (match.status !== "scheduled" && match.status !== "published") {
      patch.status = "scheduled";
    }
    if (draft.scheduled_date) patch.scheduled_for = draft.scheduled_date;
    await db
      .from("posts")
      .update(patch)
      .eq("id", match.id)
      .eq("user_id", auth.user.id);
    updated += 1;
  }

  return NextResponse.json({
    available: true,
    created,
    updated,
    skipped,
    published_fetched: published.length,
    scheduled_fetched: scheduled.length,
    published_error: pubRes.available ? null : pubRes.reason,
    scheduled_error: schRes.available ? null : schRes.reason,
  });
}
