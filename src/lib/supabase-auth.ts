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
  company_id?: string;
}

// Transliteration map (same as Edge Functions)
const translitMap: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
  'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
  'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
  'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
};

const transliterate = (text: string): string =>
  text.toLowerCase().split('').map(char => translitMap[char] ?? char).join('');

// Login with company slug + worker name + PIN
export async function loginWithCredentials(
  companySlug: string,
  workerName: string,
  pin: string,
): Promise<UserWithRole | null> {
  try {
    const normalizedName = workerName.trim();
    const normalizedPin = pin.trim();
    const normalizedSlug = companySlug.trim().toLowerCase();

    // Derive email and password the same way the server does
    // Remove spaces and any non-alphanumeric chars (handles Latin Uzbek names: O'rinboy → orinboy)
    const transliteratedName = transliterate(normalizedName).replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
    const email = `${transliteratedName}@${normalizedSlug}.geotime.local`;
    const password = `${normalizedName.replace(/\s+/g, '')}${normalizedPin}`;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) return null;

    // Get profile (RLS will scope to this company automatically)
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
      company_id: profile.company_id ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function logout() {
  await supabase.auth.signOut();
  localStorage.clear();
}

export async function getCurrentUser(): Promise<UserWithRole | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) return null;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) return null;

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
      company_id: profile.company_id ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === 'admin';
}
