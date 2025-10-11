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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Updating admin password');

    const email = 'admin777@geotime.local';
    const fullName = 'Администратор';
    const pin = '777';
    const password = `${fullName.replace(/\s+/g, '')}${pin}`; // "Администратор777"

    // Find the admin user by email
    const { data: { users }, error: findError } = await supabase.auth.admin.listUsers();
    
    if (findError) {
      console.error('Error finding users:', findError);
      throw findError;
    }

    const adminUser = users.find(u => u.email === email);

    if (!adminUser) {
      return new Response(
        JSON.stringify({ error: 'Admin user not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Update the password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      adminUser.id,
      { password }
    );

    if (updateError) {
      console.error('Error updating password:', updateError);
      throw updateError;
    }

    console.log('Admin password updated successfully');

    return new Response(
      JSON.stringify({ 
        message: 'Admin password updated successfully',
        email,
        hint: 'Use "Администратор" as login and "777" as PIN'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in update-admin-password function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
