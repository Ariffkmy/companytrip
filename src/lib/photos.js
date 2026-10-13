/* ═══════════════════════════════════════════════════
   Photos — one way to shrink them, one way to explain a failed upload
   ═══════════════════════════════════════════════════

   Every photo the app keeps (album, bingo, hunt games, the committee's
   reference shots) is re-encoded here as a JPEG before it goes
   anywhere. Phone photos are 3–10 MB; each preset is sized for where
   the photo is seen, and capped in bytes: if the first encode is over
   the cap, quality and then size step down until it fits. */

export const PHOTO_PRESETS = {
  /* Hunt game photos: kept on the leader's phone (localStorage is ~5 MB
     for everything) and synced to hunt-photos. */
  game: { max: 1000, quality: 0.72, maxBytes: 200 * 1024 },
  /* Bingo tiles, seen as a 3-wide grid and full-screen. */
  bingo: { max: 1080, quality: 0.72, maxBytes: 280 * 1024 },
  /* The album: the photo people keep, so the most generous. */
  album: { max: 1600, quality: 0.78, maxBytes: 520 * 1024 },
  /* Album grid thumbnails. */
  thumb: { max: 480, quality: 0.7, maxBytes: 60 * 1024 },
  /* The committee's reference photos in the hunt editor. */
  reference: { max: 1400, quality: 0.76, maxBytes: 380 * 1024 },
  /* The editor's preview bingo, held in memory only. */
  preview: { max: 420, quality: 0.6, maxBytes: 50 * 1024 },
};

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}

function encode(img, max, quality) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d');
  /* JPEG has no transparency: a PNG's clear areas go white, not black. */
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve({ blob: b, width: c.width, height: c.height }) : reject(new Error('encode failed'))),
      'image/jpeg', quality);
  });
}

/** A File (or an already loaded image) → { blob, width, height }, a JPEG
    within the preset's cap. */
export async function compressPhoto(source, preset = PHOTO_PRESETS.album) {
  const img = source instanceof HTMLImageElement ? source : await loadImage(source);
  let { max, quality } = preset;
  let out = await encode(img, max, quality);
  for (let i = 0; i < 6 && out.blob.size > preset.maxBytes; i++) {
    if (quality > 0.56) quality -= 0.08;
    else max = Math.round(max * 0.82);
    out = await encode(img, max, quality);
  }
  return out;
}

/** The same, as a data URL, for photos kept in the hunt run. */
export async function compressPhotoToDataUrl(source, preset = PHOTO_PRESETS.game) {
  const { blob } = await compressPhoto(source, preset);
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('encode failed'));
    r.readAsDataURL(blob);
  });
}

const errorText = (err) => [err?.name, err?.message, err?.error, err?.statusCode, err?.status]
  .filter((v) => v != null).join(' ');

/** The project's photo storage is out of room (Supabase quota, or the
    server out of space) — as opposed to this one photo being refused. */
export function isStorageFull(err) {
  return /quota|storage (is )?full|insufficient[_ ]storage|exceed[a-z_]*storage|storage[a-z_ ]*limit|\b(402|507)\b/i.test(errorText(err))
    && !isDeviceFull(err);
}

/** This phone's own storage is full (saving a hunt run to localStorage). */
export function isDeviceFull(err) {
  return /QuotaExceeded|NS_ERROR_DOM_QUOTA/i.test(errorText(err));
}

export const STORAGE_FULL_MESSAGE =
  'Photo storage is full, so new photos can’t be saved right now. Tell the committee — nothing already uploaded is lost.';

export const DEVICE_FULL_MESSAGE =
  'This phone is out of storage space, so the photo couldn’t be kept. Free up some space, then try again.';

/** A failed photo upload, in words. `denied` replaces the message for a
    permission refusal, which means different things on different pages. */
export function photoErrorMessage(err, { denied } = {}) {
  const t = errorText(err);
  if (isDeviceFull(err)) return DEVICE_FULL_MESSAGE;
  if (isStorageFull(err)) return STORAGE_FULL_MESSAGE;
  if (/maximum allowed size|too large|payload|entity too large|\b413\b/i.test(t)) {
    return 'That photo is still too large to upload after shrinking it. Try a different one.';
  }
  if (/not an image|bad image|encode failed|decode/i.test(t)) {
    return 'That file isn’t a photo this phone can read. Try a JPG or PNG.';
  }
  if (/failed to fetch|network|offline|timed? ?out|load failed/i.test(t)) {
    return 'No connection — photos need internet to upload. Try again with signal.';
  }
  if (/row-level|policy|unauthori[sz]ed|not allowed|permission|\b403\b/i.test(t)) {
    return denied ?? 'You’re not allowed to upload this photo.';
  }
  return 'The photo didn’t upload. Try again.';
}
