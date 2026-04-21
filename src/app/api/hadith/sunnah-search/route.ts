import { NextRequest, NextResponse } from "next/server";
import { searchSunnah } from "@/lib/sunnah-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ results: [] });
  }
  const results = await searchSunnah(q, req.signal, 15);
  return NextResponse.json({ results });
}
