import { NextRequest, NextResponse } from "next/server";
import { matchTranscriptToAyahs } from "@/lib/quran-matcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get("text")?.trim() || "";
  const thresholdRaw = req.nextUrl.searchParams.get("threshold");
  const threshold = thresholdRaw != null ? Number(thresholdRaw) : undefined;
  if (!text) {
    return NextResponse.json({ error: "Missing 'text'" }, { status: 400 });
  }
  try {
    const matches = await matchTranscriptToAyahs(
      text,
      Number.isFinite(threshold) ? (threshold as number) : undefined
    );
    return NextResponse.json({ matches });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
