/* ═══════════════════════════════════════════════════
   Digital album — Supabase-backed trip photos
   ═══════════════════════════════════════════════════

   Rows live in public.album_photos; files in the private `album`
   bucket. The bucket is private, so every image is shown through a
   signed URL, minted in one batch per page of photos.

   Uploader name and upload time are stamped by the database trigger,
   not sent from here.
*/

import { supabase } from './supabase';

const BUCKET = 'album';
const URL_TTL = 60 * 60; // 1h — long enough to browse, short enough to not leak
export const PAGE_SIZE = 48;

/* Resize to a JPEG blob. Phone photos are 3–10 MB; nobody on roaming
   data should pay for that to see a thumbnail. */
function resize(img, max, quality) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve({ blob: b, width: c.width, height: c.height }) : reject(new Error('encode failed'))), 'image/jpeg', quality);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}

/* Attach signed URLs to rows: { ...row, src, thumb }. */
async function withUrls(rows) {
  if (!rows.length) return [];
  const paths = rows.flatMap((r) => [r.path, r.thumb_path]);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, URL_TTL);
  if (error) throw error;
  const url = Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({ ...r, src: url[r.path] ?? null, thumb: url[r.thumb_path] ?? url[r.path] ?? null }));
}

/** Newest first. Pass the last photo's created_at to get the next page. */
export async function listPhotos({ before = null, limit = PAGE_SIZE } = {}) {
  let q = supabase
    .from('album_photos')
    .select('id, path, thumb_path, width, height, uploader_id, uploader_name, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return withUrls(data);
}

/** Upload one photo (full + thumbnail) and record it. Returns the row. */
export async function uploadPhoto(file, userId) {
  const img = await loadImage(file);
  const [full, thumb] = await Promise.all([resize(img, 2000, 0.85), resize(img, 560, 0.74)]);
  const id = crypto.randomUUID();
  const path = `${userId}/${id}.jpg`;
  const thumbPath = `${userId}/${id}_t.jpg`;

  const store = supabase.storage.from(BUCKET);
  const up1 = await store.upload(path, full.blob, { contentType: 'image/jpeg' });
  if (up1.error) throw up1.error;
  const up2 = await store.upload(thumbPath, thumb.blob, { contentType: 'image/jpeg' });
  if (up2.error) { await store.remove([path]); throw up2.error; }

  const { data, error } = await supabase
    .from('album_photos')
    .insert({ path, thumb_path: thumbPath, width: full.width, height: full.height })
    .select('id, path, thumb_path, width, height, uploader_id, uploader_name, created_at')
    .single();
  if (error) { await store.remove([path, thumbPath]); throw error; }

  const [row] = await withUrls([data]);
  return row;
}

/** Delete the record, then the files. Throws if RLS refused. */
export async function deletePhoto(photo) {
  const { data, error } = await supabase.from('album_photos').delete().eq('id', photo.id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('not allowed');
  await supabase.storage.from(BUCKET).remove([photo.path, photo.thumb_path]);
}

export function formatUploaded(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
