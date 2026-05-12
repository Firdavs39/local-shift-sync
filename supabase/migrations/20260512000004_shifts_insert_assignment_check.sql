-- =============================================================================
-- Stage 4: Tighten shifts.insert RLS — workers can only start shifts on sites
-- they're assigned to (if any assignments exist for them).
-- =============================================================================
-- This complements the client-side filter in Me.tsx by enforcing the same
-- rule on the server. Soft-rollout policy: if a worker has zero assignments,
-- they can still start a shift anywhere (mirrors pre-assignment behaviour);
-- once at least one assignment exists, only assigned sites are permitted.
-- =============================================================================

drop policy if exists "company_shifts_insert" on public.shifts;

create policy "company_shifts_insert"
  on public.shifts for insert to authenticated
  with check (
    user_id = auth.uid()
    and company_id = public.get_my_company_id()
    and (
      -- Soft rollout: no assignments → unrestricted.
      not exists (
        select 1 from public.worker_site_assignments
        where user_id = auth.uid()
      )
      -- Has assignments → must include this site.
      or exists (
        select 1 from public.worker_site_assignments wsa
        where wsa.user_id = auth.uid()
          and wsa.site_id = shifts.site_id
      )
    )
  );
