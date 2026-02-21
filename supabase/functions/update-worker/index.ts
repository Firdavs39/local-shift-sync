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
  text.toLowerCase().split('').map(char => translitMap[char] ?? char).join('').replace(/[^a-z0-9]/g, '');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify caller is admin
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

    // Check caller is admin
    const { data: callerRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUser.id)
      .limit(1);

    if (!callerRoles || callerRoles[0]?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Доступ запрещён' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403,
      });
    }

    const { userId, fullName, pin, role } = await req.json();

    if (!userId) throw new Error('userId обязателен');
    if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) {
      throw new Error('PIN должен быть 4 цифры');
    }

    // Get caller's company to ensure they can only edit their own workers
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('company_id')
      .eq('id', callerUser.id)
      .single();

    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, company_id, email')
      .eq('id', userId)
      .single();

    if (!targetProfile) throw new Error('Сотрудник не найден');
    if (targetProfile.company_id !== callerProfile?.company_id) {
      throw new Error('Нет доступа к этому сотруднику');
    }

    // Get company slug for email domain
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('slug')
      .eq('id', targetProfile.company_id)
      .single();

    if (!company) throw new Error('Компания не найдена');

    const newFullName = fullName?.trim() || targetProfile.full_name;
    const newPin = pin || null;

    // Build new auth credentials if name or pin changed
    const nameChanged = newFullName !== targetProfile.full_name;
    const pinChanged = !!newPin;

    if (nameChanged || pinChanged) {
      // Derive new email and password
      const transliteratedName = transliterate(newFullName).replace(/\s+/g, '');
      const newEmail = `${transliteratedName}@${company.slug}.geotime.local`;
      const resolvedPin = newPin || (targetProfile as any).pin; // fallback to existing pin

      // Get actual pin from profiles if not changing
      let actualPin = newPin;
      if (!actualPin) {
        const { data: profileFull } = await supabaseAdmin
          .from('profiles')
          .select('pin')
          .eq('id', userId)
          .single();
        actualPin = profileFull?.pin;
      }

      const newPassword = `${newFullName.replace(/\s+/g, '')}${actualPin}`;

      const authUpdate: Record<string, string> = { password: newPassword };
      if (nameChanged) authUpdate.email = newEmail;

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpdate);
      if (authError) throw authError;

      // Update profile
      const profileUpdate: Record<string, string> = { full_name: newFullName };
      if (nameChanged) profileUpdate.email = newEmail;
      if (pinChanged) profileUpdate.pin = newPin;

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId);
      if (profileError) throw profileError;
    }

    // Update role if provided
    if (role) {
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .update({ role })
        .eq('user_id', userId);
      if (roleError) throw roleError;
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    );
  }
});
