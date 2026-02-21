import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLAN_CONFIG: Record<string, { priceEnvKey: string; maxWorkers: number; name: string }> = {
  starter:    { priceEnvKey: 'STRIPE_PRICE_STARTER',    maxWorkers: 10,  name: 'Старт' },
  business:   { priceEnvKey: 'STRIPE_PRICE_BUSINESS',   maxWorkers: 50,  name: 'Бизнес' },
  enterprise: { priceEnvKey: 'STRIPE_PRICE_ENTERPRISE', maxWorkers: 200, name: 'Корпоративный' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('Stripe не настроен. Обратитесь к администратору.');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { planId } = await req.json();
    const planConfig = PLAN_CONFIG[planId];
    if (!planConfig) throw new Error('Неверный тариф');

    const priceId = Deno.env.get(planConfig.priceEnvKey);
    if (!priceId) throw new Error(`Цена для тарифа ${planConfig.name} не настроена`);

    // Get company
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();
    if (!profile?.company_id) throw new Error('Компания не найдена');

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('id, name, stripe_customer_id')
      .eq('id', profile.company_id)
      .single();
    if (!company) throw new Error('Компания не найдена');

    // Create or get Stripe customer
    let customerId = company.stripe_customer_id;
    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ name: company.name, metadata: { company_id: company.id } }),
      });
      const customer = await customerRes.json();
      if (!customerRes.ok) throw new Error(customer.error?.message ?? 'Ошибка создания клиента Stripe');

      customerId = customer.id;
      await supabaseAdmin.from('companies').update({ stripe_customer_id: customerId }).eq('id', company.id);
    }

    // Create Checkout Session
    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:8080';
    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: customerId,
        mode: 'subscription',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        success_url: `${appUrl}/admin/billing?success=true`,
        cancel_url: `${appUrl}/admin/billing?canceled=true`,
        'metadata[company_id]': company.id,
        'metadata[plan_id]': planId,
      }),
    });
    const session = await sessionRes.json();
    if (!sessionRes.ok) throw new Error(session.error?.message ?? 'Ошибка создания платежа');

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});
