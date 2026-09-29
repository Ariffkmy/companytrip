import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/* Fixed, readable key so useAuth can fall back to the stored session
   when the token cannot be refreshed offline. */
export const AUTH_STORAGE_KEY = 'olc-auth';

export const supabaseConfigured = Boolean(url && key);

/* An invite link, or a magic link from the sign-up page, signs the
   person in with no password yet, so the app must ask for one. Read
   before createClient, which strips the token from the URL. A first
   magic link arrives as type=signup, a later one as type=magiclink. */
const linkType = typeof window !== 'undefined'
  ? window.location.hash.match(/(?:^|[#&?])type=([a-z_]+)(?:&|$)/)?.[1] ?? null
  : null;
export const arrivedViaInvite = linkType === 'invite';
export const arrivedViaMagicLink = linkType === 'magiclink' || linkType === 'signup';

/* Company addresses the sign-up page accepts. The database still only
   lets in addresses that are on the trip list. */
export const SIGNUP_DOMAINS = ['orangeleaf.consulting', 'orangeleaf.com.my'];

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
