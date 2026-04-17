import { NextResponse } from "next/server";
import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { isHosted } from "@/lib/environment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECITATIONS_DIR = process.env.RECITATIONS_DIR || "./recitations";
const BACKGROUNDS_DIR = process.env.BACKGROUNDS_DIR || "./backgrounds";

const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".opus", ".flac"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".mkv", ".webm"]);

async function listFiles(
  dir: string,
  allowed: Set<string>
): Promise<Array<{ name: string; path: string; size: number }>> {
  const abs = path.resolve(process.cwd(), dir);
  try {
    const entries = await readdir(abs);
    const out: Array<{ name: string; path: string; size: number }> = [];
    for (const name of entries) {
      const ext = path.extname(name).toLowerCase();
      if (!allowed.has(ext)) continue;
      const full = path.join(abs, name);
      try {
        const s = await stat(full);
        if (s.isFile()) out.push({ name, path: full, size: s.size });
      } catch {
        // ignore
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function GET() {
  if (isHosted()) {
    return NextResponse.json({
      recitations: [],
      backgrounds: [],
      recitations_dir: "(hosted — local folders unavailable)",
      backgrounds_dir: "(hosted — local folders unavailable)",
      hosted: true,
    });
  }
  const [recitations, backgrounds] = await Promise.all([
    listFiles(RECITATIONS_DIR, AUDIO_EXT),
    listFiles(BACKGROUNDS_DIR, VIDEO_EXT),
  ]);
  return NextResponse.json({
    recitations,
    backgrounds,
    recitations_dir: path.resolve(process.cwd(), RECITATIONS_DIR),
    backgrounds_dir: path.resolve(process.cwd(), BACKGROUNDS_DIR),
  });
}
