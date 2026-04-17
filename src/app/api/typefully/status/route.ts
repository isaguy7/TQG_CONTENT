import { NextResponse } from "next/server";
import { typefullyAvailable } from "@/lib/typefully";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ available: typefullyAvailable() });
}
