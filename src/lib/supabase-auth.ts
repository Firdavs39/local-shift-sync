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
    // Special case for admin
    if (login.toLowerCase() === 'admin' && pin === '777') {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'admin777@geotime.local',
        password: '777777777',
      });

      if (error || !data.user) {
        return null;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (!profile) {
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
    }

    // For workers: find by full_name (as login) and PIN
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .ilike('full_name', login)
      .eq('pin', pin)
      .eq('active', true)
      .limit(1);

    if (profileError || !profiles || profiles.length === 0) {
      return null;
    }

    const profile = profiles[0];

    // Use email from profile
    if (!profile.email) {
      return null;
    }
    
    // Sign in with email from profile and password = fullName (no spaces) + PIN
    const { data, error } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: `${profile.full_name.replace(/\s+/g, '')}${pin}`,
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
