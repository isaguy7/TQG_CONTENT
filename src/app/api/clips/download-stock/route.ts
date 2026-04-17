import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { isHosted } from "@/lib/environment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BACKGROUNDS_DIR = process.env.BACKGROUNDS_DIR || "./backgrounds";

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (isHosted()) {
    return NextResponse.json(
      {
        error:
          "Stock video download writes to the local backgrounds folder and only works on the desktop app.",
      },
      { status: 501 }
    );
  }

  type Body = {
    videos: Array<{
      id: number | string;
      download_url: string;
      credit?: { user: string; source_url: string };
    }>;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.videos) || body.videos.length === 0) {
    return NextResponse.json(
      { error: "videos[] is required" },
      { status: 400 }
    );
  }

  const dir = path.resolve(process.cwd(), BACKGROUNDS_DIR);
  await mkdir(dir, { recursive: true });

  const results: Array<{
    id: number | string;
    path?: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const v of body.videos) {
    const filename = `pexels-${v.id}.mp4`;
    const full = path.join(dir, filename);
    if (await exists(full)) {
      results.push({ id: v.id, path: full, ok: true });
      continue;
    }
    try {
      const res = await fetch(v.download_url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(full, buf);
      results.push({ id: v.id, path: full, ok: true });
    } catch (err) {
      results.push({ id: v.id, ok: false, error: (err as Error).message });
    }
  }

  return NextResponse.json({ results, dir });
}
