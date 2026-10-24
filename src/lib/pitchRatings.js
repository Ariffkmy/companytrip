/* ═══════════════════════════════════════════════════
   Atami Video Challenge — the bosses' rating of each video
   ═══════════════════════════════════════════════════

   Tim and Ellice each rate each of a group's two videos 1–10 in the
   Boss inbox (20261027000000_pitch_ratings.sql,
   20261031000000_video_challenge.sql,
   20261101000000_video_challenge_two_bosses.sql): `pitch` for Buy it,
   try it and `geo` for Atami Geographic. A video's score is the average
   of their marks; the group's phone hears them live and collects the
   stamp once both bosses have rated both videos. One row per group, per
   video, per rater, so a boss rating again replaces only their own.

   Like the boss chat, the list is re-read whenever the channel
   (re)connects, the app comes back to the front, or the phone is back
   online: Realtime doesn't replay what a sleeping phone missed. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { chatErrorMessage } from './bossChat';

const notReady = (err) => /pitch_ratings|challenge|does not exist|schema cache/i.test(err?.message ?? '');
const COLUMNS = 'team, challenge, rating, rated_by, rater_name, updated_at';

/* The two videos of the Atami Video Challenge, in the order they are
   shown. */
export const CHALLENGES = ['pitch', 'geo'];
export const CHALLENGE_INFO = {
  pitch: { name: 'Buy it, try it', emoji: '🛍️', title: 'Pitch video', video: 'pitch video', film: 'record the pitch to Tim and Ellice' },
  geo: { name: 'Atami Geographic', emoji: '🐾', title: 'Documentary', video: 'documentary', film: 'film the documentary' },
};

/* Marks needed for a video to count as rated: Tim's and Ellice's. */
export const BOSS_RATERS = 2;

const withRow = (m, row) => {
  const c = row.challenge ?? 'pitch';
  const rows = (m[row.team]?.[c] ?? []).filter((r) => r.rated_by !== row.rated_by);
  return { ...m, [row.team]: { ...m[row.team], [c]: [...rows, row] } };
};

/** One video's marks, combined: how many raters, their average (to one
    decimal), whether both bosses are in, and who gave what. Marks from
    before `since` (a rehearsal) don't count. */
export function combineRatings(rows, since = 0) {
  const marks = (rows ?? []).filter((r) => (Date.parse(r.updated_at) || 0) >= since);
  const n = marks.length;
  const avg = n ? Math.round((marks.reduce((t, r) => t + r.rating, 0) / n) * 10) / 10 : null;
  const by = marks.map((r) => `${String(r.rater_name ?? '').trim().split(/\s+/)[0] || 'A boss'} (${r.rating})`).join(' and ');
  const at = Math.max(0, ...marks.map((r) => Date.parse(r.updated_at) || 0));
  return { n, avg, done: n >= BOSS_RATERS, by, at };
}

/**
 * Ratings by team and video, one row per rater:
 * `{ 'group-a': { pitch: [row, row], geo: [row] }, … }`. `me` is the
 * signed-in user's id, to find their own mark.
 * With `team`, only that group's. `ready` is false until both SQL files
 * have been run (or while it can't be reached), so callers can fall
 * back to rating on the phone.
 */
export function usePitchRatings({ team = null, enabled = true } = {}) {
  const [ratings, setRatings] = useState({});
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [me, setMe] = useState(null);

  useEffect(() => {
    let live = true;
    supabase?.auth.getSession().then(({ data }) => { if (live) setMe(data?.session?.user?.id ?? null); });
    return () => { live = false; };
  }, []);

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
      .upsert({ team: forTeam, challenge, rating }, { onConflict: 'team,challenge,rated_by' }).select(COLUMNS).single();
    if (error) {
      if (/no unique or exclusion constraint/i.test(error.message ?? '')) {
        throw new Error('Run 20261101000000_video_challenge_two_bosses.sql in Supabase first.');
      }
      throw new Error(notReady(error) ? 'Run 20261031000000_video_challenge.sql in Supabase first.' : chatErrorMessage(error));
    }
    setRatings((m) => withRow(m, data));
    return data;
  }, []);

  return { ratings, ready, loaded, rate, reload, me };
}
