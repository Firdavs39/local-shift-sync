-- =============================================================================
-- Stage 2: am_i_first_today() — privacy-preserving "first of the day" check.
-- =============================================================================
-- Workers can only SELECT their own shifts (RLS policy
-- `company_shifts_worker_select` restricts `user_id = auth.uid()`). To award
-- the "first on shift today" badge, the frontend needs to know who started
-- the earliest shift in the company — but that user's ID is sensitive.
--
-- This SECURITY DEFINER function exposes only a boolean: "is the calling user
-- the first shift-starter in their company today?" — no UUIDs leak to anyone
-- other than the holder of the badge.
-- =============================================================================

create or replace function public.am_i_first_today()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  with my_company as (
    select public.get_my_company_id() as cid
  ),
  earliest as (
    select s.user_id
    from public.shifts s, my_company c
    where s.company_id = c.cid
      and s.started_at >= date_trunc('day', timezone('utc', now()))
    order by s.started_at asc
    limit 1
  )
  select coalesce((select user_id from earliest), '00000000-0000-0000-0000-000000000000'::uuid) = auth.uid();
$$;

revoke all on function public.am_i_first_today() from public;
grant execute on function public.am_i_first_today() to authenticated;

comment on function public.am_i_first_today() is
  'True iff the caller has the earliest started_at among today''s shifts in their company. '
  'Privacy-preserving: returns boolean only, never the actual first user''s id.';
