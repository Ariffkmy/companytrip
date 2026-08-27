/* ═══════════════════════════════════════════════════
   Gallery storage adapter
   ═══════════════════════════════════════════════════

   Everything the Gallery UI knows about storage lives behind the
   `galleryStore` object exported at the bottom of this file. Swapping
   the local IndexedDB backend for Supabase means reimplementing four
   methods — `list`, `add`, `remove`, `dispose` — and touching nothing
   in Gallery.jsx.

   See SUPABASE NOTES at the bottom for the intended shape of that swap.

   Every item handed to the UI is normalised to:
     { id, kind, src, name, size, at, source, team?, checkpoint?, readOnly? }
   where kind is 'photo' | 'video' and source is 'upload' | 'hunt'.
*/

const DB_NAME = 'olc-gallery';
const DB_VERSION = 1;
const STORE = 'media';

/* Object URLs minted for blobs out of IndexedDB. Kept so they can be
   revoked together — without this every re-list leaks a URL. */
const urlCache = new Map();

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('at', 'at');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.onerror = () => reject(t.error);
    if (req) {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      t.oncomplete = () => resolve();
    }
  });
}

function urlFor(id, blob) {
  const existing = urlCache.get(id);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

/* ── Treasure hunt photos ────────────────────────────
   Read-only. The hunt writes compressed data URLs into
   localStorage under `treasure:<teamId>`; cp5 is a video but only its
   metadata is kept (the file stays on the team's phone), so there is
   nothing to show for it here. */

const CP_LABELS = {
  cp1: 'Checkpoint 1 · Copy the pose',
  cp2a: 'Checkpoint 2 · Find the spot',
  cp2b: 'Checkpoint 2 · The riddle',
  cp3: 'Checkpoint 3 · Buy it, try it',
  cp4: 'Checkpoint 4 · Look around you',
  cp5: 'Checkpoint 5 · Team cheer',
};

function readHuntPhotos() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('treasure:')) continue;
    let run;
    try { run = JSON.parse(localStorage.getItem(key)); } catch { continue; }
    if (!run || !run.subs) continue;

    Object.entries(run.subs).forEach(([cp, sub]) => {
      if (!sub || !sub.photo) return;
      out.push({
        id: `hunt:${run.teamId}:${cp}`,
        kind: 'photo',
        src: sub.photo,
        name: `${run.teamName || run.teamId} — ${CP_LABELS[cp] || cp}`,
        size: Math.round((sub.photo.length * 3) / 4), // approx bytes behind the base64
        at: sub.at || 0,
        source: 'hunt',
        team: run.teamName || run.teamId,
        checkpoint: CP_LABELS[cp] || cp,
        readOnly: true,
      });
    });
  }
  return out;
}

/* ── Public API ──────────────────────────────────── */

export const galleryStore = {
  /** All media, newest first. Merges uploads with treasure hunt photos. */
  async list() {
    let uploads = [];
    try {
      const db = await openDb();
      const rows = await tx(db, 'readonly', (s) => s.getAll());
      uploads = rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        src: urlFor(r.id, r.blob),
        name: r.name,
        size: r.size,
        at: r.at,
        source: 'upload',
      }));
      db.close();
    } catch {
      /* IndexedDB unavailable (private mode, quota) — hunt photos still show */
    }
    return [...uploads, ...readHuntPhotos()].sort((a, b) => b.at - a.at);
  },

  /** Store File objects. Returns how many were accepted. */
  async add(files, { now = Date.now() } = {}) {
    const accepted = Array.from(files).filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    if (accepted.length === 0) return 0;

    const db = await openDb();
    let i = 0;
    for (const file of accepted) {
      await tx(db, 'readwrite', (s) =>
        s.put({
          // `now + i` keeps a multi-file drop in the order it was picked
          id: `up:${now + i}:${Math.round(Math.random() * 1e9).toString(36)}`,
          kind: file.type.startsWith('video/') ? 'video' : 'photo',
          name: file.name,
          size: file.size,
          at: now + i,
          blob: file,
        })
      );
      i++;
    }
    db.close();
    return accepted.length;
  },

  async remove(id) {
    const url = urlCache.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      urlCache.delete(id);
    }
    const db = await openDb();
    await tx(db, 'readwrite', (s) => s.delete(id));
    db.close();
  },

  /** Revoke every object URL. Call on unmount. */
  dispose() {
    urlCache.forEach((url) => URL.revokeObjectURL(url));
    urlCache.clear();
  },
};

/* ── SUPABASE NOTES ──────────────────────────────────
   To move this online, keep the method signatures and replace the
   bodies:

     list()   → select id, kind, name, size, created_at, storage_path
                from `gallery_media` ordered by created_at desc, then
                map storage_path through
                supabase.storage.from('gallery').getPublicUrl(path).
                Keep the readHuntPhotos() merge — hunt photos stay local
                until the hunt itself writes to Supabase.

     add()    → supabase.storage.from('gallery').upload(path, file) for
                each file, then insert the matching `gallery_media` rows.

     remove() → storage.remove([path]) plus a delete on the row. Note
                items with readOnly: true must stay undeletable.

     dispose() → becomes a no-op; public URLs need no revoking.

   The UI already treats list()/add()/remove() as async and re-lists
   after each mutation, so nothing there changes.
*/
