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
    // Find user by full_name (case-insensitive) and PIN
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('active', true);

    if (profileError || !profiles) {
      return null;
    }

    // Find matching profile by full_name and PIN
    const profile = profiles?.find(p => 
      p.full_name.toLowerCase() === login.toLowerCase() && p.pin === pin
    );

    if (!profile || !profile.email) {
      return null;
    }
    
    // Sign in with email from profile and password = fullName (no spaces) + PIN
    const password = `${profile.full_name.replace(/\s+/g, '')}${pin}`;
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password,
    });

    if (error || !data.user) {
      return null;
    }

    // Get role
    const { data: roles, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', profile.id)
      .limit(1);

    if (roleError || !roles || roles.length === 0) {
      await supabase.auth.signOut();
      return null;
    }

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
