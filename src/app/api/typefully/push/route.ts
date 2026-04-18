import { NextRequest, NextResponse } from "next/server";
import { createDraft } from "@/lib/typefully";
import { convertPlatform, claudeAvailable } from "@/lib/claude-api";
import {
  linkedinToX,
  linkedinToInstagram,
} from "@/lib/platform-convert";
import { getSupabaseServer } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "single" | "multi" | "clip";

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: {
    post_id?: string;
    mode?: Mode;
    content?: string;
    platform?: string;
    schedule?: string | "next-free-slot" | "now";
    image_url?: string | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode: Mode = body.mode || "single";
  const content = (body.content || "").trim();
  if (!content) {
    return NextResponse.json({ error: "Missing 'content'" }, { status: 400 });
  }

  const drafts: Array<{
    platform: string;
    content: string;
    available: boolean;
    reason?: string;
    draftId?: string | number;
    shareUrl?: string | null;
  }> = [];

  if (mode === "single" || mode === "clip") {
    const prefix =
      mode === "clip" ? "" : ""; // image attachment handled by Typefully's share URL
    const payload = prefix + content;
    const result = await createDraft({
      content: payload,
      schedule_date: body.schedule as string | undefined,
      share: true,
    });
    drafts.push({
      platform: body.platform || "x",
      content: payload,
      available: result.available,
      reason: result.available ? undefined : result.reason,
      draftId: result.available ? result.draft.id : undefined,
      shareUrl: result.available ? result.draft.share_url || null : null,
    });
  } else if (mode === "multi") {
    const variants: Array<{ platform: string; content: string }> = [
      { platform: "linkedin", content },
    ];

    // X variant — Claude if available, else deterministic fallback.
    if (claudeAvailable()) {
      const xResult = await convertPlatform({
        content,
        fromPlatform: "linkedin",
        toPlatform: "x",
        postId: body.post_id || null,
        userId: auth.user.id,
      });
      variants.push({
        platform: "x",
        content: xResult.available ? xResult.converted : linkedinToX(content),
      });
      const igResult = await convertPlatform({
        content,
        fromPlatform: "linkedin",
        toPlatform: "instagram",
        postId: body.post_id || null,
        userId: auth.user.id,
      });
      variants.push({
        platform: "instagram",
        content: igResult.available
          ? igResult.converted
          : linkedinToInstagram(content),
      });
    } else {
      variants.push({ platform: "x", content: linkedinToX(content) });
      variants.push({
        platform: "instagram",
        content: linkedinToInstagram(content),
      });
    }

    for (const v of variants) {
      const result = await createDraft({
        content: v.content,
        schedule_date: body.schedule as string | undefined,
        share: true,
      });
      drafts.push({
        platform: v.platform,
        content: v.content,
        available: result.available,
        reason: result.available ? undefined : result.reason,
        draftId: result.available ? result.draft.id : undefined,
        shareUrl: result.available ? result.draft.share_url || null : null,
      });
    }
  }

  // Stamp successful draft URLs + IDs on the post so the sync endpoint
  // can match Typefully drafts back to our posts.
  if (body.post_id) {
    const successful = drafts.filter((d) => d.available && d.draftId);
    if (successful.length > 0) {
      const db = getSupabaseServer();
      const { data: existing } = await db
        .from("posts")
        .select("performance")
        .eq("id", body.post_id)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      const prevPerf =
        (existing?.performance as Record<string, unknown>) || {};
      const prevIds = Array.isArray(prevPerf.typefully_draft_ids)
        ? (prevPerf.typefully_draft_ids as Array<string | number>)
        : [];
      const newIds = successful
        .map((d) => d.draftId!)
        .filter((id) => !prevIds.includes(id));
      const firstWithUrl = successful.find((d) => d.shareUrl);
      const mergedPerf = {
        ...prevPerf,
        typefully_share_url:
          firstWithUrl?.shareUrl || prevPerf.typefully_share_url || null,
        typefully_draft_ids: [...prevIds, ...newIds],
      };
      await db
        .from("posts")
        .update({
          status: "scheduled",
          updated_at: new Date().toISOString(),
          performance: mergedPerf,
        })
        .eq("id", body.post_id)
        .eq("user_id", auth.user.id);
    }
  }

  return NextResponse.json({ drafts });
}
