import { describe, it, expect } from 'vitest';
import {
  formatTimeInTz,
  getDayKeyInTz,
  getDayStartInTz,
  getExpectedEndForShift,
  getMinutesLate,
  calculateEarlyMinutes,
} from '../time';

const TZ = 'Asia/Tashkent'; // UTC+5

describe('formatTimeInTz', () => {
  it('renders UTC instant in site timezone', () => {
    // 2026-05-12 18:00 UTC = 23:00 Tashkent
    expect(formatTimeInTz(new Date('2026-05-12T18:00:00Z'), TZ)).toBe('23:00');
  });
  it('falls back to local when tz is null', () => {
    expect(formatTimeInTz(new Date('2026-05-12T18:00:00Z'), null)).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('getDayKeyInTz', () => {
  it('buckets late-night UTC into the correct local day', () => {
    // 2026-05-12 23:00 UTC = 2026-05-13 04:00 Tashkent
    expect(getDayKeyInTz(new Date('2026-05-12T23:00:00Z'), TZ)).toBe('2026-05-13');
  });
  it('same instant differs by zone', () => {
    const t = new Date('2026-05-12T18:00:00Z');
    expect(getDayKeyInTz(t, TZ)).toBe('2026-05-12');       // 23:00 local
    expect(getDayKeyInTz(t, 'America/New_York')).toBe('2026-05-12'); // 14:00 local
  });
});

describe('getDayStartInTz', () => {
  it('returns the UTC instant of local midnight', () => {
    // For 2026-05-12 18:00 UTC in Tashkent, local day is 2026-05-12,
    // midnight = 2026-05-11 19:00 UTC (00:00 +5)
    const start = getDayStartInTz(new Date('2026-05-12T18:00:00Z'), TZ);
    expect(formatTimeInTz(start, TZ)).toBe('00:00');
  });
});

describe('getExpectedEndForShift', () => {
  it('same-day end', () => {
    const started = new Date('2026-05-12T04:00:00Z'); // 09:00 Tashkent
    const end = getExpectedEndForShift(started, '18:00', TZ);
    // 18:00 Tashkent = 13:00 UTC same day
    expect(end.toISOString()).toBe('2026-05-12T13:00:00.000Z');
  });

  it('overnight end rolls to next day', () => {
    const started = new Date('2026-05-12T17:00:00Z'); // 22:00 Tashkent
    const end = getExpectedEndForShift(started, '06:00', TZ);
    // 06:00 next day Tashkent = 01:00 UTC 2026-05-13
    expect(end.toISOString()).toBe('2026-05-13T01:00:00.000Z');
  });
});

describe('getMinutesLate / calculateEarlyMinutes', () => {
  it('late by 22 minutes', () => {
    // expected 09:00 Tashkent, actual 09:22 = 04:22 UTC
    const late = getMinutesLate(new Date('2026-05-12T04:22:00Z'), '09:00', TZ);
    expect(late).toBe(22);
  });
  it('not late when early', () => {
    const late = getMinutesLate(new Date('2026-05-12T03:50:00Z'), '09:00', TZ); // 08:50
    expect(late).toBe(0);
  });
  it('early by 13 minutes', () => {
    const early = calculateEarlyMinutes(new Date('2026-05-12T03:47:00Z'), '09:00', TZ); // 08:47
    expect(early).toBe(13);
  });
});
