-- =============================================================================
-- V10 baseline schema — snapshot of production as of 2026-04-18
-- =============================================================================
--
-- This file is the flattened current state of the TQG Supabase database,
-- reconstructed from pg_catalog via the Supabase MCP `execute_sql` tool.
-- Cross-checked against `list_tables(verbose=true)` for posts,
-- oauth_connections, hadith_corpus — exact match.
--
-- It consolidates the 17 migrations that were actually applied to the live DB
-- (per `supabase_migrations.schema_migrations`). Those timestamps do NOT match
-- the 9 files that previously lived in this directory; those 9 files were a
-- divergent historical record, not the canonical source of truth, and have
-- been moved to `supabase/migrations.pre-v10-archive/`. See the archive
-- README for the drift audit.
--
-- Consolidated applied migrations (in order):
--   20260417102416  disable_rls_all_tables
--   20260417105651  hadith_corpus
--   20260417175934  drop_publish_gate
--   20260417212149  figure_refs_and_post_labels
--   20260417212610  figure_refs_and_labels
--   20260417212855  soft_delete_posts
--   20260417213232  posts_deleted_at_index
--   20260418094505  remove_verification_ceremony
--   20260418094924  surah_metadata
--   20260418095224  tafsir_cache
--   20260418104707  oauth_tokens
--   20260418111356  multi_user_support
--   20260418111644  oauth_connections_unique_user_platform
--   20260418160321  fix_oauth_connections_unique_index
--   20260418162829  multi_account_oauth
--   20260418164129  user_approval_system
--   20260418164304  user_profiles_tunnel_url
--
-- IMPORTANT: All 17 public tables currently have RLS DISABLED. This is the
-- state captured here. The V10 RLS remediation migration
-- (20260420000010_v10_enable_rls.sql) enables RLS with service-role-only
-- policies; that runs AFTER this baseline.
--
-- The `ensure_rls` event trigger auto-enables RLS on CREATE TABLE. It is
-- installed at the end of this file so existing tables stay in their
-- captured (RLS-disabled) state; only future CREATE TABLE commands will
-- auto-enable RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extensions
-- -----------------------------------------------------------------------------

-- Supabase platform extensions (typically pre-installed by the platform; kept
-- idempotent so a fresh `supabase db reset` against a non-Supabase Postgres
-- instance can still apply this baseline.)
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA graphql;
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;

-- Project-specific: pg_trgm for hadith full-text + trigram search.
-- Installed in `public` (not `extensions`) — this is the live-DB location.
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA public;

