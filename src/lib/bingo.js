/* ═══════════════════════════════════════════════════
   Photo bingo — shared card per team
   ═══════════════════════════════════════════════════

   Rows live in public.bingo_shots (one per team + tile); files in the
   private `bingo` bucket at `<team>/<tile>/<uuid>.jpg`. Every member
   snaps their own tiles on their own phone, so the card is read from
   here rather than from the phone running the clock.

   Who snaps each tile is drawn at random by the server (bingo_card) —
   admins don't pick. Who may upload is enforced by RLS; the
   helpers below only mirror it so the UI can explain a refusal before
   the request is made.
*/

import { supabase } from './supabase';
import groupRoster from '../data/groupRoster';

const BUCKET = 'bingo';
const URL_TTL = 60 * 60;

export const TEAM_LEAD = 'Team Lead';

function toJpeg(file, max = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

/* 'mine' — drawn for me · 'cover' — I'm the Team Lead (or an admin) and
   it's someone else's · 'no' — hands off. */
export function tileAccess(assignee, me, teamId) {
  const mine = !!assignee && assignee.email === me?.email;
  if (mine) return 'mine';
  if (me?.isAdmin) return 'cover';
  if (!me || me.team !== teamId) return 'no';
  return me.role === TEAM_LEAD ? 'cover' : 'no';
}

/* Passport-style names are too long for a tile; use the roster's short
   name when the full name matches. */
function shortName(name, teamId) {
  const team = groupRoster.find((g) => g.id === teamId);
  const hit = team?.members.find((m) => m.full && m.full.toLowerCase() === String(name).toLowerCase());
  return hit?.name ?? name;
}

/** Who snaps each tile: { [tile]: { email, name } }. The server draws it
    at random the first time the card is opened, then keeps it. */
export async function fetchCard(teamId) {
  const { data, error } = await supabase.rpc('bingo_card', { p_team: teamId });
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.tile, { email: r.email, name: shortName(r.name, teamId) }]));
}

/* The admin preview has no real draw — deal the roster out at random
   the same way, just for show. */
export function previewCard(teamId) {
  const team = groupRoster.find((g) => g.id === teamId);
  if (!team) return {};
  const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((p) => p[1]);
  const people = [...shuffle(team.members.filter((m) => m.role !== TEAM_LEAD)), ...team.members.filter((m) => m.role === TEAM_LEAD)];
  const tiles = shuffle(Array.from({ length: 9 }, (_, i) => i));
  return Object.fromEntries(tiles.map((t, k) => [t, { email: `preview:${k % people.length}`, name: people[k % people.length].name }]));
}

/** { [tile]: row with src } for one team, or for every team the caller can see. */
export async function listShots(teamId = null) {
  let q = supabase.from('bingo_shots').select('team, tile, path, uploader_name, on_behalf, created_at');
  if (teamId) q = q.eq('team', teamId);
  const { data, error } = await q;
  if (error) throw error;
  if (!data.length) return [];
  const { data: urls, error: urlErr } = await supabase.storage.from(BUCKET)
    .createSignedUrls(data.map((r) => r.path), URL_TTL);
  if (urlErr) throw urlErr;
  const byPath = Object.fromEntries(urls.filter((u) => u.signedUrl).map((u) => [u.path, u.signedUrl]));
  return data.map((r) => ({ ...r, src: byPath[r.path] ?? null }));
}

/** Put a photo on a tile, replacing any photo already there. */
export async function uploadShot(teamId, tile, file) {
  const blob = await toJpeg(file);
  const path = `${teamId}/${tile}/${crypto.randomUUID()}.jpg`;
  const store = supabase.storage.from(BUCKET);

  const up = await store.upload(path, blob, { contentType: 'image/jpeg' });
  if (up.error) throw up.error;

  const { data: old } = await supabase.from('bingo_shots').select('path').eq('team', teamId).eq('tile', tile);
  if (old?.length) {
    const del = await supabase.from('bingo_shots').delete().eq('team', teamId).eq('tile', tile);
    if (del.error) { await store.remove([path]); throw del.error; }
  }

  const { error } = await supabase.from('bingo_shots').insert({ team: teamId, tile, path });
  if (error) { await store.remove([path]); throw error; }
  if (old?.length) await store.remove(old.map((r) => r.path));
}

/** Clear a tile. Throws if RLS refused. */
export async function deleteShot(shot) {
  const { data, error } = await supabase.from('bingo_shots').delete()
    .eq('team', shot.team).eq('tile', shot.tile).select('path');
  if (error) throw error;
  if (!data?.length) throw new Error('not allowed');
  await supabase.storage.from(BUCKET).remove([shot.path]);
}
