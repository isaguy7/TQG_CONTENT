/**
 * Phase 8: Gap alert engine.
 *
 * Pulls the current week's calendar row + recent posts and emits
 * human-readable alerts when the posting cadence drops below target.
 */
import { getSupabaseServer } from "@/lib/supabase";

export type GapAlert = {
  kind:
    | "no_x_clip"
    | "sahabi_streak"
    | "tqg_page_empty"
    | "linkedin_stale"
    | "figure_dormant";
  message: string;
};

export type WeeklyCalendar = {
  week_start: string;
  linkedin_originals_target: number;
  linkedin_originals_actual: number;
  tqg_reposts_target: number;
  tqg_reposts_actual: number;
  x_posts_target: number;
  x_posts_actual: number;
  x_video_clips_target: number;
  x_video_clips_actual: number;
  figures_covered: string[];
  topics_covered: string[];
};

export function currentWeekStart(d: Date = new Date()): string {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = copy.getUTCDay();
  const monOffset = (dow + 6) % 7; // Mon-start week
  copy.setUTCDate(copy.getUTCDate() - monOffset);
  return copy.toISOString().slice(0, 10);
}

export async function ensureCurrentWeek(): Promise<WeeklyCalendar> {
  const db = getSupabaseServer();
  const week = currentWeekStart();
  const { data: existing } = await db
    .from("content_calendar")
    .select("*")
    .eq("week_start", week)
    .maybeSingle();
  if (existing) return existing as WeeklyCalendar;
  const { data: inserted, error } = await db
    .from("content_calendar")
    .insert({ week_start: week })
    .select()
    .single();
  if (error) {
    // Another request inserted concurrently; refetch.
    const { data: row } = await db
      .from("content_calendar")
      .select("*")
      .eq("week_start", week)
      .maybeSingle();
    return row as WeeklyCalendar;
  }
  return inserted as WeeklyCalendar;
}

export async function computeGapAlerts(): Promise<GapAlert[]> {
  const db = getSupabaseServer();
  const calendar = await ensureCurrentWeek();
  const alerts: GapAlert[] = [];

  const since3d = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();

  const { data: recentX } = await db
    .from("posts")
    .select("id")
    .eq("status", "published")
    .eq("platform", "x")
    .gte("published_at", since3d);
  if ((recentX || []).length === 0 && calendar.x_video_clips_actual === 0) {
    alerts.push({
      kind: "no_x_clip",
      message: "No X clip posted in the last 3 days — algorithm momentum cooling.",
    });
  }

  const { data: last3 } = await db
    .from("posts")
    .select("id,figure_id")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(3);
  if ((last3 || []).length === 3) {
    const figureIds = last3!.map((p) => p.figure_id).filter(Boolean) as string[];
    if (figureIds.length === 3) {
      const { data: figures } = await db
        .from("islamic_figures")
        .select("id,type")
        .in("id", figureIds);
      const allSahabi =
        (figures || []).every((f) => f.type === "sahabi") &&
        (figures || []).length === 3;
      if (allSahabi) {
        alerts.push({
          kind: "sahabi_streak",
          message:
            "3 Sahabah posts in a row. Next post: surface a Prophet or scholar.",
        });
      }
    }
  }

  if (calendar.tqg_reposts_actual === 0 && calendar.tqg_reposts_target > 0) {
    alerts.push({
      kind: "tqg_page_empty",
      message: `TQG Page has 0 posts this week (target: ${calendar.tqg_reposts_target}).`,
    });
  }

  const since4d = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString();
  const { data: recentLi } = await db
    .from("posts")
    .select("id")
    .eq("status", "published")
    .eq("platform", "linkedin")
    .gte("published_at", since4d);
  if ((recentLi || []).length === 0) {
    alerts.push({
      kind: "linkedin_stale",
      message: "No LinkedIn original in 4+ days.",
    });
  }

  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: dormant } = await db
    .from("islamic_figures")
    .select("name_en,last_posted_at")
    .or(`last_posted_at.lt.${since30d},last_posted_at.is.null`)
    .limit(3);
  for (const f of dormant || []) {
    alerts.push({
      kind: "figure_dormant",
      message: `${f.name_en} hasn't been posted about in 30+ days.`,
    });
  }

  return alerts;
}

export async function recordPublished(postId: string): Promise<void> {
  const db = getSupabaseServer();
  const { data: post } = await db
    .from("posts")
    .select("id,platform,figure_id,topic_tags")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return;

  const calendar = await ensureCurrentWeek();
  const patch: Record<string, unknown> = {};
  if (post.platform === "linkedin") {
    patch.linkedin_originals_actual = calendar.linkedin_originals_actual + 1;
  } else if (post.platform === "x") {
    patch.x_posts_actual = calendar.x_posts_actual + 1;
  }

  let figuresCovered = calendar.figures_covered || [];
  if (post.figure_id) {
    const { data: figure } = await db
      .from("islamic_figures")
      .select("name_en")
      .eq("id", post.figure_id)
      .maybeSingle();
    if (figure?.name_en && !figuresCovered.includes(figure.name_en)) {
      figuresCovered = [...figuresCovered, figure.name_en];
      patch.figures_covered = figuresCovered;
    }
    const { data: figureCounter } = await db
      .from("islamic_figures")
      .select("posts_written")
      .eq("id", post.figure_id)
      .maybeSingle();
    await db
      .from("islamic_figures")
      .update({
        last_posted_at: new Date().toISOString(),
        posts_written: (figureCounter?.posts_written ?? 0) + 1,
      })
      .eq("id", post.figure_id);
  }

  const topicTags = (post.topic_tags || []) as string[];
  if (topicTags.length) {
    const existing = calendar.topics_covered || [];
    const merged = Array.from(new Set([...existing, ...topicTags]));
    if (merged.length !== existing.length) patch.topics_covered = merged;
  }

  if (Object.keys(patch).length > 0) {
    await db
      .from("content_calendar")
      .update(patch)
      .eq("week_start", calendar.week_start);
  }
}
