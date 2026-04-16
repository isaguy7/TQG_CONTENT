-- TQG Content Studio — initial schema (Phase 0)
-- Covers all v1 tables. Hadith refs are FKs, never free text.
-- Version history uses generic content_revisions table.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------
-- Islamic figures (seeded in Phase 3 with 10-15 starter entries)
-- ---------------------------------------------------------------
create table if not exists islamic_figures (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text,
  title text,
  type text not null check (type in ('sahabi','prophet','scholar','tabii')),
  era text,
  bio_short text not null,
  themes text[] not null default '{}',
  hook_angles jsonb not null default '[]',
  notable_events jsonb not null default '[]',
  quran_refs text[] not null default '{}',
  posts_written int4 not null default 0,
  last_posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists islamic_figures_themes_idx on islamic_figures using gin (themes);
create index if not exists islamic_figures_type_idx on islamic_figures (type);

-- ---------------------------------------------------------------
-- Hadith verifications (safety-critical kernel, Phase 2)
-- ---------------------------------------------------------------
create table if not exists hadith_verifications (
  id uuid primary key default gen_random_uuid(),
  reference_text text not null,
  sunnah_com_url text,
  narrator text,
  arabic_text text,
  translation_en text,
  grade text,
  verified boolean not null default false,
  verification_notes text,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
create index if not exists hadith_verifications_verified_idx on hadith_verifications (verified);

-- ---------------------------------------------------------------
-- Quran corpus (Phase 4: all 6,236 ayahs imported once)
-- ---------------------------------------------------------------
create table if not exists quran_cache (
  id uuid primary key default gen_random_uuid(),
  surah int4 not null check (surah between 1 and 114),
  ayah int4 not null check (ayah >= 1),
  verse_key text not null unique,
  text_uthmani text not null,
  text_simple text,
  normalized text not null,
  words_json jsonb not null default '[]',
  translation_en text,
  fetched_at timestamptz not null default now()
);
create index if not exists quran_cache_surah_ayah_idx on quran_cache (surah, ayah);
create index if not exists quran_cache_normalized_trgm_idx on quran_cache using gin (normalized gin_trgm_ops);

-- ---------------------------------------------------------------
-- Posts (drafts + published)
-- NOTE: hadith_refs removed in favor of post_hadith_refs junction.
-- NOTE: draft_versions removed in favor of content_revisions generic.
-- ---------------------------------------------------------------
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  title text,
  figure_id uuid references islamic_figures(id) on delete set null,
  source_url text,
  transcript text,
  hooks_generated jsonb default '[]',
  hook_selected text,
  final_content text,
  image_url text,
  image_rationale text,
  quran_refs jsonb default '[]',
  islamic_figure_refs uuid[] default '{}',
  status text not null default 'idea'
    check (status in ('idea','drafting','review','ready','scheduled','published')),
  platform text not null default 'linkedin'
    check (platform in ('linkedin','x','instagram','facebook')),
  platform_versions jsonb default '{}',
  scheduled_for timestamptz,
  published_at timestamptz,
  topic_tags text[] default '{}',
  performance jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_status_idx on posts (status);
create index if not exists posts_figure_idx on posts (figure_id);
create index if not exists posts_scheduled_idx on posts (scheduled_for);

-- Junction: posts <-> hadith_verifications.
-- This is the ONLY place hadith references live on a post.
create table if not exists post_hadith_refs (
  post_id uuid not null references posts(id) on delete cascade,
  hadith_id uuid not null references hadith_verifications(id) on delete restrict,
  position int4 not null default 0,
  primary key (post_id, hadith_id)
);
create index if not exists post_hadith_refs_hadith_idx on post_hadith_refs (hadith_id);

-- ---------------------------------------------------------------
-- Video projects (Phase 1 for download+transcribe, Phase 5 short clips)
-- ---------------------------------------------------------------
create table if not exists video_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  project_type text not null check (project_type in ('short_clip','long_edit','transcript_only')),
  source_url text,
  local_video_path text,
  local_audio_path text,
  background_clip_path text,
  recitation_audio_path text,
  transcript jsonb,
  detected_ayahs jsonb,
  subtitle_file text,
  output_path text,
  duration_seconds int4,
  status text not null default 'new'
    check (status in ('new','downloading','transcribing','matching','rendering','done','error')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists video_projects_status_idx on video_projects (status);
create index if not exists video_projects_type_idx on video_projects (project_type);

-- ---------------------------------------------------------------
-- Clip batches (Phase 5)
-- ---------------------------------------------------------------
create table if not exists clip_batch (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  clip_ids uuid[] not null default '{}',
  backgrounds_dir text,
  status text not null default 'preparing'
    check (status in ('preparing','rendering','done','error')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Content calendar (v2, scaffolded now)
-- ---------------------------------------------------------------
create table if not exists content_calendar (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  linkedin_originals_target int4 not null default 2,
  linkedin_originals_actual int4 not null default 0,
  tqg_reposts_target int4 not null default 3,
  tqg_reposts_actual int4 not null default 0,
  x_posts_target int4 not null default 7,
  x_posts_actual int4 not null default 0,
  x_video_clips_target int4 not null default 3,
  x_video_clips_actual int4 not null default 0,
  figures_covered text[] not null default '{}',
  topics_covered text[] not null default '{}',
  notes text,
  alerts jsonb default '[]'
);

-- ---------------------------------------------------------------
-- Generic version history — used by posts, figures, clips, video
-- Replaces posts.draft_versions column from v2.1 spec.
-- ---------------------------------------------------------------
create table if not exists content_revisions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('post','figure','clip','video')),
  entity_id uuid not null,
  content jsonb not null,
  author_note text,
  created_at timestamptz not null default now()
);
create index if not exists content_revisions_entity_idx
  on content_revisions (entity_type, entity_id, created_at desc);

-- ---------------------------------------------------------------
-- API usage tracking (optional, Phase 5+)
-- ---------------------------------------------------------------
create table if not exists api_usage (
  id uuid primary key default gen_random_uuid(),
  feature text not null check (feature in ('hooks','convert','suggest','slop_check')),
  model text not null,
  input_tokens int4 not null default 0,
  output_tokens int4 not null default 0,
  estimated_cost_usd numeric(10,6) not null default 0,
  post_id uuid references posts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists api_usage_created_at_idx
  on api_usage (created_at);
