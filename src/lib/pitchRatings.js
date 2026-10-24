/* ═══════════════════════════════════════════════════
   Atami Video Challenge — the bosses' rating of each video
   ═══════════════════════════════════════════════════

   The bosses rate each of a group's two videos 1–10 in the Boss inbox
   (20261027000000_pitch_ratings.sql, 20261031000000_video_challenge.sql):
   `pitch` for Buy it, try it and `geo` for Atami Geographic. The group's
   phone hears them live and collects the stamp once both are in. One
   row per group per video, so rating again replaces the last one.

   Like the boss chat, the list is re-read whenever the channel
   (re)connects, the app comes back to the front, or the phone is back
   online: Realtime doesn't replay what a sleeping phone missed. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { chatErrorMessage } from './bossChat';

const notReady = (err) => /pitch_ratings|challenge|does not exist|schema cache/i.test(err?.message ?? '');
const COLUMNS = 'team, challenge, rating, rater_name, updated_at';

/* The two videos of the Atami Video Challenge, in the order they are
   shown. */
export const CHALLENGES = ['pitch', 'geo'];
export const CHALLENGE_INFO = {
  pitch: { name: 'Buy it, try it', emoji: '🛍️', title: 'Pitch video', video: 'pitch video', film: 'record the pitch to Tim and Ellice' },
  geo: { name: 'Atami Geographic', emoji: '🐾', title: 'Documentary', video: 'documentary', film: 'film the documentary' },
};

const withRow = (m, row) => ({ ...m, [row.team]: { ...m[row.team], [row.challenge ?? 'pitch']: row } });

/**
 * Ratings by team and video: `{ 'group-a': { pitch: row, geo: row }, … }`.
 * With `team`, only that group's. `ready` is false until both SQL files
 * have been run (or while it can't be reached), so callers can fall
 * back to rating on the phone.
 */
export function usePitchRatings({ team = null, enabled = true } = {}) {
  const [ratings, setRatings] = useState({});
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase || !enabled) return;
    let q = supabase.from('pitch_ratings').select(COLUMNS);
    if (team) q = q.eq('team', team);
    const { data, error } = await q;
    setLoaded(true);
    if (error) { if (notReady(error)) setReady(false); return; }
    setReady(true);
    setRatings((data ?? []).reduce(withRow, {}));
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
        if (row?.team) setRatings((m) => withRow(m, row));
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
  const rate = useCallback(async (forTeam, challenge, rating) => {
    const { data, error } = await supabase.from('pitch_ratings')
      .upsert({ team: forTeam, challenge, rating }, { onConflict: 'team,challenge' }).select(COLUMNS).single();
    if (error) {
      throw new Error(notReady(error) ? 'Run 20261031000000_video_challenge.sql in Supabase first.' : chatErrorMessage(error));
    }
    setRatings((m) => withRow(m, data));
    return data;
  }, []);

  return { ratings, ready, loaded, rate, reload };
}
