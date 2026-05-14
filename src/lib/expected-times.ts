// =============================================================================
// Effective expected_start / expected_end resolution for a (user, site) pair.
// =============================================================================
// Override pattern: worker_site_assignments.expected_* may be NULL meaning
// "use site default". This module centralizes the fallback logic so callers
// don't sprinkle `assignment?.expected_start ?? site.expected_start` all over.
// =============================================================================

export interface SiteDefaults {
  expected_start: string;
  expected_end: string;
  timezone?: string | null;
}

export interface AssignmentOverride {
  expected_start: string | null;
  expected_end: string | null;
  /** ISO day-of-week (1=Mon..7=Sun). null/empty = "any day". */
  work_days?: number[] | null;
}

/**
 * Convert a Date to its ISO day-of-week (1=Mon..7=Sun) in the given timezone.
 * Native `Date.getDay()` returns 0-6 with Sunday=0; we map to ISO and also let
 * the caller specify the site's tz so a Tashkent late-night shift is bucketed
 * by Tashkent's day, not the server's.
 */
export function isoDayOfWeekInTz(date: Date, timezone?: string | null): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || undefined,
    weekday: 'short',
  });
  const wd = fmt.format(date); // 'Mon' | 'Tue' | ...
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wd] ?? 1;
}

/**
 * True if the given calendar day (in site tz) is included in the worker's
 * assignment schedule. A NULL/empty work_days array means "any day".
 */
export function isWorkDay(
  date: Date,
  workDays: number[] | null | undefined,
  timezone?: string | null,
): boolean {
  if (!workDays || workDays.length === 0) return true;
  return workDays.includes(isoDayOfWeekInTz(date, timezone));
}

export interface EffectiveTimes {
  start: string;
  end: string;
  /** Where the values came from. 'mixed' = one from each (e.g. start overridden, end default). */
  source: 'assignment' | 'site_default' | 'mixed';
}

export function pickEffectiveTimes(
  assignment: AssignmentOverride | null | undefined,
  site: SiteDefaults,
): EffectiveTimes {
  const start = assignment?.expected_start ?? site.expected_start;
  const end = assignment?.expected_end ?? site.expected_end;
  const startFromAssignment = !!assignment?.expected_start;
  const endFromAssignment = !!assignment?.expected_end;
  let source: EffectiveTimes['source'];
  if (startFromAssignment && endFromAssignment) source = 'assignment';
  else if (!startFromAssignment && !endFromAssignment) source = 'site_default';
  else source = 'mixed';
  return { start, end, source };
}
