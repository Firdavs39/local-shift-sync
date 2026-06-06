import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { authStorage } from '@/lib/native-storage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// `authStorage` is localStorage on web and @capacitor/preferences on native.
// Native variant survives iOS's 7-day localStorage purge.
// MUST be hydrated before this client is touched on native — see main.tsx.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});