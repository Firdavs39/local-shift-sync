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

// ---------------------------------------------------------------------------
// Timezone-aware formatting + day boundaries.
// All shift timestamps are stored in UTC; UI/grouping must use the SITE's
// timezone, never the browser's. These helpers wrap Intl APIs so callers
// don't have to construct DateTimeFormat options every time.
// ---------------------------------------------------------------------------

/** "HH:mm" in the given IANA timezone. Falls back to local time if tz is empty. */
export function formatTimeInTz(date: Date, timezone?: string | null): string {
  if (!timezone) return formatTime(date);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** "dd.MM.yyyy" in the given IANA timezone. Falls back to local time if tz is empty. */
export function formatDateInTz(date: Date, timezone?: string | null): string {
  if (!timezone) return formatDate(date);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** "dd.MM.yyyy HH:mm" in the given IANA timezone. */
export function formatDateTimeInTz(date: Date, timezone?: string | null): string {
  if (!timezone) return formatDateTime(date);
  return `${formatDateInTz(date, timezone)} ${formatTimeInTz(date, timezone)}`;
}

/**
 * Returns a sortable "YYYY-MM-DD" key for `date` interpreted in `timezone`.
 * Use this to group shifts by "working day" independently of where the
 * server / browser is located.
 */
export function getDayKeyInTz(date: Date, timezone?: string | null): string {
  if (!timezone) {
    // Local-time fallback. en-CA's "short" gives "YYYY-MM-DD".
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/**
 * Returns the UTC instant corresponding to 00:00 on `reference`'s calendar
 * day in `timezone`. Use for "today" filters like
 * `shifts.started_at >= getDayStartInTz(new Date(), site.timezone)`.
 */
export function getDayStartInTz(reference: Date, timezone?: string | null): Date {
  if (!timezone) {
    const d = new Date(reference);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  // Same trick as getExpectedDateInTz: build the site-local view, set time
  // to midnight, convert back to real UTC via the tz offset.
  const refAsTzLocal = new Date(reference.toLocaleString('en-US', { timeZone: timezone }));
  const tzOffsetMs = reference.getTime() - refAsTzLocal.getTime();
  const midnightLocal = new Date(refAsTzLocal);
  midnightLocal.setHours(0, 0, 0, 0);
  return new Date(midnightLocal.getTime() + tzOffsetMs);
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
