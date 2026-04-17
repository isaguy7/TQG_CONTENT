import { NextResponse } from "next/server";
import {
  ffmpegAvailable,
  gpuAvailable,
  isHosted,
  ytdlpAvailable,
} from "@/lib/environment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    hosted: isHosted(),
    gpu: gpuAvailable(),
    ffmpeg: ffmpegAvailable(),
    ytdlp: ytdlpAvailable(),
    mode: isHosted() ? "cloud" : "local",
  });
}
