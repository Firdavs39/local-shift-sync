import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const PLAN_BY_PRICE: Record<string, { plan: string; maxWorkers: number }> = {};

const buildPlanMap = () => {
  const starter = Deno.env.get('STRIPE_PRICE_STARTER');
  const business = Deno.env.get('STRIPE_PRICE_BUSINESS');
  const enterprise = Deno.env.get('STRIPE_PRICE_ENTERPRISE');
  if (starter) PLAN_BY_PRICE[starter] = { plan: 'starter', maxWorkers: 10 };
  if (business) PLAN_BY_PRICE[business] = { plan: 'business', maxWorkers: 50 };
  if (enterprise) PLAN_BY_PRICE[enterprise] = { plan: 'enterprise', maxWorkers: 200 };
};

serve(async (req) => {
  buildPlanMap();

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const body = await req.text();
  const signature = req.headers.get('Stripe-Signature') ?? '';

  // Verify webhook signature
  let event: any;
  try {
    // Simple HMAC verification
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const parts = signature.split(',');
    const ts = parts.find(p => p.startsWith('t='))?.split('=')[1] ?? '';
    const v1 = parts.find(p => p.startsWith('v1='))?.split('=')[1] ?? '';
    const payload = `${ts}.${body}`;
    const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const computed = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (computed !== v1) throw new Error('Invalid signature');
    event = JSON.parse(body);
  } catch {
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  const updateCompanyPlan = async (customerId: string, priceId: string, subscriptionId: string, expiresAt?: number) => {
    const planInfo = PLAN_BY_PRICE[priceId];
    if (!planInfo) return;

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .single();
    if (!company) return;

    await supabaseAdmin.from('companies').update({
      plan: planInfo.plan,
      max_workers: planInfo.maxWorkers,
      stripe_subscription_id: subscriptionId,
      plan_expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
    }).eq('id', company.id);
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription') break;
      // Fetch subscription to get price ID
      const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${session.subscription}`, {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      const sub = await subRes.json();
      const priceId = sub.items?.data?.[0]?.price?.id;
      if (priceId) {
        await updateCompanyPlan(session.customer, priceId, session.subscription, sub.current_period_end);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const priceId = sub.items?.data?.[0]?.price?.id;
      if (priceId) {
        await updateCompanyPlan(sub.customer, priceId, sub.id, sub.current_period_end);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const { data: company } = await supabaseAdmin
        .from('companies')
        .select('id')
        .eq('stripe_customer_id', sub.customer)
        .single();
      if (company) {
        await supabaseAdmin.from('companies').update({
          plan: 'trial',
          max_workers: 10,
          stripe_subscription_id: null,
          plan_expires_at: null,
        }).eq('id', company.id);
      }
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
