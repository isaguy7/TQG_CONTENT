import { NextRequest, NextResponse } from "next/server";
import { ensureCurrentWeek, computeGapAlerts } from "@/lib/gap-alerts";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const monthParam = sp.get("month"); // format: YYYY-MM; default = current month

  const calendar = await ensureCurrentWeek();
  const alerts = await computeGapAlerts();

  const db = getSupabaseServer();

  // Compute the month window. Default to the current month so existing
  // callers (no ?month=) keep working, now returning the whole month.
  const today = new Date();
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth();
  if (monthParam) {
    const m = monthParam.match(/^(\d{4})-(\d{1,2})$/);
    if (m) {
      year = Number(m[1]);
      month = Number(m[2]) - 1;
    }
  }
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 1));

  const { data: posts } = await db
    .from("posts")
    .select(
      "id,title,platform,status,scheduled_for,published_at,figure_id,labels"
    )
    .is("deleted_at", null)
    .or(
      `and(status.eq.published,published_at.gte.${monthStart.toISOString()},published_at.lt.${monthEnd.toISOString()}),and(status.in.(scheduled,ready,drafting,idea,review),scheduled_for.gte.${monthStart.toISOString()},scheduled_for.lt.${monthEnd.toISOString()})`
    )
    .order("scheduled_for", { ascending: true });

  return NextResponse.json({
    calendar,
    alerts,
    posts: posts || [],
    month: `${year}-${String(month + 1).padStart(2, "0")}`,
  });
}
