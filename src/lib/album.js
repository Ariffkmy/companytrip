/* ═══════════════════════════════════════════════════
   Digital album — Supabase-backed trip photos and videos
   ═══════════════════════════════════════════════════

   Rows live in public.album_photos; files in the private `album`
   bucket. The bucket is private, so every image is shown through a
   signed URL, minted in one batch per page of photos.

   Uploader name and upload time are stamped by the database trigger,
   not sent from here.

   The upload/sign/delete helpers take a { bucket, table } target, so
   stories (src/lib/stories.js) store the same way in their own place.
*/

import { supabase } from './supabase';
import { PHOTO_PRESETS, compressPhoto, loadImage } from './photos';
import { isVideoFile, prepareVideo } from './video';

const ALBUM = { bucket: 'album', table: 'album_photos' };
/* Stories show in the album too, every one ever posted, not only the
   last day's (src/lib/stories.js lists those). Each row carries
   `source`, so saving and deleting go to the right place. */
const STORIES = { bucket: 'stories', table: 'stories' };
/* The treasure hunt's photos and videos show here too, every group's to
   every member. They stay the hunt's: saved from here, but never
   deleted from here. */
const PITCH = { bucket: 'pitch-videos', table: 'pitch_videos' };
const BUCKET_OF = { album: 'album', story: 'stories', pitch: 'pitch-videos', bingo: 'bingo', hunt: 'hunt-photos' };
const targetOf = (item) => (item.source === 'story' ? STORIES : ALBUM);
/** Only the album's own photos and stories can be deleted from the album. */
export const isHuntMedia = (item) => item.source === 'pitch' || item.source === 'bingo' || item.source === 'hunt';
export const MEDIA_COLUMNS = 'id, path, thumb_path, width, height, kind, duration, uploader_id, uploader_name, created_at';
const URL_TTL = 60 * 60; // 1h — long enough to browse, short enough to not leak
export const PAGE_SIZE = 48;
const CACHE_KEY = 'olc-album';

/* The newest page, as last seen on this phone. The album and the Home
   carousel draw from it straight away and refresh behind it. Its signed
   URLs may have expired, but the service worker caches album files by
   path, so any photo already seen still loads — with or without signal. */
export function cachedPhotos() {
  try {
    const rows = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return Array.isArray(rows) ? rows : null;
  } catch (e) {
    return null;
  }
}

function remember(rows) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows.slice(0, PAGE_SIZE))); } catch (e) { /* quota — skip */ }
}

/** Attach signed URLs to rows: { ...row, src, thumb }. */
export async function withUrls(bucket, rows) {
  if (!rows.length) return [];
  const paths = rows.flatMap((r) => [r.path, r.thumb_path]).filter(Boolean);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, URL_TTL);
  if (error) throw error;
  const url = Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({ ...r, src: url[r.path] ?? null, thumb: url[r.thumb_path] ?? url[r.path] ?? null }));
}

