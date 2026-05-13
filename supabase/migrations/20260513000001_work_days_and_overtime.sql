-- =============================================================================
-- work_days on assignments + overtime tracking on shifts + pg_cron infra
-- =============================================================================
-- 1. Per-(user, site) day-of-week schedule. NULL = any day (back-compat).
-- 2. Overtime columns on shifts: minutes after expected_end (pending review).
-- 3. pg_cron + pg_net so auto-end-shifts actually fires on a schedule.
-- =============================================================================

alter table public.worker_site_assignments
  add column if not exists work_days smallint[];

comment on column public.worker_site_assignments.work_days is
  'ISO day-of-week numbers the worker is scheduled (1=Mon..7=Sun). '
  'NULL means "any day" (preserves pre-feature behaviour).';

alter table public.shifts
  add column if not exists overtime_minutes int not null default 0,
  add column if not exists overtime_status text not null default 'none',
  add column if not exists overtime_decided_by uuid references public.profiles(id),
  add column if not exists overtime_decided_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shifts_overtime_status_check'
  ) then
    alter table public.shifts
      add constraint shifts_overtime_status_check
      check (overtime_status in ('none', 'pending', 'approved', 'discarded'));
  end if;
end $$;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  jid bigint;
begin
  for jid in select jobid from cron.job where jobname = 'auto-end-shifts-every-5min'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select cron.schedule(
  'auto-end-shifts-every-5min',
  '*/5 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://ldyshcvwxfzvfjrkcfgw.supabase.co/functions/v1/auto-end-shifts',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $cmd$
);
