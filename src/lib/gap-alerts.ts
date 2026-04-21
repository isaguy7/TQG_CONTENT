/**
 * Phase 8: Gap alert engine.
 *
 * Pulls the current week's calendar row + recent posts and emits
 * human-readable alerts when the posting cadence drops below target.
 */
import { createClient } from "@/lib/supabase/admin";

export type GapAlert = {
  kind: "figure_dormant";
  message: string;
};

export type WeeklyCalendar = {
  week_start: string;
  user_id?: string | null;
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

export async function ensureCurrentWeek(userId: string): Promise<WeeklyCalendar> {
  const db = createClient();
  const week = currentWeekStart();
  // content_calendar only has UNIQUE (week_start) today. onConflict was
  // previously "user_id,week_start" — a composite that doesn't match
  // any constraint, throwing "no unique or exclusion constraint matching
  // the ON CONFLICT specification" and 500ing /api/calendar. Fine for
  // M1 single-tenant; §13 adds proper (week_start, organization_id)
  // scoping when the calendar UI rebuilds (see REFACTOR_DEBT).
  await db
    .from("content_calendar")
    .upsert(
      { week_start: week, user_id: userId },
      { onConflict: "week_start", ignoreDuplicates: true }
    );
  const { data, error } = await db
    .from("content_calendar")
    .select("*")
    .eq("week_start", week)
    .eq("user_id", userId)
    .single();
  if (error || !data) {
    throw new Error(
      `Calendar week fetch failed after upsert: ${error?.message || "no row"}`
    );
  }
  return data as WeeklyCalendar;
}

export async function computeGapAlerts(userId: string): Promise<GapAlert[]> {
  const db = createClient();
  await ensureCurrentWeek(userId);
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
  const db = createClient();
  const { data: post } = await db
    .from("posts")
    .select("id,platform,platforms,figure_id,topic_tags,user_id")
    .eq("id", postId)
    .maybeSingle();
  if (!post || !post.user_id) return;

  const calendar = await ensureCurrentWeek(post.user_id);
  const patch: Record<string, unknown> = {};
  // Prefer platforms[] (new source of truth); fall back to singular
  // platform column until it's dropped in M2.
  const platforms: string[] =
    (post.platforms as string[] | null | undefined) ??
    (post.platform ? [post.platform as string] : []);
  if (platforms.includes("linkedin")) {
    patch.linkedin_originals_actual = calendar.linkedin_originals_actual + 1;
  }
  if (platforms.includes("x")) {
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
      .eq("week_start", calendar.week_start)
      .eq("user_id", post.user_id);
  }
}
