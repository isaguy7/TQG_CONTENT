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

/**
 * Tiptap document JSON. Typed as `unknown` in this module to avoid
 * pulling `@tiptap/core` into any server-side type graph that imports
 * `Post`. Editor code should cast via
 *   `post.content_json as JSONContent | null`
 * after importing `JSONContent` from `@tiptap/core` locally. Shape is
 * a Tiptap `JSONContent` node — `{ type, content?, attrs?, marks?, text? }`
 * recursively.
 */
export type TiptapJson = unknown;

export interface Post {
  id: string;
  organization_id: string; // multi-tenancy
  user_id: string | null;
  title: string | null;
  status: PostStatus;
  final_content: string | null; // plain text — derived view, pushed to Typefully + API consumers
  content_html: string | null; // HTML — derived view, for email preview + legacy rendering
  content_json: TiptapJson | null; // Tiptap JSON — source of truth for editor roundtrip
  platform: Platform; // DEPRECATED — use platforms[]
  platforms: Platform[]; // source of truth
  platform_versions: Record<string, unknown>; // JSONB, per-platform content overrides
  figure_id: string | null;
  islamic_figure_refs: string[];
  quran_refs: unknown[];
  hooks_generated: HookItem[];
  hook_selected: string | null;
  hook_category: HookCategory | null;
  hook_text: string | null;
  version: number;
  image_url: string | null;
  image_rationale: string | null;
  source_url: string | null;
  transcript: string | null;
  topic_tags: string[];
  labels: string[];
  scheduled_for: string | null;
  published_at: string | null;
  archived_at: string | null;
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
  content: string | null; // plain text
  content_html: string | null;
  content_json: TiptapJson | null;
  saved_at: string;
  saved_by: string | null;
}
