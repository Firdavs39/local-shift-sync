// =============================================================================
// Discipline metrics — per-day aggregates across multiple shifts.
// =============================================================================
// All metrics are computed at read-time from the raw `shifts` rows for a
// given (user, site, calendar_day) bucket. This means stopping and restarting
// a shift during the day does NOT reset lateness or "time-off-site" — the
// numbers accumulate across the whole bucket.
// =============================================================================

import { differenceInMinutes } from 'date-fns';
import { getMinutesLate, calculateEarlyMinutes } from './time';

export interface PauseEntry {
  paused_at?: string;
  resumed_at?: string;
  /** 'auto' = exited radius, 'manual' = pressed pause. */
  reason?: 'auto' | 'manual';
  duration_minutes?: number;
  // Legacy fields some rows may still carry until backfill runs.
  started_at?: string;
  ended_at?: string;
}

export interface ShiftForStats {
  id: string;
  started_at: string;
  ended_at?: string | null;
  minutes_worked?: number | null;
  total_paused_minutes?: number | null;
  pause_history?: PauseEntry[] | null;
  is_overtime?: boolean | null;
  minutes_late?: number | null;
  status?: string | null;
}

export interface ExpectedTimes {
  start: string;          // 'HH:MM'
  end?: string;
  timezone?: string;      // IANA tz, e.g. 'Europe/Moscow'
}

export interface DayDisciplineStats {
  shiftsCount: number;
  /** Earliest `started_at` among the bucket's shifts (typically used to score lateness). */
  firstStartedAt: Date | null;
  /** Latest `ended_at` (null if any shift is still open). */
  lastEndedAt: Date | null;
  /** Sum of `minutes_worked` across the bucket. */
  totalWorkedMinutes: number;
  /** Sum of `total_paused_minutes` across the bucket = total time off-site / paused. */
  totalPausedMinutes: number;
  /** Number of auto-pause events across all shifts (= number of times worker left the radius). */
  outOfRadiusCount: number;
  /** Longest single absence in minutes. */
  longestAbsenceMinutes: number;
  /** Lateness based on FIRST shift's started_at vs expected.start. Stable across restarts. */
  minutesLate: number;
  /** Minutes the worker arrived early (>0 only if firstStartedAt < expected.start). */
  earlyMinutes: number;
  /** True if any shift in the bucket is flagged overtime. */
  hasOvertime: boolean;
}

const EMPTY_STATS: DayDisciplineStats = {
  shiftsCount: 0,
  firstStartedAt: null,
  lastEndedAt: null,
  totalWorkedMinutes: 0,
  totalPausedMinutes: 0,
  outOfRadiusCount: 0,
  longestAbsenceMinutes: 0,
  minutesLate: 0,
  earlyMinutes: 0,
  hasOvertime: false,
};

/**
 * Normalize a pause entry to read its fields regardless of which historical
 * schema produced it (canonical {paused_at, resumed_at} vs legacy
 * {started_at, ended_at}).
 */
function readPauseTimes(entry: PauseEntry): { startedAt: string | undefined; endedAt: string | undefined; reason: 'auto' | 'manual' } {
  const startedAt = entry.paused_at ?? entry.started_at;
  const endedAt = entry.resumed_at ?? entry.ended_at;
  // Legacy entries from auto-end-shifts had no `reason` — treat as 'auto'
  // (they were always created from radius exits or end-of-shift closures).
  const reason: 'auto' | 'manual' = entry.reason === 'manual' ? 'manual' : 'auto';
  return { startedAt, endedAt, reason };
}

function pauseDurationMinutes(entry: PauseEntry): number {
  if (typeof entry.duration_minutes === 'number') return Math.max(0, entry.duration_minutes);
  const { startedAt, endedAt } = readPauseTimes(entry);
  if (!startedAt || !endedAt) return 0;
  return Math.max(0, differenceInMinutes(new Date(endedAt), new Date(startedAt)));
}

/**
 * Compute daily discipline stats for one (user, site, day) bucket.
 *
 * `expected` is optional — if absent, lateness/early metrics are 0 and only
 * physical metrics (worked / paused / radius exits) are reported.
 */
export function computeDayStats(
  shifts: ShiftForStats[],
  expected: ExpectedTimes | null,
): DayDisciplineStats {
  if (!shifts || shifts.length === 0) return EMPTY_STATS;

  // Sort ascending by start so firstStartedAt is the earliest.
  const sorted = [...shifts].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
  );

  const firstStartedAt = new Date(sorted[0].started_at);
  let lastEndedAt: Date | null = null;
  let totalWorkedMinutes = 0;
  let totalPausedMinutes = 0;
  let outOfRadiusCount = 0;
  let longestAbsenceMinutes = 0;
  let hasOvertime = false;

  for (const shift of sorted) {
    totalWorkedMinutes += shift.minutes_worked ?? 0;
    totalPausedMinutes += shift.total_paused_minutes ?? 0;
    if (shift.is_overtime) hasOvertime = true;
    if (shift.ended_at) {
      const ended = new Date(shift.ended_at);
      if (!lastEndedAt || ended > lastEndedAt) lastEndedAt = ended;
    } else {
      // Open shift → no lastEndedAt for the bucket overall.
      lastEndedAt = null;
    }

    const history: PauseEntry[] = Array.isArray(shift.pause_history) ? shift.pause_history : [];
    for (const entry of history) {
      const { reason } = readPauseTimes(entry);
      if (reason === 'auto') outOfRadiusCount += 1;
      const dur = pauseDurationMinutes(entry);
      if (dur > longestAbsenceMinutes) longestAbsenceMinutes = dur;
    }
  }

  let minutesLate = 0;
  let earlyMinutes = 0;
  // Only score against expected.start if the first shift wasn't an overtime
  // start (overtime means it began AFTER expected_end — lateness is moot).
  if (expected?.start && !sorted[0].is_overtime) {
    minutesLate = getMinutesLate(firstStartedAt, expected.start, expected.timezone);
    earlyMinutes = calculateEarlyMinutes(firstStartedAt, expected.start, expected.timezone);
  }

  return {
    shiftsCount: sorted.length,
    firstStartedAt,
    lastEndedAt,
    totalWorkedMinutes,
    totalPausedMinutes,
    outOfRadiusCount,
    longestAbsenceMinutes,
    minutesLate,
    earlyMinutes,
    hasOvertime,
  };
}

/**
 * Format minutes as "Xч Yмин" or "Y мин" depending on size. UI helper.
 */
export function formatMinutes(mins: number): string {
  if (mins <= 0) return '0 мин';
  if (mins < 60) return `${mins} мин`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}
