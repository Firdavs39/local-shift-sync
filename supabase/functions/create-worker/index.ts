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

    const { fullName, pin, role } = await req.json();

    console.log('Creating user:', { fullName, pin, role });

    // Validate input
    if (!fullName || !pin || !role) {
      throw new Error('Missing required fields: fullName, pin, role');
    }

    if (pin.length !== 3 || !/^\d{3}$/.test(pin)) {
      throw new Error('PIN must be exactly 3 digits');
    }

    if (role !== 'admin' && role !== 'worker') {
      throw new Error('Role must be either admin or worker');
    }

    // Check if user with same name already exists
    const { data: existingProfiles, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('full_name', fullName)
      .limit(1);

    if (checkError) {
      console.error('Error checking existing user:', checkError);
      throw checkError;
    }

    if (existingProfiles && existingProfiles.length > 0) {
      throw new Error('Пользователь с таким именем уже существует');
    }

    // Transliteration map for Cyrillic to Latin
    const translitMap: Record<string, string> = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
      'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
      'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
      'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    };

    const transliterate = (text: string): string => {
      return text.toLowerCase().split('').map(char => translitMap[char] || char).join('');
    };

    // Create email and password for worker
    // Email: transliterated name without spaces + @geotime.local (e.g., "artur@geotime.local")
    // Password: name without spaces + PIN (e.g., "Artur333")
    const transliteratedName = transliterate(fullName).replace(/\s+/g, '');
    const email = `${transliteratedName}@geotime.local`;
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
      },
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      throw authError;
    }

    console.log('User created successfully:', authData.user.id);

    // Update profile with email
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ email })
      .eq('id', authData.user.id);

    if (profileUpdateError) {
      console.error('Error updating profile with email:', profileUpdateError);
      throw profileUpdateError;
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        userId: authData.user.id,
        fullName,
        pin
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in create-worker function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
