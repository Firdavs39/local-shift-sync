import { supabase } from '@/integrations/supabase/client';

export interface Profile {
  id: string;
  full_name: string;
  pin: string;
  active: boolean;
}

export interface UserWithRole {
  id: string;
  full_name: string;
  pin: string;
  active: boolean;
  role: 'admin' | 'worker';
}

// Login with username (login) and PIN
export async function loginWithCredentials(login: string, pin: string): Promise<UserWithRole | null> {
  try {
    console.log('=== LOGIN ATTEMPT ===');
    console.log('Input login:', login);
    console.log('Input PIN:', pin);
    
    // Normalize inputs
    const normalizedLogin = login.trim().toLowerCase();
    const normalizedPin = pin.trim();
    
    console.log('Normalized login:', normalizedLogin);
    console.log('Normalized PIN:', normalizedPin);
    
    // Find user by full_name (case-insensitive) and PIN
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('active', true);

    console.log('Found profiles:', profiles?.length);

    if (profileError) {
      console.error('Profile error:', profileError);
      return null;
    }
    
    if (!profiles) {
      console.error('No profiles found');
      return null;
    }

    // Find matching profile by full_name and PIN
    const profile = profiles.find(p => {
      const profileNameNormalized = p.full_name.trim().toLowerCase();
      const profilePinNormalized = p.pin.trim();
      
      console.log('Checking profile:', {
        name: p.full_name,
        normalizedName: profileNameNormalized,
        pin: p.pin,
        normalizedPin: profilePinNormalized,
        nameMatch: profileNameNormalized === normalizedLogin,
        pinMatch: profilePinNormalized === normalizedPin
      });
      
      return profileNameNormalized === normalizedLogin && profilePinNormalized === normalizedPin;
    });

    if (!profile) {
      console.error('No matching profile found');
      return null;
    }
    
    if (!profile.email) {
      console.error('Profile has no email');
      return null;
    }
    
    console.log('Found profile:', { id: profile.id, name: profile.full_name, email: profile.email });
    
    // Sign in with email from profile and password = fullName (no spaces) + PIN
    const password = `${profile.full_name.replace(/\s+/g, '')}${normalizedPin}`;
    console.log('Attempting auth with email:', profile.email);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password,
    });

    if (error) {
      console.error('Auth error:', error);
      return null;
    }
    
    if (!data.user) {
      console.error('No user in auth response');
      return null;
    }
    
    console.log('Auth successful, getting role...');

    // Get role
    const { data: roles, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', profile.id)
      .limit(1);

    if (roleError) {
      console.error('Role error:', roleError);
      await supabase.auth.signOut();
      return null;
    }
    
    if (!roles || roles.length === 0) {
      console.error('No roles found for user');
      await supabase.auth.signOut();
      return null;
    }
    
    console.log('Login successful, role:', roles[0].role);

    return {
      id: profile.id,
      full_name: profile.full_name,
      pin: profile.pin,
      active: profile.active,
      role: roles[0].role as 'admin' | 'worker',
    };
  } catch (error) {
    console.error('Login error:', error);
    return null;
  }
}

export async function logout() {
  await supabase.auth.signOut();
  // Clear all auth-related data from localStorage
  localStorage.clear();
}

export async function getCurrentUser(): Promise<UserWithRole | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) return null;

    // Get profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) return null;

    // Get role
    const { data: roles, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .limit(1);

    if (roleError || !roles || roles.length === 0) return null;

    return {
      id: profile.id,
      full_name: profile.full_name,
      pin: profile.pin,
      active: profile.active,
      role: roles[0].role as 'admin' | 'worker',
    };
  } catch (error) {
    return null;
  }
}

export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === 'admin';
}
