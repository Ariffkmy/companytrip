import { useEffect, useState } from 'react';
import { supabase, supabaseConfigured, AUTH_STORAGE_KEY, arrivedViaInvite } from './supabase';

/* The app is read offline on train platforms. An access token lasts an
   hour; if it expires with no signal, supabase-js cannot refresh it and
   reports no session — but it keeps the stored one for a later retry
   (it only clears storage on a real sign-out or a rejected refresh).
   So a stored session still counts as signed in until it can be checked. */
function storedSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s?.user ? s : null;
  } catch (e) {
    return null;
  }
}

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  /* 'invite' or 'recovery' after landing from an invite or password-reset
     email, until the user has set a password. */
  const [setup, setSetup] = useState(arrivedViaInvite ? 'invite' : null);

  useEffect(() => {
    if (!supabase) return undefined;

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setSetup('recovery');
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setSetup(null);
      } else {
        setSession(next ?? storedSession());
      }
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  /* Admin is decided server-side (public.is_admin). Asked in its own
     effect: calling Supabase inside onAuthStateChange can deadlock the
     auth lock. The flag only shows or hides UI — every admin write is
     still checked by RLS. */
  const userId = session?.user?.id;
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!supabase || !userId) { setIsAdmin(false); return undefined; }
    let live = true;
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (live && !error) setIsAdmin(data === true);
    });
    return () => { live = false; };
  }, [userId]);

  return {
    configured: supabaseConfigured,
    loading,
    session,
    user: session?.user ?? null,
    isAdmin,
    setup,
    endSetup: () => setSetup(null),
    signOut: () => supabase?.auth.signOut(),
  };
}
