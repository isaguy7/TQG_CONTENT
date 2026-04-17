import { NextRequest, NextResponse } from "next/server";
import { generateHooks } from "@/lib/claude-api";
import { getSupabaseServer } from "@/lib/supabase";
import type { FigureContext } from "@/lib/system-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: {
    post_id?: string;
    topic?: string | null;
    transcript?: string | null;
    platform?: string | null;
    figure?: FigureContext | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // If post_id given, auto-load figure context and platform from the post.
  let figure: FigureContext | null = body.figure || null;
  let platform = body.platform;
  let topic = body.topic;
  if (body.post_id) {
    const db = getSupabaseServer();
    const { data: post } = await db
      .from("posts")
      .select("title, platform, figure_id, transcript")
      .eq("id", body.post_id)
      .maybeSingle();
    if (post) {
      if (!platform) platform = post.platform;
      if (!topic) topic = post.title;
      if (!body.transcript && post.transcript) body.transcript = post.transcript;
      if (!figure && post.figure_id) {
        const { data: f } = await db
          .from("islamic_figures")
          .select("name_en,name_ar,title,bio_short,themes,notable_events")
          .eq("id", post.figure_id)
          .maybeSingle();
        if (f) {
          figure = {
            nameEn: f.name_en,
            nameAr: f.name_ar,
            title: f.title,
            bioShort: f.bio_short,
            themes: f.themes,
            notableEvents: f.notable_events,
          };
        }
      }
    }
  }

  try {
    const result = await generateHooks({
      figure,
      topic,
      transcript: body.transcript || null,
      platform,
      postId: body.post_id || null,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { available: false, reason: (err as Error).message },
      { status: 500 }
    );
  }
}
