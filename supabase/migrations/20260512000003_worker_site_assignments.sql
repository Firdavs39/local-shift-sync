-- =============================================================================
-- Stage 3: worker_site_assignments — per-(user, site) schedule overrides.
-- =============================================================================
-- The OLD model kept `expected_start` and `expected_end` on the `sites` table:
-- a single schedule applied to every worker on that site. The NEW model lets
-- each worker have their own schedule per site, while preserving the site
-- defaults as a fallback (override pattern).
--
-- Effective schedule resolution:
--   1. worker_site_assignments.(expected_start, expected_end) if present and NOT NULL
--   2. fallback to sites.(expected_start, expected_end)
--
-- This keeps backwards compatibility: workers who haven't been assigned
-- individual schedules continue to be measured against the site defaults.
-- =============================================================================

create table if not exists public.worker_site_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  expected_start text,
  expected_end text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, site_id)
);

comment on table public.worker_site_assignments is
  'Per-(user, site) schedule overrides. NULL expected_* fields mean "use site defaults".';

create index if not exists worker_site_assignments_company_idx
  on public.worker_site_assignments (company_id);
create index if not exists worker_site_assignments_user_idx
  on public.worker_site_assignments (user_id);
create index if not exists worker_site_assignments_site_idx
  on public.worker_site_assignments (site_id);

alter table public.worker_site_assignments enable row level security;

-- All members of the company can SELECT — workers need to read their own
-- effective schedule, admins read all to manage assignments.
create policy "company_wsa_select"
  on public.worker_site_assignments for select to authenticated
  using (company_id = public.get_my_company_id());

-- Only admins can INSERT/UPDATE/DELETE assignments.
create policy "company_wsa_admin_write"
  on public.worker_site_assignments for all to authenticated
  using (
    company_id = public.get_my_company_id()
    and public.has_role(auth.uid(), 'admin')
  )
  with check (
    company_id = public.get_my_company_id()
    and public.has_role(auth.uid(), 'admin')
  );

-- updated_at touch trigger so admin tooling can see "last changed".
create or replace function public.touch_worker_site_assignments_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists worker_site_assignments_set_updated_at on public.worker_site_assignments;
create trigger worker_site_assignments_set_updated_at
  before update on public.worker_site_assignments
  for each row execute function public.touch_worker_site_assignments_updated_at();
