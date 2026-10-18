/* ═══════════════════════════════════════════════════
   Buy it, try it — the bosses' rating of each pitch
   ═══════════════════════════════════════════════════

   The boss who heard a group's pitch rates it 1–10 in the Boss inbox
   (20261027000000_pitch_ratings.sql); the group's phone hears it live
   and collects the stamp with it. One row per group, so rating again
   replaces the last one.

   Like the boss chat, the list is re-read whenever the channel
   (re)connects, the app comes back to the front, or the phone is back
   online: Realtime doesn't replay what a sleeping phone missed. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { chatErrorMessage } from './bossChat';

const notReady = (err) => /pitch_ratings|does not exist|schema cache/i.test(err?.message ?? '');

/**
 * Ratings by team: `{ 'group-a': row, … }`. With `team`, only that
 * group's. `ready` is false until the SQL has been run (or while it
 * can't be reached), so callers can fall back to rating on the phone.
 */
export function usePitchRatings({ team = null, enabled = true } = {}) {
  const [ratings, setRatings] = useState({});
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase || !enabled) return;
    let q = supabase.from('pitch_ratings').select('*');
    if (team) q = q.eq('team', team);
    const { data, error } = await q;
    setLoaded(true);
    if (error) { if (notReady(error)) setReady(false); return; }
    setReady(true);
    setRatings(Object.fromEntries((data ?? []).map((r) => [r.team, r])));
  }, [team, enabled]);

  useEffect(() => {
    if (!supabase || !enabled) return undefined;
    reload();
    const channel = supabase
      .channel(`pitch-ratings:${team ?? 'all'}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'pitch_ratings',
        ...(team ? { filter: `team=eq.${team}` } : {}),
      }, (payload) => {
        if (payload.eventType === 'DELETE') { reload(); return; }
        const row = payload.new;
        if (row?.team) setRatings((m) => ({ ...m, [row.team]: row }));
      })
      .subscribe((s) => { if (s === 'SUBSCRIBED') reload(); });
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', reload);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', reload);
      supabase.removeChannel(channel);
    };
  }, [team, enabled, reload]);

  /* Bosses and admins only (RLS). Throws a readable Error. */
  const rate = useCallback(async (forTeam, rating) => {
    const { data, error } = await supabase.from('pitch_ratings')
      .upsert({ team: forTeam, rating }).select().single();
    if (error) {
      throw new Error(notReady(error) ? 'Run 20261027000000_pitch_ratings.sql in Supabase first.' : chatErrorMessage(error));
    }
    setRatings((m) => ({ ...m, [data.team]: data }));
    return data;
  }, []);

  return { ratings, ready, loaded, rate, reload };
}
