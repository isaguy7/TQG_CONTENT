import { NextResponse } from "next/server";
import { ensureCurrentWeek, computeGapAlerts } from "@/lib/gap-alerts";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const calendar = await ensureCurrentWeek();
  const alerts = await computeGapAlerts();

  const db = getSupabaseServer();
  const weekStart = new Date(calendar.week_start + "T00:00:00Z");
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const { data: posts } = await db
    .from("posts")
    .select("id,title,platform,status,scheduled_for,published_at,figure_id")
    .or(
      `and(status.eq.published,published_at.gte.${weekStart.toISOString()},published_at.lt.${weekEnd.toISOString()}),and(status.eq.scheduled,scheduled_for.gte.${weekStart.toISOString()},scheduled_for.lt.${weekEnd.toISOString()})`
    )
    .order("scheduled_for", { ascending: true });

  return NextResponse.json({
    calendar,
    alerts,
    posts: posts || [],
  });
}
