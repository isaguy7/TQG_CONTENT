import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { currentWeekStart } from "@/lib/gap-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusCount = Record<
  "idea" | "drafting" | "review" | "ready" | "scheduled" | "published",
  number
>;

export async function GET() {
  const db = getSupabaseServer();

  const { data: statusRows } = await db.from("posts").select("status");
  const statusCounts: StatusCount = {
    idea: 0,
    drafting: 0,
    review: 0,
    ready: 0,
    scheduled: 0,
    published: 0,
  };
  for (const row of statusRows || []) {
    const s = (row as { status: keyof StatusCount }).status;
    if (s in statusCounts) statusCounts[s]++;
  }

  const weekStart = currentWeekStart();
  const weekStartIso = new Date(weekStart + "T00:00:00Z").toISOString();

  const { count: postsThisWeek } = await db
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .gte("published_at", weekStartIso);

  const { count: figuresTotal } = await db
    .from("islamic_figures")
    .select("id", { count: "exact", head: true });

  const { count: figuresPostedEver } = await db
    .from("islamic_figures")
    .select("id", { count: "exact", head: true })
    .not("last_posted_at", "is", null);

  const { data: calendarRow } = await db
    .from("content_calendar")
    .select("figures_covered")
    .eq("week_start", weekStart)
    .maybeSingle();
  const figuresThisWeek = (calendarRow?.figures_covered || []).length;

  const { count: hadithTotal } = await db
    .from("hadith_verifications")
    .select("id", { count: "exact", head: true });

  const { count: hadithCorpusTotal } = await db
    .from("hadith_corpus")
    .select("id", { count: "exact", head: true });

  const { count: quranAyahs } = await db
    .from("quran_cache")
    .select("id", { count: "exact", head: true });

  return NextResponse.json({
    posts: {
      total:
        statusCounts.idea +
        statusCounts.drafting +
        statusCounts.review +
        statusCounts.ready +
        statusCounts.scheduled +
        statusCounts.published,
      by_status: statusCounts,
      published_this_week: postsThisWeek || 0,
    },
    figures: {
      total: figuresTotal || 0,
      posted_about: figuresPostedEver || 0,
      this_week: figuresThisWeek,
    },
    hadith: {
      attached_total: hadithTotal || 0,
      corpus_total: hadithCorpusTotal || 0,
    },
    quran: {
      ayahs: quranAyahs || 0,
    },
  });
}
