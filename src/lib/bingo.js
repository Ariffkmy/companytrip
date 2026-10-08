/* ═══════════════════════════════════════════════════
   Photo bingo — shared card per team
   ═══════════════════════════════════════════════════

   Rows live in public.bingo_shots (one per team + tile); files in the
   private `bingo` bucket at `<team>/<tile>/<uuid>.jpg`. Anyone on the
   team can snap any tile from their own phone, so the card is read from
   here rather than from the phone running the clock.
*/

import { supabase } from './supabase';

const BUCKET = 'bingo';
const URL_TTL = 60 * 60;

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

/** { [tile]: row with src } for one team, or for every team the caller can see. */
export async function listShots(teamId = null) {
  let q = supabase.from('bingo_shots').select('team, tile, path, uploader_name, created_at');
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
