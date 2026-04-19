-- Publish gate — safety-critical DB-level enforcement.
-- A post cannot transition to status='ready' if any linked hadith
-- reference is unverified. This is enforced as a trigger; the
-- Node-level lib/publish-gate.ts wraps the same check in the API.

create or replace function assert_publishable_post()
returns trigger as $$
declare
  unverified_count int4;
begin
  if new.status = 'ready' and (old.status is null or old.status <> 'ready') then
    select count(*) into unverified_count
    from post_hadith_refs phr
    join hadith_verifications hv on hv.id = phr.hadith_id
    where phr.post_id = new.id
      and hv.verified = false;

    if unverified_count > 0 then
      raise exception
        'Cannot mark post ready: % unverified hadith reference(s). '
        'Verify on sunnah.com first.',
        unverified_count
      using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists posts_publish_gate on posts;
create trigger posts_publish_gate
  before update of status on posts
  for each row execute function assert_publishable_post();

-- Same check on insert (in case a post is created with status='ready' directly).
create or replace function assert_publishable_post_insert()
returns trigger as $$
begin
  if new.status = 'ready' then
    -- New posts have no hadith refs yet by definition; reject.
    raise exception
      'New posts cannot start as ready. Create as idea/drafting, attach and '
      'verify hadith refs, then promote.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists posts_publish_gate_insert on posts;
create trigger posts_publish_gate_insert
  before insert on posts
  for each row execute function assert_publishable_post_insert();
