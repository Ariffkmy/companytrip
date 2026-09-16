import { useCallback, useEffect, useRef, useState } from 'react';
import { PAGE_SIZE, cachedPhotos, deletePhoto, formatUploaded, listPhotos, updateCachedPhotos, uploadPhoto } from '../lib/album';
import schedule from '../data/schedule';

/* D0–D5 only: the days people are actually out taking photos. */
const DAY_TABS = [
  { id: 'all', label: 'All' },
  ...schedule.slice(0, 6).map((d) => ({ id: d.day, label: d.day, date: d.date })),
];

function dateKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* Defaults to today's leg of the trip, so whoever opens the album on
   Day 3 lands straight on Day 3's photos instead of "All". */
function todaysTab() {
  const today = dateKey(new Date());
  return DAY_TABS.find((t) => t.date === today)?.id ?? 'all';
}

function friendly(err) {
  const msg = err?.message ?? '';
  if (/fetch|network/i.test(msg)) return 'No connection. Photos need internet to upload and load.';
  if (/not an image/i.test(msg)) return 'One of those files isn’t a photo this phone can read (try JPG or PNG).';
  if (/row-level|not allowed|permission/i.test(msg)) return 'You can only delete photos you uploaded.';
  if (/exceeded|too large|payload/i.test(msg)) return 'That photo is too large.';
  return 'Something went wrong. Try again.';
}

