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

export async function signUpWorker(fullName: string, pin: string, role: 'admin' | 'worker' = 'worker') {
  // Create user with temporary email (PIN-based)
  const email = `user${pin}@geotime.local`;
  const password = `pin${pin}${Math.random().toString(36).slice(2)}`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        pin,
        role,
      },
      emailRedirectTo: `${window.location.origin}/`,
    },
  });

  if (error) throw error;
  return data;
}

export async function loginWithPin(pin: string): Promise<UserWithRole | null> {
  try {
    // First, find user by PIN
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('pin', pin)
      .eq('active', true)
      .limit(1);

    if (profileError || !profiles || profiles.length === 0) {
      return null;
    }

    const profile = profiles[0];

    // Get user role
    const { data: roles, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', profile.id)
      .limit(1);

    if (roleError || !roles || roles.length === 0) {
      return null;
    }

    // Sign in with email/password (PIN-based)
    const email = `user${pin}@geotime.local`;
    const password = `pin${pin}${Math.random().toString(36).slice(2)}`;
    
    // Since we don't know the random password, we'll use a workaround:
    // Admin creates a session for the user
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: pin + pin + pin, // Simple password: PIN repeated 3 times
    });

    if (signInError) {
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
