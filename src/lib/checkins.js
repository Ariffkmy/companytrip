/* ═══════════════════════════════════════════════════
   Safety check-ins — where everyone is during the hunt
   ═══════════════════════════════════════════════════

   While the hunt is open and not stopped, every hunt-group member is
   asked every 15 minutes to share their location
   (20261019000000_location_checkins.sql). Admin → Check-ins shows the
   latest for each person and flags anyone overdue.

   A web app only runs while it's on screen: a phone in a pocket can't
   be asked. So the popup appears as soon as the app is opened again,
   and the admin list's "overdue" is the signal that someone hasn't.

   Atami's signal comes and goes, so a reading that can't be sent is
   kept on the phone with the time it was taken, and sent when the
   phone is back online. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export const CHECKIN_EVERY_MS = 15 * 60 * 1000;
export const OVERDUE_MS = 20 * 60 * 1000;
/* "Not now" brings the popup back this much later. */
export const SNOOZE_MS = 5 * 60 * 1000;

const HUNT_ID = 'atami';

/** True while the hunt is open and the committee hasn't stopped it. */
export async function fetchHuntActive() {
  if (!supabase) return false;
  let res = await supabase.from('hunt_config').select('is_open, stopped_at').eq('id', HUNT_ID).maybeSingle();
  /* Before 20261018000000_hunt_stop.sql there is no stopped_at. */
  if (res.error) res = await supabase.from('hunt_config').select('is_open').eq('id', HUNT_ID).maybeSingle();
  if (res.error) return false;
  return res.data?.is_open === true && !res.data?.stopped_at;
}

/** The phone's position: { status: 'ok', lat, lng, accuracy } or { status: 'denied' | 'unavailable' }. */
export function getPosition() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) { resolve({ status: 'unavailable' }); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ status: 'ok', lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (err) => resolve({ status: err.code === 1 ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
    );
  });
}

/* ── When this person last checked in, on this phone ── */
const lastKey = (userId) => `olc-checkin:${userId}`;
const pendingKey = (userId) => `olc-checkin-pending:${userId}`;

export function readLast(userId) {
  try { return Number(localStorage.getItem(lastKey(userId))) || 0; } catch (e) { return 0; }
}

export function writeLast(userId, at) {
  try { localStorage.setItem(lastKey(userId), String(at)); } catch (e) { /* silent */ }
}

/* Only the latest unsent reading is worth keeping: it's the one that
   says where they are. */
function readPending(userId) {
  try { return JSON.parse(localStorage.getItem(pendingKey(userId)) || 'null'); } catch (e) { return null; }
}

function writePending(userId, row) {
  try {
    if (row) localStorage.setItem(pendingKey(userId), JSON.stringify(row));
    else localStorage.removeItem(pendingKey(userId));
  } catch (e) { /* silent */ }
}

const offline = (error) => /failed to fetch|network|load failed|timed? ?out/i.test(`${error?.name ?? ''} ${error?.message ?? ''}`);

async function insert(row) {
  const { error } = await supabase.from('location_checkins').insert(row);
  return error;
}

/**
 * Records a reading. Returns 'sent', or 'queued' when there was no
 * signal (it goes later, with flushPending), or throws when the
 * database refused it for another reason.
 */
export async function sendCheckin(userId, reading) {
  const row = {
    status: reading.status,
    lat: reading.lat ?? null,
    lng: reading.lng ?? null,
    accuracy: reading.accuracy ?? null,
    taken_at: new Date().toISOString(),
  };
  const error = await insert(row);
  if (!error) { writePending(userId, null); return 'sent'; }
  if (offline(error)) { writePending(userId, row); return 'queued'; }
  throw new Error(/location_checkins|schema cache|does not exist/i.test(error.message ?? '')
    ? 'Check-ins aren’t switched on yet. Tell the committee.'
    : 'Your check-in didn’t save. Try again.');
}

/** Sends a reading kept from when there was no signal. */
export async function flushPending(userId) {
  const row = readPending(userId);
  if (!row || !supabase) return;
  const error = await insert(row);
  if (!error || !offline(error)) writePending(userId, null);
}

/* ── Admin: everyone's check-ins, live ─────────────── */
export function useCheckinsLive({ sinceMs = 24 * 60 * 60 * 1000 } = {}) {
  const [rows, setRows] = useState([]);
  const [people, setPeople] = useState([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase) return;
    const since = new Date(Date.now() - sinceMs).toISOString();
    const [c, p] = await Promise.all([
      supabase.from('location_checkins').select('*').gte('taken_at', since).order('taken_at', { ascending: false }).limit(3000),
      supabase.from('profiles').select('id, full_name, hunt_group').not('hunt_group', 'is', null),
    ]);
    setLoaded(true);
    if (c.error) {
      setError(/location_checkins|schema cache|does not exist/i.test(c.error.message ?? '')
        ? 'Check-ins aren’t switched on yet — run 20261019000000_location_checkins.sql in Supabase.'
        : 'Couldn’t load check-ins. Check your connection.');
      return;
    }
    setError('');
    setRows(c.data ?? []);
    if (!p.error) setPeople(p.data ?? []);
  }, [sinceMs]);

  useEffect(() => {
    if (!supabase) return undefined;
    reload();
    const channel = supabase
      .channel(`checkins:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_checkins' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new?.id) {
          setRows((list) => (list.some((r) => r.id === payload.new.id) ? list
            : [payload.new, ...list].sort((a, b) => String(b.taken_at).localeCompare(String(a.taken_at)))));
        } else {
          reload();
        }
      })
      .subscribe((s) => { if (s === 'SUBSCRIBED') reload(); });
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [reload]);

  return { rows, people, error, loaded, reload };
}

/** Every check-in, gone. Admin only. */
export async function deleteAllCheckins() {
  const { error } = await supabase.from('location_checkins').delete().not('id', 'is', null);
  if (error) throw new Error('Couldn’t delete them. Try again.');
}

export const mapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;
