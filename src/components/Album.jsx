import { useCallback, useEffect, useRef, useState } from 'react';
import { isStorageFull } from '../lib/photos';
import { PAGE_SIZE, cachedPhotos, deletePhoto, fetchAlbumFile, formatUploaded, listPhotos, saveFile, updateCachedPhotos, uploadAlbumMedia } from '../lib/album';
import { formatDuration, isVideoFile, mediaErrorMessage } from '../lib/video';
import StoriesBar from './StoriesBar';
import schedule from '../data/schedule';

function dateKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* Trip day (D0, D1, …) for a date that falls inside the schedule;
   any other date — before D0 or after the trip — just gets its own
   plain-language date. */
const DAY_BY_DATE = Object.fromEntries(schedule.map((d) => [d.date, `${d.day} · ${d.label}`]));

function dayHeading(key) {
  if (DAY_BY_DATE[key]) return DAY_BY_DATE[key];
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/* Newest-first photos, already grouped by day when they load — so
   consecutive same-day photos just extend the current group. */
function groupByDay(photos) {
  const groups = [];
  for (const p of photos) {
    const key = dateKey(p.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.photos.push(p);
    else groups.push({ key, photos: [p] });
  }
  return groups;
}

function friendly(err) {
  const msg = err?.message ?? '';
  if (/fetch|network/i.test(msg)) return 'No connection. Photos need internet to upload and load.';
  if (/not an image/i.test(msg)) return 'One of those files isn’t a photo this phone can read (try JPG or PNG).';
  if (/row-level|not allowed|permission/i.test(msg)) return 'You can only delete photos you uploaded.';
  if (/exceeded|too large|payload/i.test(msg)) return 'That photo is too large.';
  return 'Something went wrong. Try again.';
}

/* What the round button says while it works. */
function uploadLabel(u) {
  const n = u.total > 1 ? ` (${Math.min(u.done + 1, u.total)} of ${u.total})` : '';
  if (u.step?.stage === 'shrink') return `Shrinking video ${Math.round(u.step.progress * 100)}%${n}`;
  if (u.step?.stage === 'upload') return `Uploading video…${n}`;
  return `Uploading${n}…`;
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
        {!photo.src
          ? <p className="text-onscrim text-sm opacity-70">This {photo.kind === 'video' ? 'video' : 'photo'} couldn’t load.</p>
          : photo.kind === 'video'
            /* key: a new element per video, so swiping never plays the last one's sound. */
            ? <video key={photo.id} src={photo.src} poster={photo.thumb ?? undefined} controls autoPlay playsInline preload="metadata"
                aria-label={`Video by ${photo.uploader_name}`} className="max-w-full max-h-full" />
            : <img src={photo.src} crossOrigin="anonymous" alt={`Photo by ${photo.uploader_name}`} className="max-w-full max-h-full object-contain" />}
        <button type="button" className={`${navBtn} left-2`} onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label="Previous photo">‹</button>
        <button type="button" className={`${navBtn} right-2`} onClick={() => onIndex(index + 1)} disabled={index === photos.length - 1} aria-label="Next photo">›</button>
      </div>

      <div className="shrink-0 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center justify-between gap-3">
        <SaveButton key={photo.id} photo={photo} />
        {canDelete(photo) && (
          <button type="button" disabled={busy}
            onClick={async () => {
              if (!confirming) { setConfirming(true); return; }
              setBusy(true);
              await onDelete(photo);
              setBusy(false);
            }}
            className={`h-10 px-4 rounded-lg text-sm font-medium cursor-pointer ${confirming ? 'bg-red text-paper' : 'text-onscrim/80 border border-white/30 hover:border-white/60'}`}>
            {busy ? 'Deleting…' : confirming ? 'Tap again to delete' : photo.kind === 'video' ? 'Delete video' : 'Delete photo'}
          </button>
        )}
      </div>
    </div>
  );
}

/* Anyone can save any photo or video to their phone. The file is fetched
   first; a long video can outlast the tap, and the share sheet then
   refuses to open — so the button turns into "Tap to save" for a second
   tap with the file already in hand. */
function SaveButton({ photo }) {
  const [state, setState] = useState(null); // null | 'loading' | { file } | 'error'
  const what = photo.kind === 'video' ? 'video' : 'photo';

  async function save(file) {
    try {
      await saveFile(file);
      setState(null);
    } catch (e) {
      if (e?.name === 'NotAllowedError') setState({ file });
      else setState('error');
    }
  }

  async function onClick() {
    if (state?.file) { save(state.file); return; }
    setState('loading');
    try {
      save(await fetchAlbumFile(photo));
    } catch {
      setState('error');
    }
  }

  return (
    <button type="button" onClick={onClick} disabled={state === 'loading'}
      className="h-10 px-4 rounded-lg text-sm font-medium cursor-pointer text-onscrim border border-white/30 hover:border-white/60 disabled:cursor-wait disabled:opacity-60">
      {state === 'loading' ? `Getting ${what}…`
        : state?.file ? 'Tap to save'
        : state === 'error' ? 'Couldn’t save — try again'
        : `⬇ Save ${what}`}
    </button>
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
    const files = [...fileList].filter((f) => f.type.startsWith('image/') || f.name.match(/\.(heic|heif)$/i) || isVideoFile(f));
    if (!files.length) return;
    setError('');
    let failed = 0;
    let lastErr = null;
    setUpload({ done: 0, total: files.length, failed: 0 });
    /* One at a time: parallel uploads on a weak signal all time out together. */
    for (let i = 0; i < files.length; i++) {
      try {
        const row = await uploadAlbumMedia(files[i], userId, (step) => setUpload((u) => u && { ...u, step }));
        setPhotos((p) => [row, ...(p ?? [])]);
        updateCachedPhotos((rows) => [row, ...rows]);
      } catch (e) {
        failed++;
        lastErr = e;
        /* Storage is full: the rest would fail the same way. */
        if (isStorageFull(e)) { failed += files.length - i - 1; break; }
      }
      setUpload({ done: i + 1, total: files.length, failed });
    }
    setUpload(null);
    if (failed) setError(`${failed} of ${files.length} didn’t upload. ${mediaErrorMessage(lastErr)}`);
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
  const groups = photos ? groupByDay(photos) : [];

  return (
    <section className="pt-9">
      {/* Stories are separate from the album: their own uploads, their own viewer. */}
      <StoriesBar userId={userId} isAdmin={isAdmin} />

      <h2 className="font-mono text-[13px] font-bold tracking-[.14em] uppercase text-gray-700">Album</h2>
      {error && <p role="alert" className="text-sm text-red mt-2">{error}</p>}

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
          <div className="mt-2.5 space-y-6">
            {groups.map((g) => (
              <div key={g.key}>
                <p className="text-center font-mono text-[10px] tracking-[.18em] uppercase text-gray-400 mb-2.5">
                  {dayHeading(g.key)}
                </p>
                <ul className="grid grid-cols-3 gap-0.5">
                  {g.photos.map((p) => (
                    <li key={p.id} className="aspect-square min-w-0">
                      <button type="button" onClick={() => setOpen(photos.indexOf(p))}
                        className="relative block w-full h-full cursor-pointer bg-gray-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red">
                        {p.thumb && <img src={p.thumb} crossOrigin="anonymous" alt={`${p.kind === 'video' ? 'Video' : 'Photo'} by ${p.uploader_name}`} loading="lazy" className="w-full h-full object-cover" />}
                        {p.kind === 'video' && (
                          <span className="absolute right-1 bottom-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-onscrim">
                            ▶ {formatDuration(p.duration)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
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

      <div className="fixed inset-x-0 z-40 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 pointer-events-none">
        <div className="max-w-[640px] mx-auto px-4 relative">
          {uploading && (
            <p role="status" className="absolute right-20 bottom-3.5 rounded-full bg-ink/85 px-3 py-1.5 text-xs text-paper shadow tick">
              {uploadLabel(upload)}
            </p>
          )}
          <label
            aria-label={uploading ? uploadLabel(upload) : 'Add photos or videos'}
            className={`absolute right-4 bottom-0 pointer-events-auto w-14 h-14 rounded-full shadow-lg grid place-items-center text-2xl leading-none transition-transform active:scale-95 ${
              uploading ? 'bg-gray-300 text-gray-600 cursor-wait' : 'bg-red text-paper cursor-pointer'
            } focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink`}
          >
            {uploading ? '…' : '+'}
            <input type="file" accept="image/*,video/*" multiple className="sr-only" disabled={uploading}
              onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
      </div>
    </section>
  );
}
