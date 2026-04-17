import { NextRequest, NextResponse } from "next/server";
import { searchEnglishTranslation } from "@/lib/quran-matcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(50, Math.trunc(limitRaw)))
    : 20;
  if (!q) {
    return NextResponse.json({ error: "Missing 'q'" }, { status: 400 });
  }
  const results = await searchEnglishTranslation(q, limit);
  return NextResponse.json({ results });
}
