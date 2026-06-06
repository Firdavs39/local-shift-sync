import { describe, it, expect } from 'vitest';
import {
  computeLivePausedMinutes,
  computeLiveWorkedMinutes,
  sumLiveTime,
} from '../shift-time';

const NOW = new Date('2026-06-06T16:12:00Z');

describe('computeLivePausedMinutes', () => {
  it('closed shift returns stored total', () => {
    expect(computeLivePausedMinutes({
      started_at: '2026-06-06T09:00:00Z',
      ended_at: '2026-06-06T13:00:00Z',
      total_paused_minutes: 26,
      is_paused: false,
    }, NOW)).toBe(26);
  });

  it('open shift, not paused → stored only', () => {
    expect(computeLivePausedMinutes({
      started_at: '2026-06-06T14:00:00Z',
      ended_at: null,
      total_paused_minutes: 10,
      is_paused: false,
    }, NOW)).toBe(10);
  });

  it('open shift with an OPEN pause adds elapsed pause time', () => {
    // paused at 15:58 UTC, now 16:12 UTC → 14 min open + 0 stored
    expect(computeLivePausedMinutes({
      started_at: '2026-06-06T14:16:00Z',
      ended_at: null,
      total_paused_minutes: 0,
      is_paused: true,
      paused_at: '2026-06-06T15:58:00Z',
    }, NOW)).toBe(14);
  });

  it('open pause adds to previously closed pauses', () => {
    expect(computeLivePausedMinutes({
      started_at: '2026-06-06T14:00:00Z',
      ended_at: null,
      total_paused_minutes: 20,
      is_paused: true,
      paused_at: '2026-06-06T16:02:00Z', // 10 min open
    }, NOW)).toBe(30);
  });
});

describe('computeLiveWorkedMinutes', () => {
  it('closed shift returns stored minutes_worked', () => {
    expect(computeLiveWorkedMinutes({
      started_at: '2026-06-06T11:15:00Z',
      ended_at: '2026-06-06T13:15:00Z',
      minutes_worked: 93,
    }, NOW)).toBe(93);
  });

  it('active shift: elapsed minus paused (this is the "0ч 0м" bug)', () => {
    // started 14:16, now 16:12 = 116 min elapsed; open pause since 15:58 = 14 min
    // worked = 116 - 14 = 102
    expect(computeLiveWorkedMinutes({
      started_at: '2026-06-06T14:16:00Z',
      ended_at: null,
      minutes_worked: null,
      total_paused_minutes: 0,
      is_paused: true,
      paused_at: '2026-06-06T15:58:00Z',
    }, NOW)).toBe(102);
  });

  it('active shift, never paused: full elapsed', () => {
    // started 14:12, now 16:12 = 120 min
    expect(computeLiveWorkedMinutes({
      started_at: '2026-06-06T14:12:00Z',
      ended_at: null,
      total_paused_minutes: 0,
      is_paused: false,
    }, NOW)).toBe(120);
  });

  it('never negative', () => {
    expect(computeLiveWorkedMinutes({
      started_at: '2026-06-06T16:20:00Z', // start in the future vs NOW
      ended_at: null,
      total_paused_minutes: 0,
    }, NOW)).toBe(0);
  });
});

describe('sumLiveTime', () => {
  it('mixes a closed shift and an open one', () => {
    const closed = {
      started_at: '2026-06-06T11:15:00Z',
      ended_at: '2026-06-06T13:15:00Z',
      minutes_worked: 93,
      total_paused_minutes: 26,
    };
    const open = {
      started_at: '2026-06-06T14:16:00Z',
      ended_at: null,
      minutes_worked: null,
      total_paused_minutes: 0,
      is_paused: true,
      paused_at: '2026-06-06T15:58:00Z',
    };
    const { workedMinutes, pausedMinutes } = sumLiveTime([closed, open], NOW);
    expect(workedMinutes).toBe(93 + 102);
    expect(pausedMinutes).toBe(26 + 14);
  });
});
