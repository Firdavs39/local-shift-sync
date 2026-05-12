-- =============================================================================
-- Stage 5 advisor fixes:
--   1. touch_worker_site_assignments_updated_at — fix mutable search_path
--      (security linter 0011: search_path hijacking via temp schemas).
--   2. am_i_first_today — revoke execute from anon (security linter 0028):
--      the function returns false for anon anyway (auth.uid() is null), but
--      the advisor flags any anon-callable SECURITY DEFINER function.
-- =============================================================================

create or replace function public.touch_worker_site_assignments_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.am_i_first_today() from anon, public;
grant execute on function public.am_i_first_today() to authenticated;
