// =============================================================================
// auto-end-shifts (cron every 5 minutes)
// =============================================================================
// Closes shifts that the worker forgot to close. Rules:
//   * Don't close at expected_end — workers may still be putting in overtime.
//   * Close 5 minutes before the worker's NEXT scheduled shift on any site.
//   * If there's no next shift today/tomorrow, close at 23:59 site-tz of the
//     day the shift started (or 23:59 today if the shift spans days).
//   * Pauses still subtracted; overtime_minutes flagged as 'pending'.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActiveShift {
  id: string;
  user_id: string;
  site_id: string;
  started_at: string;
  is_paused: boolean | null;
  paused_at: string | null;
  pause_history: unknown;
  total_paused_minutes: number | null;
  sites: { expected_end: string; timezone: string | null };
}

interface AssignmentRow {
  user_id: string;
  site_id: string;
  expected_start: string | null;
  expected_end: string | null;
  work_days: number[] | null;
  sites: { timezone: string | null };
}

/** Build a Date at the given HH:MM, anchored on `reference`'s calendar day in tz. */
function buildInTz(reference: Date, hhmm: string, timezone: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const refAsLocal = new Date(reference.toLocaleString('en-US', { timeZone: timezone }));
  const tzOffsetMs = reference.getTime() - refAsLocal.getTime();
  const local = new Date(refAsLocal);
  local.setHours(h, m, 0, 0);
  return new Date(local.getTime() + tzOffsetMs);
}

/** ISO day-of-week (1=Mon..7=Sun) of `date` in `timezone`. */
function isoDow(date: Date, timezone: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wd] ?? 1;
}

/**
 * Find the next scheduled shift start (UTC instant) for this user across all
 * their assignments, scanning today + tomorrow in each site's timezone.
 * Returns null if nothing scheduled in the next 48h.
 */
function findNextShiftStart(
  now: Date,
  assignments: AssignmentRow[],
  userId: string,
): Date | null {
  const candidates: Date[] = [];
  for (const a of assignments.filter(x => x.user_id === userId && x.expected_start)) {
    const tz = a.sites.timezone || 'UTC';
    const days: number[] = a.work_days && a.work_days.length > 0 ? a.work_days : [1, 2, 3, 4, 5, 6, 7];
    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
      const probeDay = new Date(now.getTime() + dayOffset * 86400000);
      if (!days.includes(isoDow(probeDay, tz))) continue;
      const startInstant = buildInTz(probeDay, a.expected_start!, tz);
      // Must be strictly in the future for our purposes.
      if (startInstant.getTime() > now.getTime() + 60_000) candidates.push(startInstant);
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0];
}