-- -----------------------------------------------------------------------------
-- 2. Functions
-- -----------------------------------------------------------------------------
-- Defined before triggers that reference them. pg_trgm's ~30 system functions
-- are installed by the CREATE EXTENSION above and are NOT redeclared here.

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO user_profiles (user_id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'pending'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table', 'partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL
       AND cmd.schema_name IN ('public')
       AND cmd.schema_name NOT IN ('pg_catalog', 'information_schema')
       AND cmd.schema_name NOT LIKE 'pg_toast%'
       AND cmd.schema_name NOT LIKE 'pg_temp%'
    THEN
      BEGIN
        EXECUTE format('ALTER TABLE IF EXISTS %s ENABLE ROW LEVEL SECURITY', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    ELSE
      RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %)', cmd.object_identity, cmd.schema_name;
    END IF;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Tables (columns + inline primary keys)
-- -----------------------------------------------------------------------------
-- FOREIGN KEY, CHECK, and UNIQUE constraints are added via ALTER TABLE below
-- so that table creation order doesn't need to respect FK dependency graph.

CREATE TABLE public.islamic_figures (
  id              uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name_en         text         NOT NULL,
  name_ar         text,
  title           text,
  type            text         NOT NULL,
  era             text,
  bio_short       text         NOT NULL,
  themes          text[]       NOT NULL DEFAULT '{}'::text[],
  hook_angles     jsonb        NOT NULL DEFAULT '[]'::jsonb,
  notable_events  jsonb        NOT NULL DEFAULT '[]'::jsonb,
  quran_refs      text[]       NOT NULL DEFAULT '{}'::text[],
  posts_written   integer      NOT NULL DEFAULT 0,
  last_posted_at  timestamptz,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE public.hadith_corpus (
  id                  uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collection          text         NOT NULL,
  collection_name     text         NOT NULL,
  hadith_number       integer      NOT NULL,
  chapter_number      integer,
  chapter_title_en    text,
  chapter_title_ar    text,
  arabic_text         text         NOT NULL,
  english_text        text         NOT NULL,
  narrator            text,
  grade               text,
  sunnah_com_url      text,
  in_book_reference   text,
  created_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE public.hadith_verifications (
  id                  uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reference_text      text         NOT NULL,
  sunnah_com_url      text,
  narrator            text,
  arabic_text         text,
  translation_en      text,
  grade               text,
  verified            boolean      NOT NULL DEFAULT true,
  verification_notes  text,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  verified_at         timestamptz
);

CREATE TABLE public.posts (
  id                   uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title                text,
  figure_id            uuid,
  source_url           text,
  transcript           text,
  hooks_generated      jsonb        DEFAULT '[]'::jsonb,
  hook_selected        text,
  final_content        text,
  image_url            text,
  image_rationale      text,
  quran_refs           jsonb        DEFAULT '[]'::jsonb,
  islamic_figure_refs  uuid[]       DEFAULT '{}'::uuid[],
  status               text         NOT NULL DEFAULT 'idea'::text,
  platform             text         NOT NULL DEFAULT 'linkedin'::text,
  platform_versions    jsonb        DEFAULT '{}'::jsonb,
  scheduled_for        timestamptz,
  published_at         timestamptz,
  topic_tags           text[]       DEFAULT '{}'::text[],
  performance          jsonb,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  labels               text[]       NOT NULL DEFAULT '{}'::text[],
  deleted_at           timestamptz,
  user_id              uuid
);

CREATE TABLE public.post_hadith_refs (
  post_id    uuid     NOT NULL,
  hadith_id  uuid     NOT NULL,
  position   integer  NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, hadith_id)
);

CREATE TABLE public.figure_hadith_refs (
  figure_id        uuid         NOT NULL,
  hadith_corpus_id uuid         NOT NULL,
  relevance_note   text,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (figure_id, hadith_corpus_id)
);

CREATE TABLE public.figure_quran_refs (
  figure_id       uuid         NOT NULL,
  verse_key       text         NOT NULL,
  surah           integer      NOT NULL,
  ayah            integer      NOT NULL,
  relevance_note  text,
  tafseer_note    text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (figure_id, verse_key)
);

CREATE TABLE public.surah_metadata (
  surah                 integer  NOT NULL PRIMARY KEY,
  name_arabic           text     NOT NULL,
  name_english          text     NOT NULL,
  name_transliteration  text     NOT NULL,
  revelation_place      text     NOT NULL,
  ayah_count            integer  NOT NULL,
  juz_start             integer
);

CREATE TABLE public.quran_cache (
  id              uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  surah           integer      NOT NULL,
  ayah            integer      NOT NULL,
  verse_key       text         NOT NULL,
  text_uthmani    text         NOT NULL,
  text_simple     text,
  normalized      text         NOT NULL,
  words_json      jsonb        NOT NULL DEFAULT '[]'::jsonb,
  translation_en  text,
  fetched_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE public.tafsir_cache (
  surah         integer      NOT NULL,
  ayah          integer      NOT NULL,
  tafsir_slug   text         NOT NULL,
  content       text         NOT NULL,
  author        text,
  group_verse   text,
  fetched_at    timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (surah, ayah, tafsir_slug)
);

CREATE TABLE public.oauth_connections (
  id                uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform          text         NOT NULL,
  account_name      text,
  account_id        text,
  access_token      text         NOT NULL,
  refresh_token     text,
  token_expires_at  timestamptz,
  scopes            text[],
  metadata          jsonb        DEFAULT '{}'::jsonb,
  connected_at      timestamptz  NOT NULL DEFAULT now(),
  last_used_at      timestamptz,
  status            text         NOT NULL DEFAULT 'active'::text,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  user_id           uuid,
  account_type      text         NOT NULL DEFAULT 'personal'::text
);

CREATE TABLE public.user_profiles (
  user_id           uuid         NOT NULL PRIMARY KEY,
  display_name      text,
  role              text         NOT NULL DEFAULT 'pending'::text,
  approved_at       timestamptz,
  approved_by       uuid,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  local_tunnel_url  text
);

CREATE TABLE public.content_calendar (
  id                          uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start                  date         NOT NULL,
  linkedin_originals_target   integer      NOT NULL DEFAULT 2,
  linkedin_originals_actual   integer      NOT NULL DEFAULT 0,
  tqg_reposts_target          integer      NOT NULL DEFAULT 3,
  tqg_reposts_actual          integer      NOT NULL DEFAULT 0,
  x_posts_target              integer      NOT NULL DEFAULT 7,
  x_posts_actual              integer      NOT NULL DEFAULT 0,
  x_video_clips_target        integer      NOT NULL DEFAULT 3,
  x_video_clips_actual        integer      NOT NULL DEFAULT 0,
  figures_covered             text[]       NOT NULL DEFAULT '{}'::text[],
  topics_covered              text[]       NOT NULL DEFAULT '{}'::text[],
  notes                       text,
  alerts                      jsonb        DEFAULT '[]'::jsonb,
  user_id                     uuid
);

CREATE TABLE public.content_revisions (
  id           uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type  text         NOT NULL,
  entity_id    uuid         NOT NULL,
  content      jsonb        NOT NULL,
  author_note  text,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE public.api_usage (
  id                  uuid           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature             text           NOT NULL,
  model               text           NOT NULL,
  input_tokens        integer        NOT NULL DEFAULT 0,
  output_tokens       integer        NOT NULL DEFAULT 0,
  estimated_cost_usd  numeric(10,6)  NOT NULL DEFAULT 0,
  post_id             uuid,
  created_at          timestamptz    NOT NULL DEFAULT now(),
  user_id             uuid
);

CREATE TABLE public.clip_batch (
  id               uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name             text         NOT NULL,
  clip_ids         uuid[]       NOT NULL DEFAULT '{}'::uuid[],
  backgrounds_dir  text,
  status           text         NOT NULL DEFAULT 'preparing'::text,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE public.video_projects (
  id                      uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title                   text         NOT NULL,
  project_type            text         NOT NULL,
  source_url              text,
  local_video_path        text,
  local_audio_path        text,
  background_clip_path    text,
  recitation_audio_path   text,
  transcript              jsonb,
  detected_ayahs          jsonb,
  subtitle_file           text,
  output_path             text,
  duration_seconds        integer,
  status                  text         NOT NULL DEFAULT 'new'::text,
  error_message           text,
  created_at              timestamptz  NOT NULL DEFAULT now(),
  updated_at              timestamptz  NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 4. CHECK constraints
-- -----------------------------------------------------------------------------

ALTER TABLE public.api_usage
  ADD CONSTRAINT api_usage_feature_check
  CHECK (feature = ANY (ARRAY['hooks'::text, 'convert'::text, 'suggest'::text, 'slop_check'::text]));

ALTER TABLE public.clip_batch
  ADD CONSTRAINT clip_batch_status_check
  CHECK (status = ANY (ARRAY['preparing'::text, 'rendering'::text, 'done'::text, 'error'::text]));

ALTER TABLE public.content_revisions
  ADD CONSTRAINT content_revisions_entity_type_check
  CHECK (entity_type = ANY (ARRAY['post'::text, 'figure'::text, 'clip'::text, 'video'::text]));

ALTER TABLE public.islamic_figures
  ADD CONSTRAINT islamic_figures_type_check
  CHECK (type = ANY (ARRAY['sahabi'::text, 'prophet'::text, 'scholar'::text, 'tabii'::text]));

ALTER TABLE public.oauth_connections
  ADD CONSTRAINT oauth_connections_account_type_check
  CHECK (account_type = ANY (ARRAY['personal'::text, 'organization'::text]));

ALTER TABLE public.oauth_connections
  ADD CONSTRAINT oauth_connections_platform_check
  CHECK (platform = ANY (ARRAY['linkedin'::text, 'x'::text, 'instagram'::text, 'facebook'::text, 'meta'::text]));

ALTER TABLE public.oauth_connections
  ADD CONSTRAINT oauth_connections_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text]));

ALTER TABLE public.posts
  ADD CONSTRAINT posts_platform_check
  CHECK (platform = ANY (ARRAY['linkedin'::text, 'x'::text, 'instagram'::text, 'facebook'::text]));

ALTER TABLE public.posts
  ADD CONSTRAINT posts_status_check
  CHECK (status = ANY (ARRAY['idea'::text, 'drafting'::text, 'review'::text, 'ready'::text, 'scheduled'::text, 'published'::text]));

ALTER TABLE public.quran_cache
  ADD CONSTRAINT quran_cache_ayah_check   CHECK (ayah >= 1);
ALTER TABLE public.quran_cache
  ADD CONSTRAINT quran_cache_surah_check  CHECK (surah >= 1 AND surah <= 114);

ALTER TABLE public.surah_metadata
  ADD CONSTRAINT surah_metadata_revelation_place_check
  CHECK (revelation_place = ANY (ARRAY['makkah'::text, 'madinah'::text]));
ALTER TABLE public.surah_metadata
  ADD CONSTRAINT surah_metadata_surah_check  CHECK (surah >= 1 AND surah <= 114);

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role = ANY (ARRAY['pending'::text, 'member'::text, 'admin'::text]));

ALTER TABLE public.video_projects
  ADD CONSTRAINT video_projects_project_type_check
  CHECK (project_type = ANY (ARRAY['short_clip'::text, 'long_edit'::text, 'transcript_only'::text]));

ALTER TABLE public.video_projects
  ADD CONSTRAINT video_projects_status_check
  CHECK (status = ANY (ARRAY['new'::text, 'downloading'::text, 'transcribing'::text, 'matching'::text, 'rendering'::text, 'done'::text, 'error'::text]));

-- -----------------------------------------------------------------------------
-- 5. UNIQUE constraints (these auto-create backing indexes)
-- -----------------------------------------------------------------------------

ALTER TABLE public.content_calendar
  ADD CONSTRAINT content_calendar_week_start_key UNIQUE (week_start);

ALTER TABLE public.quran_cache
  ADD CONSTRAINT quran_cache_verse_key_key UNIQUE (verse_key);

-- -----------------------------------------------------------------------------
-- 6. Foreign keys
-- -----------------------------------------------------------------------------

ALTER TABLE public.api_usage
  ADD CONSTRAINT api_usage_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE SET NULL;

ALTER TABLE public.api_usage
  ADD CONSTRAINT api_usage_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.content_calendar
  ADD CONSTRAINT content_calendar_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.figure_hadith_refs
  ADD CONSTRAINT figure_hadith_refs_figure_id_fkey
  FOREIGN KEY (figure_id) REFERENCES public.islamic_figures(id) ON DELETE CASCADE;

ALTER TABLE public.figure_hadith_refs
  ADD CONSTRAINT figure_hadith_refs_hadith_corpus_id_fkey
  FOREIGN KEY (hadith_corpus_id) REFERENCES public.hadith_corpus(id) ON DELETE CASCADE;

ALTER TABLE public.figure_quran_refs
  ADD CONSTRAINT figure_quran_refs_figure_id_fkey
  FOREIGN KEY (figure_id) REFERENCES public.islamic_figures(id) ON DELETE CASCADE;

ALTER TABLE public.oauth_connections
  ADD CONSTRAINT oauth_connections_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.post_hadith_refs
  ADD CONSTRAINT post_hadith_refs_hadith_id_fkey
  FOREIGN KEY (hadith_id) REFERENCES public.hadith_verifications(id) ON DELETE RESTRICT;

ALTER TABLE public.post_hadith_refs
  ADD CONSTRAINT post_hadith_refs_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_figure_id_fkey
  FOREIGN KEY (figure_id) REFERENCES public.islamic_figures(id) ON DELETE SET NULL;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES auth.users(id);

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- 7. Indexes (non-PK, non-UNIQUE-constraint)
-- -----------------------------------------------------------------------------

CREATE INDEX api_usage_created_at_idx         ON public.api_usage            USING btree (created_at);
CREATE INDEX api_usage_user_idx               ON public.api_usage            USING btree (user_id);
CREATE INDEX content_revisions_entity_idx     ON public.content_revisions    USING btree (entity_type, entity_id, created_at DESC);
CREATE INDEX figure_hadith_refs_hadith_idx    ON public.figure_hadith_refs   USING btree (hadith_corpus_id);
CREATE INDEX figure_quran_refs_surah_idx      ON public.figure_quran_refs    USING btree (surah, ayah);
CREATE INDEX hadith_corpus_collection_num_idx ON public.hadith_corpus        USING btree (collection, hadith_number);
CREATE INDEX hadith_corpus_english_fts_idx    ON public.hadith_corpus        USING gin (to_tsvector('english'::regconfig, english_text));
CREATE INDEX hadith_corpus_english_trgm_idx   ON public.hadith_corpus        USING gin (english_text gin_trgm_ops);
CREATE INDEX hadith_verifications_verified_idx ON public.hadith_verifications USING btree (verified);
CREATE INDEX islamic_figures_themes_idx       ON public.islamic_figures      USING gin (themes);
CREATE INDEX islamic_figures_type_idx         ON public.islamic_figures      USING btree (type);
CREATE INDEX oauth_connections_platform_idx   ON public.oauth_connections    USING btree (platform, status);
CREATE INDEX oauth_connections_user_idx       ON public.oauth_connections    USING btree (user_id, platform, status);
CREATE UNIQUE INDEX oauth_connections_user_platform_account_idx
  ON public.oauth_connections USING btree (user_id, platform, account_id);
CREATE UNIQUE INDEX oauth_connections_user_platform_personal_idx
  ON public.oauth_connections USING btree (user_id, platform) WHERE (account_type = 'personal'::text);
CREATE INDEX post_hadith_refs_hadith_idx      ON public.post_hadith_refs     USING btree (hadith_id);
CREATE INDEX posts_deleted_at_idx             ON public.posts                USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX posts_figure_idx                 ON public.posts                USING btree (figure_id);
CREATE INDEX posts_labels_idx                 ON public.posts                USING gin (labels);
CREATE INDEX posts_scheduled_idx              ON public.posts                USING btree (scheduled_for);
CREATE INDEX posts_status_idx                 ON public.posts                USING btree (status);
CREATE INDEX posts_user_idx                   ON public.posts                USING btree (user_id);
CREATE INDEX quran_cache_normalized_trgm_idx  ON public.quran_cache          USING gin (normalized gin_trgm_ops);
CREATE INDEX quran_cache_surah_ayah_idx       ON public.quran_cache          USING btree (surah, ayah);
CREATE INDEX user_profiles_role_idx           ON public.user_profiles        USING btree (role);
CREATE INDEX video_projects_status_idx        ON public.video_projects       USING btree (status);
CREATE INDEX video_projects_type_idx          ON public.video_projects       USING btree (project_type);

-- -----------------------------------------------------------------------------
-- 8. Triggers (data-modification)
-- -----------------------------------------------------------------------------

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- -----------------------------------------------------------------------------
-- 9. Event trigger (auto-enable RLS on future CREATE TABLE)
-- -----------------------------------------------------------------------------
-- Installed AFTER the 17 tables above so they stay RLS-disabled (matching
-- captured prod state). Future CREATE TABLE commands in `public` will
-- auto-enable RLS via this trigger.

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();

-- -----------------------------------------------------------------------------
-- 10. Grants (Supabase default: anon/authenticated/service_role get ALL)
-- -----------------------------------------------------------------------------
-- These match the live DB. Combined with RLS-disabled, this is why the anon
-- key can currently read oauth_connections tokens. RLS remediation in
-- 20260420000010_v10_enable_rls.sql closes this exposure.

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
