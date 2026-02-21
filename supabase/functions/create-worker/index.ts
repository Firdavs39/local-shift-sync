import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const translitMap: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
  'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
  'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
  'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
};

const transliterate = (text: string): string =>
  text.toLowerCase().split('').map(char => translitMap[char] ?? char).join('');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get calling user's JWT to determine company
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401,
      });
    }

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401,
      });
    }

    // Get caller's company_id and company slug
    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('company_id')
      .eq('id', callerUser.id)
      .single();

    if (profileError || !callerProfile?.company_id) {
      return new Response(JSON.stringify({ error: 'Компания не найдена' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }

    const companyId = callerProfile.company_id;

    // Get company slug and worker limit
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('slug, max_workers')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: 'Компания не найдена. Повторите вход.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }

    const { fullName, pin, role } = await req.json();

    // Validate
    if (!fullName || !pin || !role) {
      throw new Error('Missing required fields: fullName, pin, role');
    }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      throw new Error('PIN must be exactly 4 digits');
    }
    if (role !== 'admin' && role !== 'worker') {
      throw new Error('Role must be either admin or worker');
    }

    // Enforce worker limit (if companies table exists)
    if (company) {
      const { count } = await supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('active', true);

      if (count !== null && count >= company.max_workers) {
        return new Response(
          JSON.stringify({ error: `Достигнут лимит сотрудников (${company.max_workers}). Обновите тариф.` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 },
        );
      }
    }

    // Check if user with same name already exists IN THIS COMPANY
    const { data: existingProfiles, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('full_name', fullName)
      .eq('company_id', companyId)
      .limit(1);

    if (checkError) throw checkError;
    if (existingProfiles && existingProfiles.length > 0) {
      throw new Error('Пользователь с таким именем уже существует');
    }

    // Build email: transliterate name, remove spaces and any non-alphanumeric chars
    // (handles Latin Uzbek names with apostrophes like O'rinboy, G'ayrat)
    const transliteratedName = transliterate(fullName).replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
    const emailDomain = `${company.slug}.geotime.local`;
    const email = `${transliteratedName}@${emailDomain}`;
    const password = `${fullName.replace(/\s+/g, '')}${pin}`;

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        pin,
        role,
        company_id: companyId ?? undefined,
      },
    });

    if (authError) throw authError;

    // Update profile with email and company_id (trigger may have already set company_id via metadata)
    const updates: Record<string, unknown> = { email };
    if (companyId) updates.company_id = companyId;

    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', authData.user.id);

    if (profileUpdateError) throw profileUpdateError;

    // Also update user_roles with company_id if needed
    if (companyId) {
      await supabaseAdmin
        .from('user_roles')
        .update({ company_id: companyId })
        .eq('user_id', authData.user.id);
    }

    return new Response(
      JSON.stringify({ success: true, userId: authData.user.id, fullName, pin }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    );
  }
});
