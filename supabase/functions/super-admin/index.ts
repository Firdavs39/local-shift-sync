import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLAN_LIMITS: Record<string, number> = {
  trial:       10,
  start:       10,
  business:    50,
  corporate:  200,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const body = await req.json();
    const { password, action, payload } = body;

    // ── Auth ──────────────────────────────────────────────────────────────────
    const superPassword = Deno.env.get('SUPER_ADMIN_PASSWORD');
    if (!superPassword || password !== superPassword) {
      return json({ error: 'Неверный пароль' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── Actions ───────────────────────────────────────────────────────────────

    // GET all companies with stats
    if (action === 'list') {
      const { data: companies, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Add worker + site counts per company
      const enriched = await Promise.all((companies ?? []).map(async (c) => {
        const [{ count: workers }, { count: sites }] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', c.id),
          supabase.from('sites').select('id', { count: 'exact', head: true }).eq('company_id', c.id),
        ]);
        return { ...c, workers_count: workers ?? 0, sites_count: sites ?? 0 };
      }));

      return json({ companies: enriched });
    }

    // UPDATE company plan / expiry / active
    if (action === 'update') {
      const { company_id, plan, days, active } = payload ?? {};
      if (!company_id) return json({ error: 'company_id required' }, 400);

      const updates: Record<string, unknown> = {};

      if (plan !== undefined) {
        updates.plan = plan;
        updates.max_workers = PLAN_LIMITS[plan] ?? 10;
      }

      if (days !== undefined && days > 0) {
        const expires = new Date();
        expires.setDate(expires.getDate() + Number(days));
        updates.plan_expires_at = expires.toISOString();
      }

      if (active !== undefined) {
        updates.active = active;
      }

      const { error } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', company_id);

      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: 'Неизвестный action' }, 400);

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка сервера';
    return json({ error: message }, 500);
  }
});