/** Today's 23:59:59.999 in the site's timezone, anchored on `reference`. */
function endOfDayInTz(reference: Date, timezone: string): Date {
  const refAsLocal = new Date(reference.toLocaleString('en-US', { timeZone: timezone }));
  const tzOffsetMs = reference.getTime() - refAsLocal.getTime();
  const local = new Date(refAsLocal);
  local.setHours(23, 59, 59, 999);
  return new Date(local.getTime() + tzOffsetMs);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: activeShifts, error } = await supabaseAdmin
      .from('shifts')
      .select(`
        id, user_id, site_id, started_at, is_paused, paused_at,
        pause_history, total_paused_minutes,
        sites!inner(expected_end, timezone)
      `)
      .is('ended_at', null);

    if (error) throw error;
    if (!activeShifts || activeShifts.length === 0) {
      return new Response(JSON.stringify({ message: 'No active shifts', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pull all assignments touching these (user, site) pairs + each user's
    // future assignments (we need them to compute "next shift start").
    const userIds = Array.from(new Set(activeShifts.map(s => s.user_id)));
    const { data: assignmentsRaw } = await supabaseAdmin
      .from('worker_site_assignments')
      .select('user_id, site_id, expected_start, expected_end, work_days, sites!inner(timezone)')
      .in('user_id', userIds);
    const assignments = (assignmentsRaw ?? []) as unknown as AssignmentRow[];

    const overrideEndByPair = new Map<string, string | null>();
    for (const a of assignments) {
      overrideEndByPair.set(`${a.user_id}|${a.site_id}`, a.expected_end);
    }

    const now = new Date();
    let endedCount = 0;

    for (const shiftRow of activeShifts) {
      const shift = shiftRow as unknown as ActiveShift;
      try {
        const site = shift.sites;
        if (!site || !site.expected_end) continue;

        const overrideEnd = overrideEndByPair.get(`${shift.user_id}|${shift.site_id}`);
        const effectiveExpectedEnd = overrideEnd ?? site.expected_end;
        const siteTz = site.timezone || 'UTC';

        // Auto-close deadline:
        //   1. Next scheduled shift start across any site - 5 min, if it exists within 48h
        //   2. else: 23:59:59 site-tz of started_at's day, OR today's 23:59:59
        //      if started_at was earlier (whichever is later).
        const nextStart = findNextShiftStart(now, assignments, shift.user_id);
        const startedAt = new Date(shift.started_at);
        const eodStartDay = endOfDayInTz(startedAt, siteTz);
        const eodToday = endOfDayInTz(now, siteTz);
        const fallbackDeadline = new Date(Math.max(eodStartDay.getTime(), eodToday.getTime()));
        const deadline = nextStart
          ? new Date(nextStart.getTime() - 5 * 60_000)
          : fallbackDeadline;

        // Only close if `now` has reached/passed the deadline.
        if (now.getTime() < deadline.getTime()) continue;

        // Compute expected_end as a real UTC instant (overnight-aware), to
        // split worked time into regular vs overtime.
        const expectedEndInstant = (() => {
          const candidate = buildInTz(startedAt, effectiveExpectedEnd, siteTz);
          if (candidate.getTime() <= startedAt.getTime()) {
            return new Date(candidate.getTime() + 86_400_000);
          }
          return candidate;
        })();

        // If shift is on an OPEN pause, close it first.
        let totalPausedMinutes = shift.total_paused_minutes || 0;
        const pauseHistory: Array<Record<string, unknown>> = Array.isArray(shift.pause_history)
          ? [...(shift.pause_history as Record<string, unknown>[])]
          : [];
        if (shift.is_paused && shift.paused_at) {
          const pauseStartTime = new Date(shift.paused_at);
          const pauseDuration = Math.max(0, Math.floor((deadline.getTime() - pauseStartTime.getTime()) / 60000));
          totalPausedMinutes += pauseDuration;
          const lastIdx = pauseHistory.length - 1;
          const lastEntry = lastIdx >= 0 ? pauseHistory[lastIdx] : null;
          if (lastEntry && !lastEntry.resumed_at) {
            pauseHistory[lastIdx] = {
              ...lastEntry,
              resumed_at: deadline.toISOString(),
              duration_minutes: pauseDuration,
            };
          } else {
            pauseHistory.push({
              paused_at: shift.paused_at,
              resumed_at: deadline.toISOString(),
              reason: 'auto',
              duration_minutes: pauseDuration,
            });
          }
        }

        const totalMinutes = Math.max(0, Math.floor((deadline.getTime() - startedAt.getTime()) / 60000));
        const minutesWorkedGross = Math.max(0, totalMinutes - totalPausedMinutes);

        // Overtime = work done after expected_end (paused time already excluded
        // from minutesWorkedGross). Tiny < 5 min = ignored.
        const rawOvertimeMinutes = Math.max(0, Math.floor((deadline.getTime() - expectedEndInstant.getTime()) / 60000));
        let overtimeMinutes = 0;
        let overtimeStatus: 'none' | 'pending' = 'none';
        if (rawOvertimeMinutes >= 5) {
          overtimeMinutes = Math.min(rawOvertimeMinutes, minutesWorkedGross);
          if (overtimeMinutes >= 5) {
            overtimeStatus = 'pending';
          } else {
            overtimeMinutes = 0;
          }
        }
        const regularMinutesWorked = Math.max(0, minutesWorkedGross - overtimeMinutes);

        const { error: updateError } = await supabaseAdmin
          .from('shifts')
          .update({
            ended_at: deadline.toISOString(),
            auto_ended: true,
            is_paused: false,
            paused_at: null,
            total_paused_minutes: totalPausedMinutes,
            pause_history: pauseHistory,
            minutes_worked: regularMinutesWorked,
            overtime_minutes: overtimeMinutes,
            overtime_status: overtimeStatus,
          })
          .eq('id', shift.id);

        if (updateError) {
          console.error(`Error updating shift ${shift.id}:`, updateError);
        } else {
          endedCount++;
        }
      } catch (err) {
        console.error(`Error processing shift ${shift.id}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ message: 'Auto-end completed', checked: activeShifts.length, ended: endedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
