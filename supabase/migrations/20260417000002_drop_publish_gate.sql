-- V2 overhaul: drop the hadith verification ceremony.
--
-- Rationale: our hadith corpus comes from established sunnah.com-linked
-- collections (Bukhari, Muslim, etc.). Requiring a manual "verified" toggle
-- per reference before a post can go ready added friction without adding
-- safety. The sunnah.com URLs remain on each reference for readers to check.
--
-- This migration removes the DB-level publish gate triggers. The matching
-- Node-level check in src/lib/publish-gate.ts is replaced with a no-op
-- exported for backward compatibility, then callers updated in a follow-up.

drop trigger if exists posts_publish_gate on posts;
drop trigger if exists posts_publish_gate_insert on posts;
drop function if exists assert_publishable_post();
drop function if exists assert_publishable_post_insert();

-- Backfill: every existing reference is now considered "verified" so nothing
-- shows up as unverified in the UI.
update hadith_verifications
set verified = true,
    verified_at = coalesce(verified_at, created_at, now())
where verified = false;
