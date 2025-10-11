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

    // Check if PIN already exists
    const { data: existingProfiles, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('pin', pin)
      .limit(1);

    if (checkError) {
      console.error('Error checking existing PIN:', checkError);
      throw checkError;
    }

    if (existingProfiles && existingProfiles.length > 0) {
      throw new Error('PIN already exists');
    }

    // Create unique email and password for worker
    const timestamp = Date.now();
    const email = `worker${timestamp}@geotime.local`;
    const password = `${fullName.replace(/\s+/g, '')}${pin}`; // name + pin as password

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
