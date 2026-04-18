-- TQG Content Studio — oauth_connections.account_type
--
-- LinkedIn (and later Meta) can post as either the signed-in member or as
-- a company Page the member administers. We previously assumed one
-- connection per (user, platform); posting-as-page needs a second row for
-- the same user + platform but a different LinkedIn target URN.
--
-- 1. Add `account_type` ('personal' | 'organization') with 'personal' default.
-- 2. Replace the (user_id, platform) unique index with a
--    (user_id, platform, account_type, account_id) index so a user can hold
--    multiple LinkedIn connections (their personal account + any Pages).
-- 3. Backfill: every existing row is 'personal'.

alter table oauth_connections
  add column if not exists account_type text not null default 'personal'
    check (account_type in ('personal','organization'));

-- Drop the old uniqueness constraint (one connection per user+platform).
drop index if exists oauth_connections_user_platform_idx;

-- New uniqueness: one row per (user, platform, account_type, account_id).
-- Keeps personal + organization rows distinct for the same LinkedIn login.
create unique index if not exists oauth_connections_user_platform_account_idx
  on oauth_connections (user_id, platform, account_type, account_id);

-- Retain a partial unique on personal rows so we still enforce
-- "one personal account per platform per user" during upsert-by-platform
-- flows in the save-token handler.
create unique index if not exists oauth_connections_user_platform_personal_idx
  on oauth_connections (user_id, platform)
  where account_type = 'personal';
