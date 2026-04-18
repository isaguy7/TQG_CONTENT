import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import type { FigureContext } from "@/lib/system-prompt";
import { runAssistantMessage } from "@/lib/claude-api";
import { searchUnsplash } from "@/lib/unsplash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HistoryTurn = { role: "user" | "assistant"; content: string };

type HadithContext = {
  reference_text: string;
  narrator?: string | null;
  translation_en?: string | null;
  arabic_text?: string | null;
};

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: {
    message?: string;
    voice?: "personal" | "tqg";
    post_id?: string;
    draft?: string | null;
    history?: HistoryTurn[];
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.message?.trim()) {
    return NextResponse.json({ error: "Missing 'message'" }, { status: 400 });
  }

  const db = getSupabaseServer();
  let figure: FigureContext | null = null;
  let hadith: HadithContext[] = [];
  let platform: string | null = null;
  let topic: string | null = null;
  let draft = body.draft || null;

  if (body.post_id) {
    const { data: post, error } = await db
      .from("posts")
      .select("title,platform,figure_id,final_content")
      .eq("id", body.post_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (post) {
      platform = post.platform;
      topic = post.title;
      if (!draft) draft = post.final_content;
      if (post.figure_id) {
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
      const { data: refs } = await db
        .from("post_hadith_refs")
        .select(
          `
          position,
          hadith_verifications (
            reference_text,
            narrator,
            translation_en,
            arabic_text
          )
        `
        )
        .eq("post_id", body.post_id)
        .order("position", { ascending: true });
      const hadithRows =
        (refs || []) as unknown as Array<{
          hadith_verifications: HadithContext | null;
        }>;
      hadith = hadithRows
        .map((r) => r.hadith_verifications)
        .filter((h): h is HadithContext => Boolean(h));
    }
  }

  const sanitizedHistory: HistoryTurn[] = Array.isArray(body.history)
    ? body.history
        .slice(-8)
        .filter(
          (h) =>
            h &&
            (h.role === "user" || h.role === "assistant") &&
            typeof h.content === "string"
        )
        .map((h) => ({ role: h.role, content: h.content.slice(0, 4000) }))
    : [];

  try {
    const result = await runAssistantMessage({
      userMessage: body.message,
      voice: body.voice || "tqg",
      draft,
      platform,
      topic,
      figure,
      hadith,
      history: sanitizedHistory,
      postId: body.post_id || null,
      userId: auth.user.id,
    });

    if (!result.available) {
      return NextResponse.json(result);
    }

    let images: Awaited<ReturnType<typeof searchUnsplash>>["results"] = [];
    if (result.imageQuery) {
      const img = await searchUnsplash(result.imageQuery, 4);
      if (img.available && img.results) {
        images = img.results;
      }
    }

    return NextResponse.json({
      ...result,
      images,
      imageQuery: result.imageQuery || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