/* ── Lightbox ─────────────────────────────────────── */
function Lightbox({ photos, index, onIndex, onClose, canDelete, onDelete }) {
  const photo = photos[index];
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => { setConfirming(false); }, [index]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < photos.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [index, photos.length, onClose, onIndex]);

  if (!photo) return null;

  const navBtn = 'absolute top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center rounded-full bg-black/45 text-onscrim text-xl cursor-pointer disabled:opacity-0';

  return (
    <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-[80] bg-black/95 flex flex-col">
      <div className="flex items-center gap-3 px-4 h-14 shrink-0 text-onscrim">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{photo.uploader_name}</p>
          <p className="font-mono text-[11px] opacity-70">{formatUploaded(photo.created_at)}</p>
        </div>
        <span className="font-mono text-[11px] opacity-60 tick">{index + 1}/{photos.length}</span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
          className="w-10 h-10 grid place-items-center rounded-full text-2xl leading-none cursor-pointer hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-onscrim">×</button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2">
        {photo.src
          ? <img src={photo.src} crossOrigin="anonymous" alt={`Photo by ${photo.uploader_name}`} className="max-w-full max-h-full object-contain" />
          : <p className="text-onscrim text-sm opacity-70">This photo couldn’t load.</p>}
        <button type="button" className={`${navBtn} left-2`} onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label="Previous photo">‹</button>
        <button type="button" className={`${navBtn} right-2`} onClick={() => onIndex(index + 1)} disabled={index === photos.length - 1} aria-label="Next photo">›</button>
      </div>

      {canDelete(photo) && (
        <div className="shrink-0 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex justify-end">
          <button type="button" disabled={busy}
            onClick={async () => {
              if (!confirming) { setConfirming(true); return; }
              setBusy(true);
              await onDelete(photo);
              setBusy(false);
            }}
            className={`h-10 px-4 rounded-lg text-sm font-medium cursor-pointer ${confirming ? 'bg-red text-paper' : 'text-onscrim/80 border border-white/30 hover:border-white/60'}`}>
            {busy ? 'Deleting…' : confirming ? 'Tap again to delete' : 'Delete photo'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Album page ───────────────────────────────────── */
export default function Album({ userId, isAdmin }) {
  /* Last copy on this phone first; load() swaps in the fresh list. */
  const [photos, setPhotos] = useState(cachedPhotos);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [upload, setUpload] = useState(null); // { done, total, failed }
  const [open, setOpen] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dayFilter, setDayFilter] = useState(todaysTab);

  const load = useCallback(async () => {
    try {
      const rows = await listPhotos();
      setPhotos(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setError('');
      setLoadFailed(false);
    } catch (e) {
      /* With a device copy on screen, stay quiet — it is still useful offline. */
      const cached = cachedPhotos();
      setPhotos((p) => p ?? cached ?? []);
      setLoadFailed(true);
      if (!cached?.length) setError(friendly(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadMore() {
    if (!photos?.length) return;
    setLoadingMore(true);
    try {
      const rows = await listPhotos({ before: photos[photos.length - 1].created_at });
      setPhotos((p) => [...p, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setLoadingMore(false);
    }
  }

  async function onFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/') || f.name.match(/\.(heic|heif)$/i));
    if (!files.length) return;
    setError('');
    let failed = 0;
    let lastErr = null;
    setUpload({ done: 0, total: files.length, failed: 0 });
    /* One at a time: parallel uploads on a weak signal all time out together. */
    for (let i = 0; i < files.length; i++) {
      try {
        const row = await uploadPhoto(files[i], userId);
        setPhotos((p) => [row, ...(p ?? [])]);
        updateCachedPhotos((rows) => [row, ...rows]);
      } catch (e) {
        failed++;
        lastErr = e;
      }
      setUpload({ done: i + 1, total: files.length, failed });
    }
    setUpload(null);
    if (failed) setError(`${failed} of ${files.length} didn’t upload. ${friendly(lastErr)}`);
  }

  const canDelete = (p) => isAdmin || p.uploader_id === userId;

  async function onDelete(photo) {
    try {
      await deletePhoto(photo);
      const next = photos.filter((x) => x.id !== photo.id);
      updateCachedPhotos((rows) => rows.filter((x) => x.id !== photo.id));
      setPhotos(next);
      setOpen(next.length ? Math.min(open, next.length - 1) : null);
    } catch (e) {
      setError(friendly(e));
      setOpen(null);
    }
  }

  const uploading = Boolean(upload);
  const activeTab = DAY_TABS.find((t) => t.id === dayFilter);
  const filteredPhotos = !photos ? photos
    : dayFilter === 'all' ? photos
    : photos.filter((p) => dateKey(p.created_at) === activeTab.date);

  return (
    <section>
      <div className="pt-9 pb-6">
        <p className="font-mono text-[10px] tracking-[.28em] uppercase text-gray-400">Shared by everyone</p>
        <h1 className="display text-3xl sm:text-4xl mt-2.5 leading-[1.05]">
          Digital <span className="text-red">album</span>
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed mt-2.5 max-w-[46ch]">
          Every photo shows who added it and when. Only trip members can see them.
        </p>
      </div>

      <label className={`flex items-center justify-center gap-2 w-full h-13 rounded-lg font-display text-lg tracking-wide transition-transform duration-100 ${
        uploading ? 'bg-gray-200 text-gray-600 cursor-wait' : 'bg-red text-paper cursor-pointer active:translate-y-px'
      } focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink`}>
        {uploading
          ? `Uploading ${Math.min(upload.done + 1, upload.total)} of ${upload.total}…`
          : '+ Add photos'}
        <input type="file" accept="image/*" multiple className="sr-only" disabled={uploading}
          onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      </label>
      {uploading && (
        <div className="h-1 mt-2 rounded-full bg-gray-200 overflow-hidden" aria-hidden="true">
          <div className="h-full bg-red transition-[width] duration-300" style={{ width: `${(upload.done / upload.total) * 100}%` }} />
        </div>
      )}
      <p className="note mt-2">Photos are resized before upload to save data. Keep the app open until it finishes.</p>

      {error && <p role="alert" className="text-sm text-red mt-4">{error}</p>}

      {photos === null ? (
        <p className="note mt-8">Loading photos…</p>
      ) : photos.length === 0 && loadFailed ? (
        <button type="button" onClick={() => { setPhotos(null); load(); }}
          className="mt-8 w-full h-11 rounded-lg border border-gray-200 bg-white text-sm font-medium cursor-pointer">
          Try loading photos again
        </button>
      ) : photos.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center">
          <p className="font-display text-lg tracking-wide">No photos yet</p>
          <p className="text-sm text-gray-500 mt-1">Be the first — they’ll show on everyone’s Home screen too.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 mt-7">
            {DAY_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDayFilter(t.id)}
                className={`flex-none px-3.5 py-2 rounded-lg font-display text-sm tracking-wide transition-colors ${
                  t.id === dayFilter
                    ? 'bg-ink dark:bg-flame text-white'
                    : 'bg-white text-gray-500 border border-gray-200 active:border-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {filteredPhotos.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center">
              <p className="font-display text-lg tracking-wide">No photos for {activeTab.label} yet</p>
              <p className="text-sm text-gray-500 mt-1">They’ll show up here once someone adds one.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
              {filteredPhotos.map((p) => (
                <li key={p.id} className="min-w-0">
                  <button type="button" onClick={() => setOpen(photos.indexOf(p))}
                    className="block w-full text-left cursor-pointer rounded-lg overflow-hidden bg-white border border-gray-200 focus-visible:outline-2 focus-visible:outline-red">
                    <span className="block aspect-square bg-gray-100">
                      {p.thumb && <img src={p.thumb} crossOrigin="anonymous" alt={`Photo by ${p.uploader_name}`} loading="lazy" className="w-full h-full object-cover" />}
                    </span>
                    <span className="block px-2.5 py-2">
                      <span className="block text-[13px] font-medium leading-snug truncate">{p.uploader_name}</span>
                      <span className="block font-mono text-[10px] text-gray-400 truncate">{formatUploaded(p.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasMore && (
            <button type="button" onClick={loadMore} disabled={loadingMore}
              className="mt-5 w-full h-11 rounded-lg border border-gray-200 bg-white text-sm font-medium cursor-pointer disabled:cursor-wait">
              {loadingMore ? 'Loading…' : 'Load more photos'}
            </button>
          )}
        </>
      )}

      {open !== null && photos?.[open] && (
        <Lightbox
          photos={photos}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          canDelete={canDelete}
          onDelete={onDelete}
        />
      )}
    </section>
  );
}
