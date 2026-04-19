-- Extend clip_batch for queued/offloaded rendering
alter table clip_batch drop constraint if exists clip_batch_status_check;
alter table clip_batch
  add constraint clip_batch_status_check
  check (status in ('preparing','queued','rendering','completed','error'));
alter table clip_batch alter column status set default 'queued';

alter table clip_batch
  add column if not exists payload jsonb,
  add column if not exists results jsonb,
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists processed_at timestamptz,
  add column if not exists error text;

update clip_batch set status = 'completed' where status = 'done';

-- Allow assistant feature logging
alter table api_usage drop constraint if exists api_usage_feature_check;
alter table api_usage
  add constraint api_usage_feature_check
  check (feature in ('hooks','convert','suggest','slop_check','assistant'));
