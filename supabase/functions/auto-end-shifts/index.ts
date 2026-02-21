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

    let endedCount = 0;
    const now = new Date();

    for (const shift of activeShifts) {
      try {
        const site = (shift as any).sites;
        if (!site || !site.expected_end) {
          console.warn(`Shift ${shift.id} has no site or expected_end time`);
          continue;
        }

        // Parse expected_end time (format: "HH:MM:SS" or "HH:MM")
        const [endHours, endMinutes] = site.expected_end.split(':').map(Number);

        // Convert expected_end from site's local timezone to UTC.
        // Strategy: get "now" as a local string in the site timezone,
        // build a local Date with the expected_end hours, then compute
        // the UTC equivalent via the timezone offset trick.
        const siteTimezone = site.timezone || 'UTC';
        // Represent "now" as if it were local time (but parsed as UTC)
        const nowAsLocal = new Date(now.toLocaleString('en-US', { timeZone: siteTimezone }));
        // The offset between real UTC and the site-local "fake UTC"
        const tzOffsetMs = now.getTime() - nowAsLocal.getTime();
        // Build the expected end at today's date in site-local coordinates
        const expectedEndLocal = new Date(nowAsLocal);
        expectedEndLocal.setHours(endHours, endMinutes, 0, 0);
        // Convert back to real UTC
        const expectedEndTime = new Date(expectedEndLocal.getTime() + tzOffsetMs);

        // Check if current time is past expected_end
        if (now >= expectedEndTime) {
          console.log(`Ending shift ${shift.id} at expected_end: ${expectedEndTime.toISOString()}`);

          // Calculate total paused minutes
          let totalPausedMinutes = shift.total_paused_minutes || 0;
          let pauseHistory = shift.pause_history || [];

          // If shift is currently paused, close the pause
          if (shift.is_paused && shift.paused_at) {
            const pauseStartTime = new Date(shift.paused_at);
            const pauseDuration = Math.floor((expectedEndTime.getTime() - pauseStartTime.getTime()) / 60000);
            totalPausedMinutes += pauseDuration;

            pauseHistory = [
              ...pauseHistory,
              {
                started_at: shift.paused_at,
                ended_at: expectedEndTime.toISOString(),
                duration_minutes: pauseDuration,
              },
            ];
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
