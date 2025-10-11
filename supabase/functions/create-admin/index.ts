import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Creating admin user with PIN 777');

    // Check if admin already exists
    const { data: existingAdmin, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .eq('pin', '777')
      .limit(1);

    if (checkError) {
      console.error('Error checking for existing admin:', checkError);
      throw checkError;
    }

    if (existingAdmin && existingAdmin.length > 0) {
      return new Response(
        JSON.stringify({ message: 'Admin already exists', admin: existingAdmin[0] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Create admin user
    const email = 'admin777@geotime.local';
    const password = '777777777'; // PIN repeated 3 times

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Администратор',
        pin: '777',
        role: 'admin',
      },
    });

    if (authError) {
      console.error('Error creating admin user:', authError);
      throw authError;
    }

    console.log('Admin user created successfully:', authData.user.id);

    return new Response(
      JSON.stringify({ 
        message: 'Admin created successfully', 
        userId: authData.user.id,
        pin: '777'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in create-admin function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
