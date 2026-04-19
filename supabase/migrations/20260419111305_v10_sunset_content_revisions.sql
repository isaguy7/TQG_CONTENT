
-- V10 M1 §2 — Sunset content_revisions (empty, pre-V10)
ALTER TABLE public.content_revisions RENAME TO _deprecated_content_revisions;

COMMENT ON TABLE public._deprecated_content_revisions IS
  'DEPRECATED 2026-04-19 — pre-V10 versioning. 0 rows at sunset. Post versioning moved to post_versions. Safe to drop in M2.';
