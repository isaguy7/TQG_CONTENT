-- TQG Content Studio — user_profiles (admin-gated access)
--
-- Supabase's built-in "disable sign-ups" admin toggle is binary. To move to
-- an open-ish model with admin approval we introduce a profiles table that
-- carries the role state off auth.users, plus a trigger that stamps every
-- new signup as 'pending'. Middleware gates on this role.
--
-- 1. Table: user_profiles (one row per auth.users)
-- 2. Trigger: on auth.users insert, seed a pending row
-- 3. Seed: promote the bootstrap admin to role='admin'

create table if not exists user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'pending'
    check (role in ('pending','member','admin','rejected')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  -- Local Studio tunnel URL — populated by the local tunnel script so the
  -- hosted app can proxy GPU work to the user's own machine. Nullable;
  -- most users won't use the tunnel.
  local_tunnel_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_profiles_role_idx on user_profiles (role);

-- Trigger: seed a row whenever a new auth user is created, pulling the
-- display name out of user_metadata if the signup form sent one.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into user_profiles (user_id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'pending'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- Backfill any existing users as pending so the gate is consistent, then
-- promote the bootstrap admin.
insert into user_profiles (user_id, display_name, role)
select id, coalesce(raw_user_meta_data->>'full_name', email), 'pending'
from auth.users
on conflict (user_id) do nothing;

do $$
declare
  bootstrap_user uuid := 'a004cb71-f78a-4f2a-8342-dea9be6a8c8a';
begin
  if exists (select 1 from auth.users where id = bootstrap_user) then
    update user_profiles
       set role = 'admin',
           approved_at = coalesce(approved_at, now()),
           approved_by = bootstrap_user,
           updated_at = now()
     where user_id = bootstrap_user;
  end if;
end $$;
