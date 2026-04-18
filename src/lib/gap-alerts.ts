/**
 * Phase 8: Gap alert engine.
 *
 * Pulls the current week's calendar row + recent posts and emits
 * human-readable alerts when the posting cadence drops below target.
 */
import { getSupabaseServer } from "@/lib/supabase";

export type GapAlert = {
  kind: "figure_dormant";
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
  // Upsert with ignoreDuplicates eliminates the check-then-insert race.
  await db
    .from("content_calendar")
    .upsert({ week_start: week }, {
      onConflict: "week_start",
      ignoreDuplicates: true,
    });
  const { data, error } = await db
    .from("content_calendar")
    .select("*")
    .eq("week_start", week)
    .single();
  if (error || !data) {
    throw new Error(
      `Calendar week fetch failed after upsert: ${error?.message || "no row"}`
    );
  }
  return data as WeeklyCalendar;
}

export async function computeGapAlerts(): Promise<GapAlert[]> {
  const db = getSupabaseServer();
  await ensureCurrentWeek();
  const alerts: GapAlert[] = [];

  // Informational suggestion only: surface figures we haven't posted about
  // in a while. Never a restriction — purely a nudge for figure variety.
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
