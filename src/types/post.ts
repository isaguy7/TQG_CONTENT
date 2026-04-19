export type PostStatus =
  | "idea"
  | "draft"
  | "scheduled"
  | "published"
  | "failed"
  | "archived";

export type Platform = "linkedin" | "x" | "facebook" | "instagram";

export type HookCategory =
  | "contrast"
  | "provocative"
  | "scene"
  | "purpose"
  | "refusal"
  | "dua"
  | "scale"
  | "loss"
  | "character";

export interface HookItem {
  text: string;
  category: HookCategory;
}

export interface Post {
  id: string;
  organization_id: string; // NEW — multi-tenancy
  user_id: string | null;
  title: string | null; // NEW
  status: PostStatus;
  final_content: string | null; // existing — rename consideration for M2
  content_html: string | null; // NEW
  platform: Platform; // DEPRECATED — use platforms[]
  platforms: Platform[]; // NEW — source of truth
  platform_versions: Record<string, unknown>; // existing JSONB
  figure_id: string | null;
  islamic_figure_refs: string[];
  quran_refs: unknown[];
  hooks_generated: HookItem[];
  hook_selected: string | null;
  hook_category: HookCategory | null; // NEW
  hook_text: string | null; // NEW
  version: number; // NEW
  image_url: string | null;
  image_rationale: string | null;
  source_url: string | null;
  transcript: string | null;
  topic_tags: string[];
  labels: string[];
  scheduled_for: string | null;
  published_at: string | null;
  archived_at: string | null; // NEW
  deleted_at: string | null;
  performance: unknown;
  created_at: string;
  updated_at: string;
}

export interface PostVersion {
  id: string;
  post_id: string;
  organization_id: string;
  version: number;
  content: string | null;
  content_html: string | null;
  saved_at: string;
  saved_by: string | null;
}
