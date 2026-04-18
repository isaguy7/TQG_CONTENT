-- TQG Content Studio — V6 OAuth + multi-user
--
-- This migration documents the schema changes that V6 depends on. The
-- changes have already been applied to the live project; this file lives
-- in source control so a fresh `supabase db reset` lands at the same shape.
--
-- 1. Adds `user_id` (auth.users FK) to every per-user table:
--      posts, content_calendar, api_usage
-- 2. Creates `oauth_connections` to store the per-user posting tokens
--    captured during the Supabase OAuth login flow.
-- 3. Backfills existing rows to the seed admin user so historical content
--    stays attached to a real account after the migration.

-- ---------------------------------------------------------------
-- 1. Per-user FKs on existing tables
-- ---------------------------------------------------------------
alter table posts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists posts_user_id_idx on posts (user_id);

alter table content_calendar
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
-- One calendar row per (user, week)
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'content_calendar_week_start_key'
  ) then
    alter table content_calendar drop constraint content_calendar_week_start_key;
  end if;
end $$;
create unique index if not exists content_calendar_user_week_idx
  on content_calendar (user_id, week_start);

alter table api_usage
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists api_usage_user_id_idx on api_usage (user_id);

-- ---------------------------------------------------------------
-- 2. oauth_connections — per-user provider tokens for posting
-- ---------------------------------------------------------------
create table if not exists oauth_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('linkedin','x')),
  account_id text not null,
  account_name text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  metadata jsonb not null default '{}',
  status text not null default 'active'
    check (status in ('active','expired','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists oauth_connections_user_platform_idx
  on oauth_connections (user_id, platform);
create index if not exists oauth_connections_status_idx
  on oauth_connections (status);

-- ---------------------------------------------------------------
-- 3. Backfill existing rows to the bootstrap admin user
-- ---------------------------------------------------------------
do $$
declare
  bootstrap_user uuid := 'a004cb71-f78a-4f2a-8342-dea9be6a8c8a';
begin
  if exists (select 1 from auth.users where id = bootstrap_user) then
    update posts set user_id = bootstrap_user where user_id is null;
    update content_calendar set user_id = bootstrap_user where user_id is null;
    update api_usage set user_id = bootstrap_user where user_id is null;
  end if;
end $$;
