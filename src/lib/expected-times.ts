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
