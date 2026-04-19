import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/admin";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.trim().toLowerCase() ?? "";

  if (!slug) {
    return NextResponse.json({ available: false, reason: "empty" });
  }
  if (!SLUG_PATTERN.test(slug)) {
    return NextResponse.json({ available: false, reason: "invalid_format" });
  }

  const db = createClient();
  const { data, error } = await db
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { available: false, reason: "db_error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ available: !data });
}
