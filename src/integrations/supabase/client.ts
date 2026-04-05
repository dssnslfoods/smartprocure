import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// ---------------------------------------------------------------------------
// Environment variable validation
// Fails loudly at startup if required variables are missing, so issues are
// caught immediately rather than producing silent 401/fetch errors at runtime.
// ---------------------------------------------------------------------------
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error(
    '[Supabase] VITE_SUPABASE_URL is not set. ' +
    'Copy .env.example to .env and fill in your Supabase project URL.'
  );
}

if (!SUPABASE_ANON_KEY) {
  throw new Error(
    '[Supabase] VITE_SUPABASE_ANON_KEY is not set. ' +
    'Copy .env.example to .env and fill in your Supabase anon key.'
  );
}

// ---------------------------------------------------------------------------
// Supabase client — single source of truth for the entire application.
// Import with:  import { supabase } from "@/integrations/supabase/client";
// ---------------------------------------------------------------------------
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
