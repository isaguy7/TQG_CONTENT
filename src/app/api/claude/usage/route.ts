import { NextResponse } from "next/server";
import { claudeAvailable, getUsageBreakdown } from "@/lib/claude-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!claudeAvailable()) {
    return NextResponse.json({
      available: false,
      totalCostUsd: 0,
      capUsd: 0,
      over: false,
      byFeature: {},
      recent: [],
    });
  }
  try {
    const breakdown = await getUsageBreakdown();
    return NextResponse.json({ available: true, ...breakdown });
  } catch (err) {
    return NextResponse.json(
      {
        available: true,
        error: (err as Error).message,
        totalCostUsd: 0,
        capUsd: 0,
        over: false,
        byFeature: {},
        recent: [],
      },
      { status: 200 }
    );
  }
}
