import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

async function commandVersion(
  command: string
): Promise<{ available: boolean; version?: string; error?: string }> {
  try {
    const { stdout } = await execAsync(command, { timeout: 4000 });
    const version =
      stdout.split("\n").find((l) => l.trim().length > 0)?.trim() || null;
    return { available: true, version: version || undefined };
  } catch (err) {
    return { available: false, error: (err as Error).message };
  }
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || null;
  const supabaseServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const typefullyKey = !!process.env.TYPEFULLY_API_KEY;
  const unsplashKey = !!process.env.UNSPLASH_ACCESS_KEY;

  const whisperModel = process.env.WHISPER_MODEL || "large-v3";
  const whisperDevice = process.env.WHISPER_DEVICE || "cuda";
  const whisperBatchSize = process.env.WHISPER_BATCH_SIZE || "16";

  const [ytdlp, ffmpeg] = await Promise.all([
    commandVersion("yt-dlp --version"),
    commandVersion("ffmpeg -version"),
  ]);

  return NextResponse.json({
    supabase: {
      connected: !!(supabaseUrl && supabaseServiceRole),
      url: supabaseUrl,
    },
    anthropic: {
      connected: anthropicKey,
      model: anthropicKey ? "claude-sonnet-4-20250514" : null,
      cap_usd: Number(process.env.API_MONTHLY_CAP || "5"),
    },
    typefully: { connected: typefullyKey },
    unsplash: { connected: unsplashKey },
    whisper: {
      model: whisperModel,
      device: whisperDevice,
      batch_size: Number(whisperBatchSize),
    },
    ytdlp: {
      available: ytdlp.available,
      version: ytdlp.version || null,
    },
    ffmpeg: {
      available: ffmpeg.available,
      version: ffmpeg.version?.replace(/^ffmpeg version\s+/, "") || null,
    },
  });
}
