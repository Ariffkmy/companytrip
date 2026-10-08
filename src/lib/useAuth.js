import { useCallback, useEffect, useState } from 'react';
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

const EMPTY_MEMBER = { isAdmin: false, team: null, fullName: null, role: null };

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

  /* Who this member is on the trip: admin flag (public.is_admin) and
     their assigned team (profiles, kept in step with the allowlist).
     Fetched in its own effect — calling Supabase inside
     onAuthStateChange can deadlock the auth lock. Cached per user, since
     the treasure hunt runs in Atami where signal is patchy. The admin
     flag only shows or hides UI; every admin write is checked by RLS. */
  const userId = session?.user?.id;
  const [member, setMember] = useState(EMPTY_MEMBER);
  const [memberTick, setMemberTick] = useState(0);
  useEffect(() => {
    if (!supabase || !userId) { setMember(EMPTY_MEMBER); return undefined; }
    const cacheKey = `olc-member:${userId}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached) setMember({ ...EMPTY_MEMBER, ...cached });
    } catch (e) { /* ignore a corrupt cache */ }

    let live = true;
    Promise.all([
      supabase.rpc('is_admin'),
      supabase.from('profiles').select('full_name, team, role').eq('id', userId).maybeSingle(),
    ]).then(([admin, profile]) => {
      if (!live || admin.error || profile.error) return;
      const next = {
        isAdmin: admin.data === true,
        team: profile.data?.team ?? null,
        fullName: profile.data?.full_name ?? null,
        role: profile.data?.role ?? null,
      };
      setMember(next);
      try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch (e) { /* silent */ }
    });
    return () => { live = false; };
  }, [userId, memberTick]);

  const refreshMember = useCallback(() => setMemberTick((n) => n + 1), []);

  return {
    configured: supabaseConfigured,
    loading,
    session,
    user: session?.user ?? null,
    member,
    isAdmin: member.isAdmin,
    refreshMember,
    setup,
    endSetup: () => setSetup(null),
    signOut: () => supabase?.auth.signOut(),
  };
}
