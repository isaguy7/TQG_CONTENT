import { NextResponse } from "next/server";
import {
  listRecentlyPublished,
  listRecentlyScheduled,
  typefullyAvailable,
} from "@/lib/typefully";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!typefullyAvailable()) {
    return NextResponse.json({ available: false, reason: "no_api_key" });
  }

  const [pubRes, schedRes] = await Promise.all([
    listRecentlyPublished(),
    listRecentlyScheduled(),
  ]);

  return NextResponse.json({
    available: true,
    published: pubRes.available ? pubRes.drafts : [],
    scheduled: schedRes.available ? schedRes.drafts : [],
  });
}
