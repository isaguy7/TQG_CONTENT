import { NextResponse } from "next/server";
import { claudeAvailable, getUsageBreakdown } from "@/lib/claude-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const breakdown = await getUsageBreakdown();
  return NextResponse.json({
    available: claudeAvailable(),
    ...breakdown,
  });
}
