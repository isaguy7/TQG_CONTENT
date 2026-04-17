import { NextRequest, NextResponse } from "next/server";
import { createDraft } from "@/lib/typefully";
import { convertPlatform, claudeAvailable } from "@/lib/claude-api";
import {
  linkedinToX,
  linkedinToInstagram,
} from "@/lib/platform-convert";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "single" | "multi" | "clip";

export async function POST(req: NextRequest) {
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

  // Stamp first successful draft URL on the post for traceability.
  if (body.post_id) {
    const first = drafts.find((d) => d.available && d.shareUrl);
    if (first) {
      const db = getSupabaseServer();
      const { data: existing } = await db
        .from("posts")
        .select("performance")
        .eq("id", body.post_id)
        .maybeSingle();
      const mergedPerf = {
        ...((existing?.performance as Record<string, unknown>) || {}),
        typefully_share_url: first.shareUrl,
      };
      await db
        .from("posts")
        .update({
          status: "scheduled",
          updated_at: new Date().toISOString(),
          performance: mergedPerf,
        })
        .eq("id", body.post_id);
    }
  }

  return NextResponse.json({ drafts });
}
