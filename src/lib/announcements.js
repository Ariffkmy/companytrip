/* ═══════════════════════════════════════════════════
   Announcements — the committee's alerts to everyone
   ═══════════════════════════════════════════════════

   An admin sends a message; it pops up at once on every phone with the
   app open (Supabase Realtime, 20261017000000_announcements.sql). A
   phone that was closed, asleep or offline catches up when it comes
   back: anything from the last 24 hours it hasn't dismissed still pops
   up. Dismissals are remembered per person on the phone. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export const ANNOUNCEMENT_MAX = 500;
/* Older than this, a missed announcement is news nobody needs a popup for. */
export const POPUP_WINDOW_MS = 24 * 60 * 60 * 1000;

const newestFirst = (a, b) => String(b.created_at).localeCompare(String(a.created_at));

export function announcementError(err) {
  const t = `${err?.name ?? ''} ${err?.message ?? ''}`;
  if (/announcements|does not exist|schema cache/i.test(t)) return 'Announcements aren’t switched on yet — run 20261017000000_announcements.sql.';
  if (/failed to fetch|network|offline|load failed|timed? ?out/i.test(t)) return 'No connection, so it wasn’t sent. Try again with signal.';
  if (/row-level|policy|permission|\b403\b/i.test(t)) return 'Only admins can send announcements.';
  if (/check constraint/i.test(t)) return `Keep it to ${ANNOUNCEMENT_MAX} characters.`;
  return 'That didn’t go through. Try again.';
}

/** Recent announcements, kept live. `onNew(row)` hears each new one. */
export function useAnnouncements({ enabled = true, onNew } = {}) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  const reload = useCallback(async () => {
    if (!supabase || !enabled) return;
    const { data, error: err } = await supabase.from('announcements')
      .select('*').order('created_at', { ascending: false }).limit(30);
    if (err) { setError(announcementError(err)); return; }
    setError('');
    setItems(data ?? []);
  }, [enabled]);

  useEffect(() => {
    if (!supabase || !enabled) return undefined;
    reload();
    const channel = supabase
      .channel(`announcements:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setItems((list) => list.filter((r) => r.id !== payload.old?.id));
          return;
        }
        const row = payload.new;
        if (!row?.id || itemsRef.current.some((r) => r.id === row.id)) return;
        setItems((list) => (list.some((r) => r.id === row.id) ? list : [row, ...list].sort(newestFirst)));
        if (payload.eventType === 'INSERT') onNewRef.current?.(row);
      })
      .subscribe((s) => { if (s === 'SUBSCRIBED') reload(); });

    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    const onOnline = () => reload();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      supabase.removeChannel(channel);
    };
  }, [enabled, reload]);

  return { items, error, reload, setItems };
}

export async function sendAnnouncement(body, level = 'info') {
  const text = String(body ?? '').trim().slice(0, ANNOUNCEMENT_MAX);
  if (!text) return null;
  const { data, error } = await supabase.from('announcements')
    .insert({ body: text, level }).select().single();
  if (error) throw new Error(announcementError(error));
  return data;
}

export async function deleteAnnouncement(id) {
  const { data, error } = await supabase.from('announcements').delete().eq('id', id).select('id');
  if (error || !data?.length) throw new Error(announcementError(error ?? { message: 'row-level security' }));
}

/* ── Which ones this person has dismissed, on this phone ── */
const seenKey = (userId) => `olc-ann-seen:${userId}`;

export function readSeen(userId) {
  try { return new Set(JSON.parse(localStorage.getItem(seenKey(userId)) || '[]')); } catch (e) { return new Set(); }
}

export function writeSeen(userId, ids) {
  try { localStorage.setItem(seenKey(userId), JSON.stringify([...ids].slice(-60))); } catch (e) { /* silent */ }
}
