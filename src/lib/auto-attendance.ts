// =============================================================================
// Auto-attendance decision logic (pure, testable)
// =============================================================================
// "Человек пришёл — как только вошёл в радиус, автоматически фиксируется
//  начало работы." This module decides whether a geofence/location event
//  should auto-START a shift. It is intentionally free of React, Supabase and
//  Capacitor so it can be unit-tested in isolation and reused by both the web
//  fallback and the native geofence callback.
//
// Auto-END is deliberately NOT done here: leaving the radius = auto-PAUSE (the
// worker may step out briefly), and the shift is closed at expected_end by the
// auto-end-shifts cron or manually. Auto-attendance == auto-start on enter.
// =============================================================================

import { isWorkDay } from './expected-times';
import { getExpectedDateInTz } from './time';
import type { RadiusVerdict } from './geo';

export type AutoStartReason =
  | 'ok'                 // all conditions met → start
  | 'already-active'     // a shift is already running
  | 'not-inside'         // verdict is 'outside' or 'uncertain'
  | 'not-workday'        // today isn't in the worker's work_days
  | 'outside-window'     // too early / too late relative to the schedule
  | 'no-assignment';     // worker isn't assigned to this site

export interface AutoStartDecision {
  shouldStart: boolean;
  reason: AutoStartReason;
}

export interface AutoStartInput {
  /** Result of evaluateRadius() — only 'inside' triggers a start. */
  verdict: RadiusVerdict;
  /** Is there already an open (not ended) shift for this worker? */
  hasActiveShift: boolean;
  /** Worker's schedule on this site. null = not assigned (no auto-start). */
  schedule: {
    expected_start: string;   // 'HH:MM'
    expected_end: string;     // 'HH:MM'
    work_days: number[] | null; // ISO 1..7, null = any day
    timezone: string | null;  // site IANA tz
  } | null;
  /** Current instant. */
  now: Date;
  /**
   * How many minutes BEFORE expected_start auto-start is allowed (early arrival).
   * Default 120 — a worker who shows up 2h early still gets clocked in.
   */
  graceBeforeMinutes?: number;
  /**
   * How many minutes AFTER expected_end auto-start is still allowed. Default 0:
   * once the scheduled end has passed we don't silently begin a new shift
   * (that would be overtime the worker should start deliberately).
   */
  graceAfterMinutes?: number;
}

/**
 * True if `now` falls within the auto-start window for the given schedule,
 * interpreted in the site's timezone. Overnight schedules (start > end, e.g.
 * 22:00→06:00) are handled by extending the end to the next day.
 */
export function isWithinAutoStartWindow(
  now: Date,
  expectedStart: string,
  expectedEnd: string,
  timezone: string | null,
  graceBeforeMinutes = 120,
  graceAfterMinutes = 0,
): boolean {
  const tz = timezone || 'UTC';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const t = now.getTime();

  // Build the [windowStart, windowEnd] for a schedule anchored on `anchor`'s
  // local calendar day. Overnight shifts (end clock < start clock) extend the
  // end to the next day.
  const windowFor = (anchor: Date): [number, number] => {
    const start = getExpectedDateInTz(anchor, expectedStart, tz);
    let end = getExpectedDateInTz(anchor, expectedEnd, tz);
    if (end.getTime() <= start.getTime()) {
      end = new Date(end.getTime() + DAY_MS);
    }
    return [
      start.getTime() - graceBeforeMinutes * 60_000,
      end.getTime() + graceAfterMinutes * 60_000,
    ];
  };

  // Check both today's anchor and yesterday's anchor. The yesterday anchor
  // catches overnight shifts in their early-morning hours (e.g. at 02:00 the
  // worker is still inside a shift that began at 22:00 the previous evening).
  for (const anchor of [now, new Date(t - DAY_MS)]) {
    const [ws, we] = windowFor(anchor);
    if (t >= ws && t <= we) return true;
  }
  return false;
}

/**
 * Decide whether to auto-start a shift. Pure function — no side effects.
 */
export function decideAutoStart(input: AutoStartInput): AutoStartDecision {
  const {
    verdict,
    hasActiveShift,
    schedule,
    now,
    graceBeforeMinutes = 120,
    graceAfterMinutes = 0,
  } = input;

  if (hasActiveShift) return { shouldStart: false, reason: 'already-active' };
  if (!schedule) return { shouldStart: false, reason: 'no-assignment' };

  // Only a definite 'inside' triggers a start. 'uncertain' (radius edge) and
  // 'outside' must not auto-clock-in, or workers walking past would get
  // phantom shifts.
  if (verdict !== 'inside') return { shouldStart: false, reason: 'not-inside' };

  if (!isWorkDay(now, schedule.work_days, schedule.timezone)) {
    return { shouldStart: false, reason: 'not-workday' };
  }

  if (!isWithinAutoStartWindow(
    now,
    schedule.expected_start,
    schedule.expected_end,
    schedule.timezone,
    graceBeforeMinutes,
    graceAfterMinutes,
  )) {
    return { shouldStart: false, reason: 'outside-window' };
  }

  return { shouldStart: true, reason: 'ok' };
}
