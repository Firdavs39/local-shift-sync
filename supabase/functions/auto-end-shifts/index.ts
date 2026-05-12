import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Auto-end-shifts: Starting check for shifts to end');

    // Get all active non-overtime shifts
    const { data: activeShifts, error: shiftsError } = await supabaseAdmin
      .from('shifts')
      .select(`
        id,
        user_id,
        site_id,
        started_at,
        is_paused,
        paused_at,
        pause_history,
        total_paused_minutes,
        sites!inner(
          expected_end,
          timezone
        )
      `)
      .is('ended_at', null)
      .eq('is_overtime', false);

    if (shiftsError) {
      console.error('Error fetching active shifts:', shiftsError);
      throw shiftsError;
    }

    if (!activeShifts || activeShifts.length === 0) {
      console.log('No active shifts to process');
      return new Response(
        JSON.stringify({ message: 'No active shifts to end', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Found ${activeShifts.length} active shifts to check`);

    // Load per-(user, site) schedule overrides so we end each shift at THIS
    // worker's expected_end, not just the site default. NULL override → fall
    // back to site default.
    const userIds = Array.from(new Set(activeShifts.map((s) => s.user_id)));
    const siteIds = Array.from(new Set(activeShifts.map((s) => s.site_id)));
    const { data: assignments } = await supabaseAdmin
      .from('worker_site_assignments')
      .select('user_id, site_id, expected_end')
      .in('user_id', userIds)
      .in('site_id', siteIds);
    const overrideEndByPair = new Map<string, string | null>();
    for (const a of (assignments || []) as Array<{ user_id: string; site_id: string; expected_end: string | null }>) {
      overrideEndByPair.set(`${a.user_id}|${a.site_id}`, a.expected_end);
    }

    let endedCount = 0;
    const now = new Date();

    for (const shift of activeShifts) {
      try {
        const site = (shift as any).sites;
        if (!site || !site.expected_end) {
          console.warn(`Shift ${shift.id} has no site or expected_end time`);
          continue;
        }

        // Effective expected_end = per-user override if set, else site default.
        const overrideEnd = overrideEndByPair.get(`${shift.user_id}|${shift.site_id}`);
        const effectiveExpectedEnd: string = overrideEnd ?? site.expected_end;

        // Parse expected_end time (format: "HH:MM:SS" or "HH:MM")
        const [endHours, endMinutes] = effectiveExpectedEnd.split(':').map(Number);

        // Convert expected_end from site's local timezone to UTC, anchored to
        // the shift's started_at date — NOT to "now". This is critical for
        // overnight shifts: a shift starting at 22:00 with expected_end='02:00'
        // ends at 02:00 the NEXT day, not 02:00 today.
        const siteTimezone = site.timezone || 'UTC';
        const startedAt = new Date(shift.started_at);
        const startAsLocal = new Date(startedAt.toLocaleString('en-US', { timeZone: siteTimezone }));
        const tzOffsetMs = startedAt.getTime() - startAsLocal.getTime();
        const expectedEndLocal = new Date(startAsLocal);
        expectedEndLocal.setHours(endHours, endMinutes, 0, 0);
        let expectedEndTime = new Date(expectedEndLocal.getTime() + tzOffsetMs);
        if (expectedEndTime.getTime() <= startedAt.getTime()) {
          // expected_end falls earlier on the clock than started_at within the
          // site's timezone → must be the next calendar day.
          expectedEndTime = new Date(expectedEndTime.getTime() + 24 * 60 * 60 * 1000);
        }

        // Check if current time is past expected_end
        if (now >= expectedEndTime) {
          console.log(`Ending shift ${shift.id} at expected_end: ${expectedEndTime.toISOString()}`);

          // Calculate total paused minutes
          let totalPausedMinutes = shift.total_paused_minutes || 0;
          // Clone so we can safely mutate the last entry.
          const pauseHistory: Array<Record<string, unknown>> = Array.isArray(shift.pause_history)
            ? [...shift.pause_history]
            : [];

          // If shift is currently paused, close the open pause entry in-place
          // using the canonical format {paused_at, resumed_at, reason,
          // duration_minutes}. Earlier this function appended a NEW entry
          // using a different schema ({started_at, ended_at, ...}), which
          // both duplicated data and broke "count of auto-pauses" stats.
          if (shift.is_paused && shift.paused_at) {
            const pauseStartTime = new Date(shift.paused_at);
            const pauseDuration = Math.floor((expectedEndTime.getTime() - pauseStartTime.getTime()) / 60000);
            totalPausedMinutes += pauseDuration;

            const lastIdx = pauseHistory.length - 1;
            const lastEntry = lastIdx >= 0 ? pauseHistory[lastIdx] : null;
            if (lastEntry && !lastEntry.resumed_at) {
              pauseHistory[lastIdx] = {
                ...lastEntry,
                resumed_at: expectedEndTime.toISOString(),
                duration_minutes: pauseDuration,
              };
            } else {
              // No open entry to close → append a synthetic one (canonical fields).
              pauseHistory.push({
                paused_at: shift.paused_at,
                resumed_at: expectedEndTime.toISOString(),
                reason: 'auto',
                duration_minutes: pauseDuration,
              });
            }
          }

          // Calculate minutes worked (from start to expected_end minus pauses)
          const startTime = new Date(shift.started_at);
          const totalMinutes = Math.floor((expectedEndTime.getTime() - startTime.getTime()) / 60000);
          const minutesWorked = Math.max(0, totalMinutes - totalPausedMinutes);

          // Update shift: set ended_at to expected_end time
          const { error: updateError } = await supabaseAdmin
            .from('shifts')
            .update({
              ended_at: expectedEndTime.toISOString(),
              auto_ended: true,
              is_paused: false,
              paused_at: null,
              total_paused_minutes: totalPausedMinutes,
              pause_history: pauseHistory,
              minutes_worked: minutesWorked,
            })
            .eq('id', shift.id);

          if (updateError) {
            console.error(`Error updating shift ${shift.id}:`, updateError);
          } else {
            console.log(`Successfully ended shift ${shift.id}. Worked: ${minutesWorked} min, Paused: ${totalPausedMinutes} min`);
            endedCount++;
          }
        }
      } catch (error) {
        console.error(`Error processing shift ${shift.id}:`, error);
      }
    }

    console.log(`Auto-end-shifts completed: ${endedCount} shifts ended`);

    return new Response(
      JSON.stringify({ 
        message: 'Auto-end process completed',
        checked: activeShifts.length,
        ended: endedCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in auto-end-shifts function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
