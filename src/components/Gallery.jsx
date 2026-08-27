import { useState, useEffect, useCallback, useRef } from 'react';
import { galleryStore } from '../lib/galleryStore';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'photo', label: 'Photos' },
  { id: 'video', label: 'Videos' },
  { id: 'hunt', label: 'Treasure Hunt' },
];

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/* ── Lightbox ──────────────────────────────────────── */
function Lightbox({ items, index, onClose, onNav, onDelete }) {
  const item = items[index];
  const touch = useRef(null);

  /* Horizontal swipe to move between items. Vertical drags are ignored so
     the gesture never fights a pinch-zoom or a scroll. */
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) onNav(dx < 0 ? 1 : -1);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNav(1);
      if (e.key === 'ArrowLeft') onNav(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, onNav]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-100 bg-black/95 backdrop-blur-sm flex flex-col touch-pan-y"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
    >
      {/* Top bar */}
      <div
        className="flex items-center gap-2 px-3 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] shrink-0 bg-black border-b border-onscrim/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate text-onscrim">{item.name}</p>
          <p className="text-[11px] font-mono text-onscrim/50">
            {fmtDate(item.at)}{item.size ? ` · ${fmtSize(item.size)}` : ''}
            {item.source === 'hunt' ? ' · from the hunt' : ''}
          </p>
        </div>
        <span className="text-[11px] font-mono text-onscrim/50 shrink-0">
          {index + 1} / {items.length}
        </span>
        {!item.readOnly && (
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="shrink-0 w-11 h-11 grid place-items-center rounded-md text-lg text-onscrim/70 border border-onscrim/20 active:border-red active:text-red transition-colors"
            aria-label="Delete"
          >
            🗑
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 w-11 h-11 grid place-items-center rounded-md text-onscrim/70 border border-onscrim/20 active:border-onscrim/50 active:text-onscrim transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Media */}
      <div className="flex-1 min-h-0 grid place-items-center px-4 pb-4">
        {item.kind === 'video' ? (
          <video
            src={item.src}
            controls
            playsInline
            autoPlay
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-lg"
          />
        ) : (
          <img
            src={item.src}
            alt={item.name}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        )}
      </div>

      {/* Prev / next */}
      {items.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous"
            onClick={(e) => { e.stopPropagation(); onNav(-1); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 hidden sm:grid place-items-center rounded-full bg-black/50 text-onscrim/80 border border-onscrim/20 active:bg-black/80 active:text-onscrim transition-colors"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={(e) => { e.stopPropagation(); onNav(1); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 hidden sm:grid place-items-center rounded-full bg-black/50 text-onscrim/80 border border-onscrim/20 active:bg-black/80 active:text-onscrim transition-colors"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

/* ── Tile ──────────────────────────────────────────── */
function Tile({ item, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200 cursor-pointer p-0 transition-all hover:border-gray-300 hover:shadow-sm active:scale-[.98]"
    >
      {item.kind === 'video' ? (
        <>
          <video src={item.src} muted playsInline preload="metadata" className="w-full h-full object-cover" />
          <span className="absolute inset-0 grid place-items-center bg-black/25 text-onscrim text-2xl">▶</span>
        </>
      ) : (
        <img src={item.src} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
      )}

      {item.source === 'hunt' && (
        <span className="absolute top-1.5 left-1.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-red text-white">
          HUNT
        </span>
      )}

      {/* Caption on hover / focus */}
      <span className="absolute inset-x-0 bottom-0 px-2 py-1.5 text-left bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
        <span className="block text-[10px] text-onscrim truncate">{item.name}</span>
      </span>
    </button>
  );
}

/* ── Gallery ───────────────────────────────────────── */
export default function Gallery() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null); // index into `filtered`
  const [toast, setToast] = useState(null);
  const inputRef = useRef(null);

  const refresh = useCallback(async () => {
    const next = await galleryStore.list();
    setItems(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    return () => galleryStore.dispose();
  }, [refresh]);

  const say = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const n = await galleryStore.add(files);
      await refresh();
      say(n > 0 ? `Added ${n} item${n > 1 ? 's' : ''}` : 'No images or videos in that selection');
    } catch {
      say('Could not save — storage may be full');
    }
    setBusy(false);
  }, [refresh, say]);

  const handleDelete = useCallback(async (item) => {
    setLightbox(null);
    await galleryStore.remove(item.id);
    await refresh();
    say('Deleted');
  }, [refresh, say]);

  const filtered = items.filter((it) => {
    if (filter === 'all') return true;
    if (filter === 'hunt') return it.source === 'hunt';
    return it.kind === filter;
  });

  const counts = {
    photo: items.filter((i) => i.kind === 'photo').length,
    video: items.filter((i) => i.kind === 'video').length,
  };

  return (
    <section>
      <div className="py-8 text-center">
        <p className="text-xs text-gray-400 font-mono tracking-widest uppercase">Gallery</p>
        <h1 className="display text-3xl sm:text-4xl mt-2">The <span className="text-red">Album</span></h1>
        <p className="text-sm text-gray-500 mt-2">
          {loading
            ? 'Loading…'
            : items.length === 0
              ? 'Nothing here yet — add the first photo.'
              : `${counts.photo} photo${counts.photo === 1 ? '' : 's'} · ${counts.video} video${counts.video === 1 ? '' : 's'}`}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Filters — one scrollable row, so they never eat two lines on a phone */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            type="button"
            className={`flex-none px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
              filter === f.id
                ? 'bg-ink dark:bg-flame text-white'
                : 'bg-white text-gray-500 border border-gray-200 active:border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-500">
            {items.length === 0
              ? 'Photos you add will show up here.'
              : 'Nothing matches this filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {filtered.map((item, i) => (
            <Tile key={item.id} item={item} onOpen={() => setLightbox(i)} />
          ))}
        </div>
      )}

      {/* Clears the floating button so it never covers the last row */}
      <p className="note text-center mt-5 pb-24">
        Saved on this device only for now — a shared album is coming.
      </p>

      {/* Floating upload button */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Add photos or videos"
        className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 w-14 h-14 grid place-items-center rounded-full bg-ink dark:bg-flame text-white text-2xl shadow-lg transition-transform active:scale-90 disabled:opacity-60"
      >
        {busy ? (
          <span className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        ) : (
          '＋'
        )}
      </button>

      {lightbox !== null && (
        <Lightbox
          items={filtered}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onNav={(d) => setLightbox((n) => (n + d + filtered.length) % filtered.length)}
          onDelete={handleDelete}
        />
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-100 px-4 py-2.5 rounded-lg bg-ink dark:bg-flame text-white text-sm font-medium shadow-lg">
          {toast}
        </div>
      )}
    </section>
  );
}
