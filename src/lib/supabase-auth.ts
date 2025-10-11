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

// Register new worker with email and password
export async function registerWorker(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        pin: '',
        role: 'worker',
      },
      emailRedirectTo: `${window.location.origin}/`,
    },
  });

  if (error) throw error;
  return data;
}

// Login with email and password (for workers)
export async function loginWithEmail(email: string, password: string): Promise<UserWithRole | null> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return null;
    }

    // Get profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile || !profile.active) {
      await supabase.auth.signOut();
      return null;
    }

    // Get role
    const { data: roles, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', data.user.id)
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

// Login with PIN (for admin only)
export async function loginWithPin(pin: string): Promise<UserWithRole | null> {
  try {
    if (pin !== '777') {
      return null;
    }

    // Admin login with hardcoded credentials
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'admin777@geotime.local',
      password: '777777777',
    });

    if (error || !data.user) {
      return null;
    }

    // Get profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      return null;
    }

    // Get role
    const { data: roles, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', data.user.id)
      .limit(1);

    if (roleError || !roles || roles.length === 0 || roles[0].role !== 'admin') {
      await supabase.auth.signOut();
      return null;
    }

    return {
      id: profile.id,
      full_name: profile.full_name,
      pin: profile.pin,
      active: profile.active,
      role: 'admin',
    };
  } catch (error) {
    console.error('Admin login error:', error);
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
