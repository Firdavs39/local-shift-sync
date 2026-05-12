-- =============================================================================
-- Stage 1: Accuracy cap setting + canonical pause_history format
-- =============================================================================
-- 1. accuracy_cap_m on `settings` lets admins tune the GPS-error buffer used
--    by evaluateRadius() per company. 0 = strict mode.
-- 2. Backfill existing pause_history entries to a single canonical schema:
--    {paused_at, resumed_at?, reason: 'auto'|'manual', duration_minutes?}.
--    Some rows were written by the auto-end-shifts function using
--    {started_at, ended_at, duration_minutes} — that schema is normalized
--    here so downstream code (discipline metrics, who-is-on-shift, reports)
--    only has to read one shape.
-- =============================================================================

-- 1. accuracy_cap_m column on settings (multi-tenant: one row per company).
alter table public.settings
  add column if not exists accuracy_cap_m integer not null default 60;

comment on column public.settings.accuracy_cap_m is
  'Upper bound (meters) on the GPS accuracy buffer used in evaluateRadius. '
  '0 = strict (raw distance only). Default 60 = tolerant to typical urban GPS error.';

-- 2. Backfill pause_history to canonical {paused_at, resumed_at, reason} shape.
--    Entries already in canonical form are passed through untouched.
update public.shifts
set pause_history = coalesce(
  (
    select jsonb_agg(
      case
        -- Already canonical: has paused_at → keep, but ensure `reason` is set.
        when entry ? 'paused_at' then
          case
            when entry ? 'reason' then entry
            else entry || jsonb_build_object('reason', 'auto')
          end
        -- Legacy from auto-end-shifts: {started_at, ended_at, duration_minutes}
        when entry ? 'started_at' then
          jsonb_strip_nulls(jsonb_build_object(
            'paused_at',         entry->'started_at',
            'resumed_at',        entry->'ended_at',
            'reason',            coalesce(entry->>'reason', 'auto'),
            'duration_minutes',  entry->'duration_minutes'
          ))
        else entry
      end
    )
    from jsonb_array_elements(pause_history) as entry
  ),
  '[]'::jsonb
)
where pause_history is not null
  and jsonb_typeof(pause_history) = 'array'
  and jsonb_array_length(pause_history) > 0;
