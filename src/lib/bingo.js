/* ═══════════════════════════════════════════════════
   Photo bingo — shared card per team
   ═══════════════════════════════════════════════════

   Rows live in public.bingo_shots (one per team + tile); files in the
   private `bingo` bucket at `<team>/<tile>/<uuid>.jpg`. Anyone on the
   team can snap any tile from their own phone, so the card is read from
   here rather than from the phone running the clock.
*/

import { supabase } from './supabase';
import { PHOTO_PRESETS, compressPhoto } from './photos';

const BUCKET = 'bingo';
const URL_TTL = 60 * 60;

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

/** Put a photo on a tile, replacing any photo already there. A photo
    taken before `keepBefore` (epoch ms — the last hunt restart) loses
    its tile but its file stays in the bucket. */
export async function uploadShot(teamId, tile, file, keepBefore = 0) {
  const { blob } = await compressPhoto(file, PHOTO_PRESETS.bingo);
  const path = `${teamId}/${tile}/${crypto.randomUUID()}.jpg`;
  const store = supabase.storage.from(BUCKET);

  const up = await store.upload(path, blob, { contentType: 'image/jpeg' });
  if (up.error) throw up.error;

  const { data: old } = await supabase.from('bingo_shots').select('path, created_at').eq('team', teamId).eq('tile', tile);
  if (old?.length) {
    const del = await supabase.from('bingo_shots').delete().eq('team', teamId).eq('tile', tile);
    if (del.error) { await store.remove([path]); throw del.error; }
  }

  const { error } = await supabase.from('bingo_shots').insert({ team: teamId, tile, path });
  if (error) { await store.remove([path]); throw error; }
  const stale = (old ?? []).filter((r) => new Date(r.created_at).getTime() > keepBefore);
  if (stale.length) await store.remove(stale.map((r) => r.path));
}

/** Clear a tile. Throws if RLS refused. */
export async function deleteShot(shot) {
  const { data, error } = await supabase.from('bingo_shots').delete()
    .eq('team', shot.team).eq('tile', shot.tile).select('path');
  if (error) throw error;
  if (!data?.length) throw new Error('not allowed');
  await supabase.storage.from(BUCKET).remove([shot.path]);
}
