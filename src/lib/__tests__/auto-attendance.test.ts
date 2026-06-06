import { describe, it, expect } from 'vitest';
import { decideAutoStart, isWithinAutoStartWindow } from '../auto-attendance';
import { isoDayOfWeekInTz } from '../expected-times';

const TZ = 'Asia/Tashkent'; // UTC+5, no DST

// 2026-06-08 09:30 Tashkent = 04:30 UTC
const at = (utcIso: string) => new Date(utcIso);

const baseSchedule = {
  expected_start: '09:00',
  expected_end: '18:00',
  work_days: null as number[] | null,
  timezone: TZ,
};

describe('isWithinAutoStartWindow', () => {
  it('true during the shift', () => {
    // 09:30 Tashkent = 04:30 UTC
    expect(isWithinAutoStartWindow(at('2026-06-08T04:30:00Z'), '09:00', '18:00', TZ)).toBe(true);
  });

  it('true within early-arrival grace (08:00, grace 120min)', () => {
    // 08:00 Tashkent = 03:00 UTC, 1h before 09:00 start, within 120min grace
    expect(isWithinAutoStartWindow(at('2026-06-08T03:00:00Z'), '09:00', '18:00', TZ, 120)).toBe(true);
  });

  it('false too early (06:00, beyond grace)', () => {
    // 06:00 Tashkent = 01:00 UTC, 3h before start, beyond 120min grace
    expect(isWithinAutoStartWindow(at('2026-06-08T01:00:00Z'), '09:00', '18:00', TZ, 120)).toBe(false);
  });

  it('false after expected_end (default graceAfter=0)', () => {
    // 18:30 Tashkent = 13:30 UTC, past 18:00 end
    expect(isWithinAutoStartWindow(at('2026-06-08T13:30:00Z'), '09:00', '18:00', TZ)).toBe(false);
  });

  it('handles overnight shift 22:00→06:00', () => {
    // 23:00 Tashkent = 18:00 UTC — inside an overnight shift
    expect(isWithinAutoStartWindow(at('2026-06-08T18:00:00Z'), '22:00', '06:00', TZ)).toBe(true);
    // 02:00 Tashkent next day = 21:00 UTC prev day — still inside overnight shift
    expect(isWithinAutoStartWindow(at('2026-06-08T21:00:00Z'), '22:00', '06:00', TZ)).toBe(true);
  });
});

describe('decideAutoStart', () => {
  const now = at('2026-06-08T04:30:00Z'); // 09:30 Tashkent

  it('starts when inside, workday, in window, no active shift', () => {
    const d = decideAutoStart({ verdict: 'inside', hasActiveShift: false, schedule: baseSchedule, now });
    expect(d).toEqual({ shouldStart: true, reason: 'ok' });
  });

  it('does not start when a shift is already active', () => {
    const d = decideAutoStart({ verdict: 'inside', hasActiveShift: true, schedule: baseSchedule, now });
    expect(d).toEqual({ shouldStart: false, reason: 'already-active' });
  });

  it('does not start without an assignment', () => {
    const d = decideAutoStart({ verdict: 'inside', hasActiveShift: false, schedule: null, now });
    expect(d).toEqual({ shouldStart: false, reason: 'no-assignment' });
  });

  it('does not start when verdict is outside', () => {
    const d = decideAutoStart({ verdict: 'outside', hasActiveShift: false, schedule: baseSchedule, now });
    expect(d).toEqual({ shouldStart: false, reason: 'not-inside' });
  });

  it('does not start when verdict is uncertain (radius edge)', () => {
    const d = decideAutoStart({ verdict: 'uncertain', hasActiveShift: false, schedule: baseSchedule, now });
    expect(d).toEqual({ shouldStart: false, reason: 'not-inside' });
  });

  it('does not start on a non-working day', () => {
    // pick a work_days list that excludes today's ISO day in the site tz
    const todayIso = isoDayOfWeekInTz(now, TZ);
    const notToday = [todayIso === 7 ? 1 : todayIso + 1];
    const d = decideAutoStart({
      verdict: 'inside',
      hasActiveShift: false,
      schedule: { ...baseSchedule, work_days: notToday },
      now,
    });
    expect(d).toEqual({ shouldStart: false, reason: 'not-workday' });
  });

  it('starts on a working day when today is in work_days', () => {
    const todayIso = isoDayOfWeekInTz(now, TZ);
    const d = decideAutoStart({
      verdict: 'inside',
      hasActiveShift: false,
      schedule: { ...baseSchedule, work_days: [todayIso] },
      now,
    });
    expect(d.shouldStart).toBe(true);
  });

  it('does not start outside the time window (3am)', () => {
    const night = at('2026-06-07T22:00:00Z'); // 03:00 Tashkent
    const d = decideAutoStart({ verdict: 'inside', hasActiveShift: false, schedule: baseSchedule, now: night });
    expect(d).toEqual({ shouldStart: false, reason: 'outside-window' });
  });
});
