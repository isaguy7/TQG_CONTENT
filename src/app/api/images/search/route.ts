import { NextRequest, NextResponse } from "next/server";
import { searchUnsplash } from "@/lib/unsplash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const perPageRaw = Number(req.nextUrl.searchParams.get("per_page") ?? "12");
  const perPage = Number.isFinite(perPageRaw)
    ? Math.max(1, Math.min(30, Math.trunc(perPageRaw)))
    : 12;

  const result = await searchUnsplash(q, perPage);
  if (result.error) {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}
