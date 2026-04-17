import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { isUuid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("islamic_figures")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ figure: data });
}
