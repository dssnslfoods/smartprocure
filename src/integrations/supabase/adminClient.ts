import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Admin client uses service role key — bypasses RLS, never creates user sessions.
// Only import this in admin-protected pages.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
