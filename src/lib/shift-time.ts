// =============================================================================
// Live shift time — worked / paused minutes for an OPEN (active) shift.
// =============================================================================
// `shifts.minutes_worked` and `total_paused_minutes` are only finalized when a
// shift is closed. While a shift is running we must compute these on the fly,
// otherwise the UI shows "0ч 0м" for a shift that's been active for hours and
// "На паузе: 0 мин" while a pause is currently open. Pure + tested so both
// /me and /me/shifts can rely on identical numbers.
// =============================================================================

export interface LiveShift {
  started_at: string;
  ended_at?: string | null;
  minutes_worked?: number | null;
  total_paused_minutes?: number | null;
  is_paused?: boolean | null;
  paused_at?: string | null;
}

/**
 * Total paused minutes including any CURRENTLY OPEN pause.
 * - Closed shift: returns the stored total_paused_minutes.
 * - Open shift: stored closed-pause total + the open pause's elapsed time.
 */
export function computeLivePausedMinutes(shift: LiveShift, now: Date = new Date()): number {
  const stored = shift.total_paused_minutes ?? 0;
  // For a closed shift the stored value already includes everything.
  if (shift.ended_at) return Math.max(0, stored);

  let total = Math.max(0, stored);
  if (shift.is_paused && shift.paused_at) {
    const openMs = now.getTime() - new Date(shift.paused_at).getTime();
    total += Math.max(0, Math.floor(openMs / 60000));
  }
  return total;
}

/**
 * Net worked minutes (excluding paused time).
 * - Closed shift: returns the stored minutes_worked.
 * - Open shift: elapsed since start minus all paused time (incl. open pause).
 */
export function computeLiveWorkedMinutes(shift: LiveShift, now: Date = new Date()): number {
  if (shift.ended_at) return Math.max(0, shift.minutes_worked ?? 0);

  const elapsedMs = now.getTime() - new Date(shift.started_at).getTime();
  const elapsedMin = Math.max(0, Math.floor(elapsedMs / 60000));
  const paused = computeLivePausedMinutes(shift, now);
  return Math.max(0, elapsedMin - paused);
}

/**
 * Aggregate live worked + paused across a set of shifts (one day bucket).
 * Closed shifts contribute their stored values; the open one contributes live.
 */
export function sumLiveTime(
  shifts: LiveShift[],
  now: Date = new Date(),
): { workedMinutes: number; pausedMinutes: number } {
  let workedMinutes = 0;
  let pausedMinutes = 0;
  for (const s of shifts) {
    workedMinutes += computeLiveWorkedMinutes(s, now);
    pausedMinutes += computeLivePausedMinutes(s, now);
  }
  return { workedMinutes, pausedMinutes };
}
