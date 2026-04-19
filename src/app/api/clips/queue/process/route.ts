import { NextResponse } from "next/server";
import path from "node:path";
import { mkdir, stat } from "node:fs/promises";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/admin";
import { ffmpegAvailable, isHosted } from "@/lib/environment";
import { getClipPlatform, type ClipPlatformId } from "@/lib/clip-platforms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RenderRequestClip = {
  start_time: number;
  end_time: number;
  background_video: string;
  recitation_audio?: string;
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
  recitation_audio?: string;
  watermark?: string | null;
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

export async function POST() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  if (isHosted()) {
    return NextResponse.json(
      {
        error:
          "Queue processing runs on your local Studio. Open this page locally to render.",
      },
      { status: 400 }
    );
  }

  if (!ffmpegAvailable()) {
    return NextResponse.json(
      {
        error:
          "ffmpeg/GPU not available. Install locally to process the queue.",
      },
      { status: 501 }
    );
  }

  const db = createClient();
  const { data: batches, error } = await db
    .from("clip_batch")
    .select("id,name,payload")
    .eq("status", "queued")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!batches || batches.length === 0) {
    return NextResponse.json({ processed: 0, batches: [] });
  }

  const { renderClip } = await import("@/lib/clip-renderer");
  const rendersDir = path.resolve(process.cwd(), RENDERS_DIR);
  await mkdir(rendersDir, { recursive: true });

  const summaries: Array<{
    batch_id: string;
    ok: boolean;
    results?: Array<{ output: string; ok: boolean; error?: string }>;
    error?: string | null;
  }> = [];

  for (const batch of batches) {
    const payload = (batch.payload || null) as RenderRequest | null;
    if (!payload || !Array.isArray(payload.clips) || payload.clips.length === 0) {
      await db
        .from("clip_batch")
        .update({
          status: "error",
          error: "Missing queued payload",
          processed_at: new Date().toISOString(),
        })
        .eq("id", batch.id);
      summaries.push({
        batch_id: batch.id,
        ok: false,
        error: "Missing queued payload",
      });
      continue;
    }

    await db.from("clip_batch").update({ status: "rendering" }).eq("id", batch.id);

    const results: Array<{
      output: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const clip of payload.clips) {
      const outName = clip.output_name.endsWith(".mp4")
        ? clip.output_name
        : `${clip.output_name}.mp4`;
      const outPath = path.join(rendersDir, outName);
      try {
        if (!(await exists(clip.background_video))) {
          throw new Error(`Background video not found: ${clip.background_video}`);
        }
        const recitation = clip.recitation_audio || payload.recitation_audio;
        if (!recitation) {
          throw new Error(
            `Clip ${clip.output_name}: no recitation_audio (set per-clip or batch default)`
          );
        }
        if (!(await exists(recitation))) {
          throw new Error(`Recitation audio not found: ${recitation}`);
        }
        const platform = getClipPlatform(clip.platform || payload.platform);
        await renderClip({
          backgroundVideo: clip.background_video,
          recitationAudio: recitation,
          subtitles: clip.subtitles,
          watermarkPath: payload.watermark || null,
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
    await db
      .from("clip_batch")
      .update({
        status: allOk ? "completed" : "error",
        results,
        processed_at: new Date().toISOString(),
        error: allOk ? null : results.find((r) => !r.ok)?.error || null,
      })
      .eq("id", batch.id);

    summaries.push({
      batch_id: batch.id,
      ok: allOk,
      results,
      error: allOk ? null : results.find((r) => !r.ok)?.error || null,
    });
  }

  return NextResponse.json({
    processed: summaries.length,
    batches: summaries,
  });
}
