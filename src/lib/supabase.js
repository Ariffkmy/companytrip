import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/* Fixed, readable key so useAuth can fall back to the stored session
   when the token cannot be refreshed offline. */
export const AUTH_STORAGE_KEY = 'olc-auth';

export const supabaseConfigured = Boolean(url && key);

/* Accounts are created by committee invite only. An invite link signs
   the person in with no password yet, so the app must ask for one. Read
   before createClient, which strips the token from the URL. */
export const arrivedViaInvite =
  typeof window !== 'undefined' && /(^|[#&?])type=invite(&|$)/.test(window.location.hash);

export const supabase = supabaseConfigured
  ? createClient(url, key, {
      auth: {
        storageKey: AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
