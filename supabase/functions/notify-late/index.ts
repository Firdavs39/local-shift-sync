import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Format an ISO timestamp as "HH:mm" in the given IANA timezone (e.g. the
// site's local zone). Falls back to UTC if no zone is provided.
const formatTimestamp = (iso: string, timezone: string): string => {
  const d = new Date(iso);
  return d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone || 'UTC',
  });
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const body = await req.json();

    // Called from Database Webhook: body.record contains the new shift row
    // Called from frontend: body contains shift data directly
    const record = body.record ?? body;
    const { company_id, user_id, site_id, minutes_late, started_at, status } = record;

    // Only notify for late shifts
    if (status !== 'late' || !minutes_late || minutes_late <= 0) {
      return new Response(JSON.stringify({ skipped: true }), { headers: corsHeaders });
    }

    if (!company_id) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no company_id' }), { headers: corsHeaders });
    }

    // Get Telegram config
    const { data: telegramConfig } = await supabaseAdmin
      .from('telegram_config')
      .select('bot_token, chat_id, notify_late')
      .eq('company_id', company_id)
      .single();

    if (!telegramConfig || !telegramConfig.notify_late) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no telegram config' }), { headers: corsHeaders });
    }

    // Get worker name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', user_id)
      .single();

    // Get site name and timezone — we want to format the "arrival time" in
    // the LOCAL zone of the object, not the server's. A Tashkent worker
    // arriving at 09:42 local should see 09:42 in the message, not 06:42 UTC
    // nor 09:42 Europe/Moscow (which used to be hardcoded).
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('name, timezone')
      .eq('id', site_id)
      .single();

    const workerName = profile?.full_name ?? 'Сотрудник';
    const siteName = site?.name ?? 'Объект';
    const siteTimezone = site?.timezone ?? 'UTC';
    const time = started_at ? formatTimestamp(started_at, siteTimezone) : '';

    const message = [
      `⚠️ *Опоздание на работу*`,
      ``,
      `👤 *${workerName}*`,
      `📍 Объект: ${siteName}`,
      `⏰ Время прихода: ${time} (${siteTimezone})`,
      `🕐 Опоздание: *${minutes_late} мин*`,
    ].join('\n');

    const sendTelegram = async () => {
      const res = await fetch(
        `https://api.telegram.org/bot${telegramConfig.bot_token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramConfig.chat_id,
            text: message,
            parse_mode: 'Markdown',
          }),
        },
      );
      return res.json();
    };

    let tgResult: any = null;
    let lastError = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      tgResult = await sendTelegram();
      if (tgResult.ok) break;
      lastError = tgResult.description ?? 'Unknown Telegram error';
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000));
    }

    if (!tgResult?.ok) {
      return new Response(
        JSON.stringify({ error: `Telegram error after 3 attempts: ${lastError}` }),
        { headers: corsHeaders, status: 500 },
      );
    }

    return new Response(JSON.stringify({ sent: true }), { headers: corsHeaders });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      headers: corsHeaders, status: 500,
    });
  }
});
