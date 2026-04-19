
-- V10 M1 §5 — Add content_json for Tiptap JSON roundtrip fidelity
--
-- Complements content_html (added in §2 migration 20260419111246) by storing
-- the full Tiptap document JSON. This preserves marks, nodes, attrs exactly
-- so the editor can reload content without any HTML→JSON parse step.
--
-- Storage strategy after this migration:
--   - posts.final_content TEXT   → plain text (for Typefully push, API consumers)
--   - posts.content_html TEXT    → HTML (for email preview, legacy rendering)
--   - posts.content_json JSONB   → Tiptap JSON (source of truth for editor)
--
-- All three are kept in sync by the editor save path. content_json is the
-- authoritative source for roundtrips; the other two are derived views.
-- Nullable so existing rows (no editor history) keep working.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS content_json JSONB;

COMMENT ON COLUMN public.posts.content_json IS
  'Tiptap document JSON (source of truth for editor roundtrip).
   content_html and final_content are derived views kept in sync on save.
   Null for posts created before V10 §5 editor or for imported posts.';

-- Add GIN index for potential future JSONB queries (search by mentioned figure,
-- search by content type, etc.). Small cost now, valuable when §6 figure mention
-- tracking lands.
CREATE INDEX IF NOT EXISTS idx_posts_content_json_gin
  ON public.posts USING GIN (content_json)
  WHERE content_json IS NOT NULL;

-- Extend post_versions with same column for version history fidelity
ALTER TABLE public.post_versions
  ADD COLUMN IF NOT EXISTS content_json JSONB;

COMMENT ON COLUMN public.post_versions.content_json IS
  'Tiptap JSON snapshot at time of save. Paired with content + content_html
   for complete version restoration.';

DO $$
BEGIN
  RAISE NOTICE 'V10 §5 content_json migration complete';
END $$;
