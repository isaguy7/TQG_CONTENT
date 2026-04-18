import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { stat, mkdir } from "node:fs/promises";
import { getSupabaseServer } from "@/lib/supabase";
import { getClipPlatform, type ClipPlatformId } from "@/lib/clip-platforms";
import { ffmpegAvailable, isHosted } from "@/lib/environment";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RenderRequestClip = {
  start_time: number;
  end_time: number;
  background_video: string;
  /** Optional: lets each clip pick its own recitation (mixed-batch mode). */
  recitation_audio?: string;
  /** Optional: target platform preset (x, instagram_reels, youtube_shorts, facebook). */
  platform?: ClipPlatformId;
  subtitles: Array<{
    start: number;
    end: number;
    arabic: string;
    english?: string | null;
  }>;
  output_name: string;
};

type RenderRequest = {
  batch_name?: string;
  /** Fallback recitation used by any clip that didn't specify its own. */
  recitation_audio?: string;
  watermark?: string | null;
  /** Default platform preset for clips that don't specify one. */
  platform?: ClipPlatformId;
  clips: RenderRequestClip[];
};

const RENDERS_DIR = process.env.RENDERS_DIR || "./renders";

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: RenderRequest;
  try {
    body = (await req.json()) as RenderRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.clips) || body.clips.length === 0) {
    return NextResponse.json({ error: "Missing clips" }, { status: 400 });
  }
  // Each clip must have either its own recitation or inherit the batch default.
  for (let i = 0; i < body.clips.length; i++) {
    const c = body.clips[i];
    if (!c.recitation_audio && !body.recitation_audio) {
      return NextResponse.json(
        { error: `Clip ${i + 1}: no recitation_audio (set per-clip or batch default)` },
        { status: 400 }
      );
    }
  }

  const db = getSupabaseServer();
  const hosted = isHosted();
  if (!hosted && !ffmpegAvailable()) {
    return NextResponse.json(
      {
        error:
          "Clip rendering requires the local desktop app with GPU access.",
      },
      { status: 501 }
    );
  }

  const { data: batch } = await db
    .from("clip_batch")
    .insert({
      name: body.batch_name || `batch-${new Date().toISOString().slice(0, 16)}`,
      status: hosted ? "queued" : "rendering",
      payload: body,
      user_id: auth.user.id,
    })
    .select()
    .single();

  if (hosted) {
    return NextResponse.json({
      queued: true,
      batch_id: batch?.id || null,
      status: "queued",
    });
  }

  // Dynamic import keeps ffmpeg/spawn out of the Edge bundle on Vercel.
  const { renderClip } = await import("@/lib/clip-renderer");
  const rendersDir = path.resolve(process.cwd(), RENDERS_DIR);
  await mkdir(rendersDir, { recursive: true });

  const results: Array<{
    output: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const clip of body.clips) {
    const outName = clip.output_name.endsWith(".mp4")
      ? clip.output_name
      : `${clip.output_name}.mp4`;
    const outPath = path.join(rendersDir, outName);
    try {
      if (!(await exists(clip.background_video))) {
        throw new Error(`Background video not found: ${clip.background_video}`);
      }
      const recitation = clip.recitation_audio || body.recitation_audio!;
      if (!(await exists(recitation))) {
        throw new Error(`Recitation audio not found: ${recitation}`);
      }
      const platform = getClipPlatform(clip.platform || body.platform);
      await renderClip({
        backgroundVideo: clip.background_video,
        recitationAudio: recitation,
        subtitles: clip.subtitles,
        watermarkPath: body.watermark || null,
        startTime: clip.start_time,
        endTime: clip.end_time,
        outputPath: outPath,
        width: platform.width,
        height: platform.height,
        maxSeconds: platform.maxSeconds,
      });
      results.push({ output: outPath, ok: true });
    } catch (err) {
      results.push({
        output: outPath,
        ok: false,
        error: (err as Error).message,
      });
    }
  }

  const allOk = results.every((r) => r.ok);
  if (batch?.id) {
    await db
      .from("clip_batch")
      .update({
        status: allOk ? "completed" : "error",
        results,
        processed_at: new Date().toISOString(),
        error: allOk ? null : results.find((r) => !r.ok)?.error || null,
      })
      .eq("id", batch.id);
  }

  return NextResponse.json({
    batch_id: batch?.id || null,
    status: allOk ? "completed" : "error",
    results,
  });
}
