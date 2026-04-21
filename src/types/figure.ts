export type FigureType = "sahabi" | "prophet" | "scholar" | "tabii";

export interface HookAngle {
  category: string;
  template: string;
}

/**
 * Canonical shape of an islamic_figures row as returned by
 * /api/figures. slug added in §6 commit 1 (migration
 * 20260420090000_v10_islamic_figures_slug); post_count is a derived
 * live count from posts.figure_id WHERE deleted_at IS NULL computed
 * at response time, not stored on the row.
 *
 * posts_written is a pre-V10 denormalized counter on the row itself;
 * post_count is preferred for freshness. Both shipped today;
 * posts_written is deprecation-candidate once §6 / §15 stabilize.
 */
export interface IslamicFigure {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string | null;
  title: string | null;
  type: FigureType;
  era: string | null;
  bio_short: string;
  themes: string[];
  hook_angles: HookAngle[];
  quran_refs: string[];
  posts_written: number;
  last_posted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Augmented shape returned by /api/figures — adds derived counts.
 * Distinct from the canonical IslamicFigure row so downstream code
 * can require or opt into the counts explicitly.
 */
export interface IslamicFigureWithCounts extends IslamicFigure {
  post_count: number;
  hadith_ref_count: number;
  quran_ref_count: number;
}
