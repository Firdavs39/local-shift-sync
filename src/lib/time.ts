import { format, differenceInMinutes } from 'date-fns';

export function formatTime(date: Date): string {
  return format(date, 'HH:mm');
}

export function formatDate(date: Date): string {
  return format(date, 'dd.MM.yyyy');
}

export function formatDateTime(date: Date): string {
  return format(date, 'dd.MM.yyyy HH:mm');
}

export function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

/**
 * Build a Date that represents the given HH:MM time on the same calendar date
 * as `reference`, but interpreted in the given IANA timezone.
 *
 * Example: reference=2026-05-12T18:00Z, expected="09:00", tz="Europe/Moscow"
 * → returns a Date whose UTC value corresponds to 2026-05-12 09:00 Moscow time.
 *
 * Why this matters: `Date.setHours()` works in the BROWSER's local timezone,
 * not the site's timezone. A worker in Dubai checking against a Moscow-based
 * site needs the comparison done in Moscow time. This util encapsulates that.
 */
export function getExpectedDateInTz(
  reference: Date,
  expectedTimeStr: string,
  timezone: string
): Date {
  const { hours, minutes } = parseTime(expectedTimeStr);
  // Step 1: take the current "real" time and re-parse it as if it were a UTC
  // wall-clock matching the site's local time. That gives us today's date in
  // the site's timezone.
  const refAsTzLocal = new Date(reference.toLocaleString('en-US', { timeZone: timezone }));
  // Step 2: the delta between the real instant and this "fake-UTC" view tells
  // us the offset to add back to convert site-local → real UTC.
  const tzOffsetMs = reference.getTime() - refAsTzLocal.getTime();
  // Step 3: set HH:MM on the site-local date, then add the offset back.
  const expectedLocal = new Date(refAsTzLocal);
  expectedLocal.setHours(hours, minutes, 0, 0);
  return new Date(expectedLocal.getTime() + tzOffsetMs);
}

/**
 * True if `now` is at-or-after the given expected time, interpreted in the
 * given timezone. Used to detect "started after shift end → overtime".
 *
 * If timezone is omitted, falls back to the browser's local timezone (this
 * preserves legacy callers that didn't pass a tz).
 */
export function isAfterExpected(
  now: Date,
  expectedTimeStr: string,
  timezone?: string
): boolean {
  const expected = timezone
    ? getExpectedDateInTz(now, expectedTimeStr, timezone)
    : (() => {
        const { hours, minutes } = parseTime(expectedTimeStr);
        const e = new Date(now);
        e.setHours(hours, minutes, 0, 0);
        return e;
      })();
  return now.getTime() >= expected.getTime();
}

/**
 * Compute the absolute expected_end timestamp for a shift that may cross
 * midnight (e.g. started at 22:00, expected_end='02:00' → end is next day's
 * 02:00, not today's). If expected_end falls earlier on the clock than
 * started_at within the site's timezone, add 24h.
 */
export function getExpectedEndForShift(
  startedAt: Date,
  expectedEndStr: string,
  timezone: string
): Date {
  // Anchor expected_end to the started_at's calendar day in the site's tz.
  const expectedEnd = getExpectedDateInTz(startedAt, expectedEndStr, timezone);
  if (expectedEnd.getTime() <= startedAt.getTime()) {
    // Same day in tz is in the past relative to start → must be next day.
    return new Date(expectedEnd.getTime() + 24 * 60 * 60 * 1000);
  }
  return expectedEnd;
}

export function getMinutesLate(
  actualTime: Date,
  expectedTimeStr: string,
  timezone?: string
): number {
  const expected = timezone
    ? getExpectedDateInTz(actualTime, expectedTimeStr, timezone)
    : (() => {
        const { hours, minutes } = parseTime(expectedTimeStr);
        const e = new Date(actualTime);
        e.setHours(hours, minutes, 0, 0);
        return e;
      })();
  const diff = differenceInMinutes(actualTime, expected);
  return diff > 0 ? diff : 0;
}

export function getShiftStatus(
  actualTime: Date,
  expectedTimeStr: string,
  isWithinSite: boolean,
  timezone?: string
): 'early' | 'on_time' | 'late' | 'offsite' {
  if (!isWithinSite) return 'offsite';

  const minutesLate = getMinutesLate(actualTime, expectedTimeStr, timezone);

  if (minutesLate === 0) {
    const expected = timezone
      ? getExpectedDateInTz(actualTime, expectedTimeStr, timezone)
      : (() => {
          const { hours, minutes } = parseTime(expectedTimeStr);
          const e = new Date(actualTime);
          e.setHours(hours, minutes, 0, 0);
          return e;
        })();

    if (actualTime < expected) return 'early';
    return 'on_time';
  }

  return 'late';
}

export function calculateMinutesWorked(start: Date, end: Date): number {
  return differenceInMinutes(end, start);
}

export function calculateEarlyMinutes(
  startedAt: Date,
  expectedStart: string,
  timezone?: string
): number {
  const expected = timezone
    ? getExpectedDateInTz(startedAt, expectedStart, timezone)
    : (() => {
        const { hours, minutes } = parseTime(expectedStart);
        const e = new Date(startedAt);
        e.setHours(hours, minutes, 0, 0);
        return e;
      })();
  const diff = differenceInMinutes(expected, startedAt);
  return diff > 0 ? diff : 0;
}
