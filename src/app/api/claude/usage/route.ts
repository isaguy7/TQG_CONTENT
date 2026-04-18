import { NextResponse } from "next/server";
import { claudeAvailable, getUsageBreakdown } from "@/lib/claude-api";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

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
    const breakdown = await getUsageBreakdown(auth.user.id);
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
