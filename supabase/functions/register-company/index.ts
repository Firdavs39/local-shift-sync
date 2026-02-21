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

const slugify = (text: string): string =>
  transliterate(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { companyName, adminName, adminPin } = await req.json();

    // Validate
    if (!companyName?.trim() || !adminName?.trim() || !adminPin?.trim()) {
      return new Response(JSON.stringify({ error: 'Заполните все поля' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }

    if (!/^\d{4}$/.test(adminPin)) {
      return new Response(JSON.stringify({ error: 'PIN должен быть 4 цифры' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }

    // Generate slug from company name
    let slug = slugify(companyName.trim());
    if (!slug) slug = 'company';

    // Ensure slug uniqueness
    const { data: existing } = await supabaseAdmin
      .from('companies')
      .select('slug')
      .like('slug', `${slug}%`);

    if (existing && existing.length > 0) {
      const suffix = existing.length;
      slug = `${slug}-${suffix}`;
    }

    // 1. Create company
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name: companyName.trim(),
        slug,
        plan: 'trial',
        max_workers: 10,
        active: true,
      })
      .select('id, slug')
      .single();

    if (companyError || !company) {
      throw companyError ?? new Error('Не удалось создать компанию');
    }

    // 2. Create auth user for admin
    const transliteratedName = transliterate(adminName.trim()).replace(/\s+/g, '');
    const email = `${transliteratedName}@${slug}.geotime.local`;
    const password = `${adminName.trim().replace(/\s+/g, '')}${adminPin}`;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: adminName.trim(),
        pin: adminPin,
        role: 'admin',
        company_id: company.id,
      },
    });

    if (authError) {
      // Rollback company
      await supabaseAdmin.from('companies').delete().eq('id', company.id);
      throw authError;
    }

    // 3. Update company with owner_user_id
    await supabaseAdmin
      .from('companies')
      .update({ owner_user_id: authData.user.id })
      .eq('id', company.id);

    // 4. Update profile with company_id and email (trigger may have already created profile)
    await supabaseAdmin
      .from('profiles')
      .update({ company_id: company.id, email })
      .eq('id', authData.user.id);

    // 5. Update user_roles with company_id
    await supabaseAdmin
      .from('user_roles')
      .update({ company_id: company.id })
      .eq('user_id', authData.user.id);

    // 6. Create default settings for company
    await supabaseAdmin
      .from('settings')
      .upsert({
        id: company.id, // use company id as settings id
        company_id: company.id,
        max_users: 10,
        purge_policy_days: 365,
      });

    return new Response(
      JSON.stringify({
        success: true,
        companySlug: slug,
        companyId: company.id,
        adminName: adminName.trim(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка регистрации';
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    );
  }
});
