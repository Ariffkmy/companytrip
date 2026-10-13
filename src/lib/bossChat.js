/* ═══════════════════════════════════════════════════
   Find the boss — the live yes/no chat
   ═══════════════════════════════════════════════════

   Groups ask the bosses questions; the bosses answer only Yes or No
   (20261015000000_boss_chat.sql). One row is a question and its answer.
   Supabase Realtime pushes new questions and answers to every open
   phone; the table's select policy decides who receives what, so a
   group only ever hears its own thread.

   Phones sleep and lose signal in the field, and Realtime does not
   replay what was missed, so the list is re-read whenever the channel
   (re)connects, the app comes back to the front, or the phone is back
   online. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export const QUESTION_MAX = 200;

const byCreated = (a, b) => String(a.created_at).localeCompare(String(b.created_at));

function merge(list, row) {
  const i = list.findIndex((r) => r.id === row.id);
  const next = i < 0 ? [...list, row] : list.map((r) => (r.id === row.id ? { ...r, ...row } : r));
  return next.sort(byCreated);
}

const notReady = (err) => /boss_questions|does not exist|schema cache/i.test(err?.message ?? '');

/** What went wrong, for a group member or a boss. */
export function chatErrorMessage(err) {
  const t = `${err?.name ?? ''} ${err?.message ?? ''}`;
  if (notReady(err)) return 'The boss chat isn’t switched on yet. Tell the committee.';
  if (/failed to fetch|network|offline|load failed|timed? ?out/i.test(t)) return 'No connection, so that didn’t send. Try again with signal.';
  if (/row-level|policy|permission|not allowed|\b403\b/i.test(t)) return 'You can’t do that here.';
  if (/check constraint|question_check/i.test(t)) return `Keep it to ${QUESTION_MAX} characters.`;
  return 'That didn’t go through. Try again.';
}

/**
 * The questions for one group (`team`), or every group's (`team` null,
 * the boss inbox). `onEvent(kind, row, before)` hears live changes:
 * kind is 'asked' or 'answered'.
 */
export function useBossQuestions({ team = null, enabled = true, onEvent } = {}) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('connecting'); // connecting · live · offline
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const reload = useCallback(async () => {
    if (!supabase || !enabled) return;
    let q = supabase.from('boss_questions').select('*').order('created_at');
    if (team) q = q.eq('team', team);
    const { data, error: err } = await q;
    if (err) { setError(chatErrorMessage(err)); setLoaded(true); return; }
    setError('');
    setItems(data ?? []);
    setLoaded(true);
  }, [team, enabled]);

  useEffect(() => {
    if (!supabase || !enabled) return undefined;
    reload();
    const channel = supabase
      .channel(`boss-questions:${team ?? 'all'}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'boss_questions',
        ...(team ? { filter: `team=eq.${team}` } : {}),
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setItems((list) => list.filter((r) => r.id !== payload.old?.id));
          return;
        }
        const row = payload.new;
        if (!row?.id) return;
        const before = itemsRef.current.find((r) => r.id === row.id) ?? null;
        setItems((list) => merge(list, row));
        if (payload.eventType === 'INSERT' && !before) onEventRef.current?.('asked', row, null);
        if (payload.eventType === 'UPDATE' && row.answer && row.answer !== before?.answer) {
          onEventRef.current?.('answered', row, before);
        }
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') { setStatus('live'); reload(); }
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('offline');
      });

    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    const onOnline = () => reload();
    const onOffline = () => setStatus('offline');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      supabase.removeChannel(channel);
    };
  }, [team, enabled, reload]);

  /* Throws a readable Error on failure; the caller shows it. */
  const ask = useCallback(async (text) => {
    const question = String(text ?? '').trim().slice(0, QUESTION_MAX);
    if (!question || !team) return null;
    const { data, error: err } = await supabase.from('boss_questions')
      .insert({ team, question }).select().single();
    if (err) throw new Error(chatErrorMessage(err));
    setItems((list) => merge(list, data));
    return data;
  }, [team]);

  /* Optimistic: the tap shows at once, a refusal puts it back. */
  const answer = useCallback(async (id, value) => {
    const before = itemsRef.current.find((r) => r.id === id);
    setItems((list) => list.map((r) => (r.id === id ? { ...r, answer: value } : r)));
    const { data, error: err } = await supabase.from('boss_questions')
      .update({ answer: value }).eq('id', id).select().single();
    if (err || !data) {
      if (before) setItems((list) => merge(list, before));
      throw new Error(chatErrorMessage(err ?? { message: 'row-level security' }));
    }
    setItems((list) => merge(list, data));
    return data;
  }, []);

  return { items, status, loaded, error, ask, answer, reload };
}

/* ── Getting someone's attention ──────────────────────
   Browsers only play sound after a tap on the page, so unlockSound()
   is called from one (sending a question, starting standby). */
let audio = null;

export function unlockSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audio) audio = new Ctx();
    if (audio.state === 'suspended') audio.resume();
  } catch (e) { /* no sound on this phone */ }
}

/** Two short beeps and a buzz. */
export function ping() {
  try { navigator.vibrate?.([140, 80, 140]); } catch (e) { /* silent */ }
  if (!audio || audio.state !== 'running') return;
  try {
    [0, 0.22].forEach((at, i) => {
      const t = audio.currentTime + at;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = i ? 1046 : 784;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch (e) { /* silent */ }
}

/** Keeps the screen on while `on` (a boss on standby). The browser
    drops the lock when the app is hidden, so it is asked for again on
    return. Returns whether the phone supports it. */
export function useWakeLock(on) {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  useEffect(() => {
    if (!on || !supported) return undefined;
    let lock = null;
    let live = true;
    const take = async () => {
      try {
        const l = await navigator.wakeLock.request('screen');
        if (live) lock = l; else l.release();
      } catch (e) { /* low battery mode, or refused */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') take(); };
    take();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [on, supported]);
  return supported;
}