/* One table's newest `limit` rows before `before`, signed and tagged. */
async function listFrom({ bucket, table }, source, before, limit) {
  let q = supabase
    .from(table)
    .select(MEDIA_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (await withUrls(bucket, data)).map((r) => ({ ...r, source }));
}

/* Photo bingo shots (src/lib/bingo.js). No thumbnail: the shot is
   already small. */
async function listBingo(before, limit) {
  let q = supabase
    .from('bingo_shots')
    .select('path, uploader_id, uploader_name, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data.map((r) => ({ ...r, id: `bingo:${r.path}`, thumb_path: null, kind: 'photo' }));
  return (await withUrls('bingo', rows)).map((r) => ({ ...r, source: 'bingo' }));
}

/* The games' photos (pose, selfie, boss…) live in each group's synced
   run as `{ path }` (src/lib/huntScores.js). hunt_album_photos() hands
   back just those paths, timed by when the game was sent, for every
   group (20261102000000_hunt_photos_everyone.sql). There are only a
   handful, so they are all read and paged here. */
async function listHuntPhotos(before, limit) {
  const { data, error } = await supabase.rpc('hunt_album_photos');
  if (error) throw error;
  const rows = new Map();
  for (const r of data) {
    const created = new Date(Number(r.sent_at)).toISOString();
    if ((before && created >= before) || rows.has(r.path)) continue;
    rows.set(r.path, {
      id: `hunt:${r.path}`, path: r.path, thumb_path: null, kind: 'photo',
      uploader_id: null, uploader_name: `${r.team_name || r.team_id} · Treasure hunt`, created_at: created,
    });
  }
  const newest = [...rows.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  return (await withUrls('hunt-photos', newest)).map((r) => ({ ...r, source: 'hunt' }));
}

/* A hunt source that can't be read (its SQL not run yet) adds nothing,
   and a file this member may not open is left out, not shown broken. */
const huntSource = (p) => p.then((rows) => rows.filter((r) => r.src)).catch(() => []);

/** Album photos, stories and the treasure hunt's photos and videos
    together, newest first. Pass the last item's created_at to get the
    next page. */
export async function listPhotos({ before = null, limit = PAGE_SIZE } = {}) {
  /* The newest `limit` of all is within the newest `limit` of each. */
  const [album, stories, pitch, bingo, hunt] = await Promise.all([
    listFrom(ALBUM, 'album', before, limit),
    listFrom(STORIES, 'story', before, limit),
    huntSource(listFrom(PITCH, 'pitch', before, limit)),
    huntSource(listBingo(before, limit)),
    huntSource(listHuntPhotos(before, limit)),
  ]);
  const rows = [...album, ...stories, ...pitch, ...bingo, ...hunt]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
  /* Only a full first page is a trustworthy "newest" snapshot. */
  if (!before && limit >= PAGE_SIZE) remember(rows);
  return rows;
}

/** Every photo and video in the album, newest first, page by page. */
export async function listAllPhotos() {
  const all = [];
  for (;;) {
    const rows = await listPhotos({ before: all.length ? all[all.length - 1].created_at : null });
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
}

/* One archive stays well inside what a phone can hold in memory and
   hand to the share sheet; a bigger album comes in several parts. */
const PART_BYTES = 300 * 1024 * 1024;

/** Download the whole album as one or more .zip files.
    `onProgress({ done, total, failed })` as files arrive; `save(file,
    { part, last })` is handed each finished archive and may wait (for a
    tap, say) before the next part starts. Returns { total, failed }. */
export async function downloadAlbum({ onProgress = () => {}, save }) {
  const { ZipWriter } = await import('./zip');
  const items = await listAllPhotos();
  const total = items.length;
  let done = 0;
  let failed = 0;
  let part = 1;
  let zip = new ZipWriter();
  onProgress({ done, total, failed });

  const finish = async (last) => {
    if (!zip.count) return;
    const name = last && part === 1 ? 'atami-trip-album.zip' : `atami-trip-album-part${part}.zip`;
    await save(new File([zip.blob()], name, { type: 'application/zip' }), { part, last });
    part += 1;
    zip = new ZipWriter();
  };

  /* A few at a time: quicker than one by one, kinder than all at once. */
  const AT_ONCE = 4;
  for (let i = 0; i < items.length; i += AT_ONCE) {
    const batch = items.slice(i, i + AT_ONCE);
    const files = await Promise.all(batch.map((item) => fetchAlbumFile(item).catch(() => null)));
    for (let k = 0; k < batch.length; k++) {
      if (files[k]) await zip.add(files[k], files[k].name, new Date(batch[k].created_at));
      else failed += 1;
      done += 1;
    }
    onProgress({ done, total, failed });
    if (zip.size >= PART_BYTES && i + AT_ONCE < items.length) await finish(false);
  }
  await finish(true);
  return { total, failed };
}

/** Keep the device copy in step with an upload or delete. */
export function updateCachedPhotos(fn) {
  const rows = cachedPhotos();
  if (rows) remember(fn(rows));
}

/* Store the two files, then the row; undo the files if the row fails. */
async function store({ bucket, table }, userId, { blob, contentType, ext, thumb, row }) {
  const id = crypto.randomUUID();
  const path = `${userId}/${id}.${ext}`;
  const thumbPath = `${userId}/${id}_t.jpg`;

  const files = supabase.storage.from(bucket);
  /* Side by side: the thumbnail is tiny and done long before. */
  const [up1, up2] = await Promise.all([
    files.upload(path, blob, { contentType }),
    files.upload(thumbPath, thumb, { contentType: 'image/jpeg' }),
  ]);
  if (up1.error || up2.error) {
    await files.remove([path, thumbPath]);
    throw up1.error ?? up2.error;
  }

  const { data, error } = await supabase
    .from(table)
    .insert({ path, thumb_path: thumbPath, ...row })
    .select(MEDIA_COLUMNS)
    .single();
  if (error) { await files.remove([path, thumbPath]); throw error; }

  const [signed] = await withUrls(bucket, [data]);
  return signed;
}

/** Upload one photo or video to a { bucket, table } target and record
    it. Returns the row. Videos report
    `onProgress({ stage: 'shrink' | 'upload', progress })`. `extra` adds
    columns to the row (a pitch video's challenge). */
export async function uploadMedia(target, file, userId, { onProgress = () => {}, maxSeconds, extra = {} } = {}) {
  if (isVideoFile(file)) {
    const v = await prepareVideo(file, (p) => onProgress({ stage: 'shrink', progress: p }), { maxSeconds });
    onProgress({ stage: 'upload', progress: 0 });
    return store(target, userId, {
      blob: v.blob, contentType: v.contentType, ext: v.ext, thumb: v.thumb,
      row: { width: v.width, height: v.height, kind: 'video', duration: v.duration, ...extra },
    });
  }
  const img = await loadImage(file);
  /* Phone photos are 3–10 MB; nobody on roaming data should pay for
     that to see a thumbnail (src/lib/photos.js). */
  const full = await compressPhoto(img, PHOTO_PRESETS.album);
  const thumb = await compressPhoto(img, PHOTO_PRESETS.thumb);
  return store(target, userId, {
    blob: full.blob, contentType: 'image/jpeg', ext: 'jpg', thumb: thumb.blob,
    row: { width: full.width, height: full.height, ...extra },
  });
}

/** Delete the record, then the files. Throws if RLS refused. */
export async function deleteMedia({ bucket, table }, item) {
  const { data, error } = await supabase.from(table).delete().eq('id', item.id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('not allowed');
  await supabase.storage.from(bucket).remove([item.path, item.thumb_path]);
}

/** The full-size file of an album photo or video, as a File ready to
    save. Fetched through the API rather than the signed URL, which may
    have expired on a cached row. */
export async function fetchAlbumFile(item) {
  const { data, error } = await supabase.storage.from(BUCKET_OF[item.source] ?? ALBUM.bucket).download(item.path);
  if (error) throw error;
  const ext = item.path.split('.').pop();
  const d = new Date(item.created_at);
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const name = `atami-trip-${day}-${item.path.split('/').pop().slice(0, 6)}.${ext}`;
  return new File([data], name, { type: data.type || (item.kind === 'video' ? 'video/mp4' : 'image/jpeg') });
}

/** Save a file to the phone. The share sheet comes first where it can
    take files (iPhone and Android: "Save image" / "Save video" puts it in
    the camera roll); otherwise a plain browser download. Throws
    NotAllowedError when the tap that started it is too old to share
    from, so the caller can ask for one more tap. */
export async function saveFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return; // closed the share sheet
      if (e?.name === 'NotAllowedError') throw e;
      /* Anything else: fall through to a download. */
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const uploadAlbumMedia = async (file, userId, onProgress) =>
  ({ ...(await uploadMedia(ALBUM, file, userId, { onProgress })), source: 'album' });
/* A story deleted here is gone from Stories too. */
export const deletePhoto = (photo) => deleteMedia(targetOf(photo), photo);

export function formatUploaded(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
