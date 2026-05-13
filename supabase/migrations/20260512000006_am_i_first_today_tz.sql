-- =============================================================================
-- am_i_first_today: tz-aware version
-- =============================================================================
-- "Today" is now interpreted in the timezone the caller provides (typically
-- the site's tz), so a worker in Tashkent who starts at 02:00 local time
-- is correctly compared against the local calendar day, not the UTC one.
--
-- The previous no-arg signature is dropped to avoid PostgREST ambiguity.
-- =============================================================================

drop function if exists public.am_i_first_today();

create or replace function public.am_i_first_today(tz text default 'UTC')
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
      and s.started_at >= date_trunc('day', timezone(tz, now())) at time zone tz
    order by s.started_at asc
    limit 1
  )
  select coalesce((select user_id from earliest), '00000000-0000-0000-0000-000000000000'::uuid) = auth.uid();
$$;

revoke execute on function public.am_i_first_today(text) from anon, public;
grant execute on function public.am_i_first_today(text) to authenticated;

comment on function public.am_i_first_today(text) is
  'True iff the caller has the earliest started_at among today''s shifts in their company, '
  'where "today" is interpreted in the provided IANA timezone (default UTC). '
  'Privacy-preserving: returns boolean only.';
