import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatUploaded } from '../lib/album';

/* ── Stories ─────────────────────────────────────────
   Instagram-style stories: full screen, one item after another. `items`
   is everyone's stories in play order, grouped by person; the bars show
   the current person's, and the end of one person runs on into the
   next. Tap the right two thirds for next, the left third for back,
   press and hold to pause, swipe down to close. Photos show for
   PHOTO_MS; videos play to the end.

   The progress fill is moved by requestAnimationFrame straight on the
   DOM, so a story playing doesn't re-render React sixty times a second.
   One <video> element is reused for every video: once a tap has let it
   play with sound, iOS lets it keep doing so as the source changes. */

const PHOTO_MS = 5000;
const HOLD_MS = 200; // longer than this is a hold, not a tap
const SWIPE_CLOSE_PX = 80;

export default function StoriesViewer({ items, startIndex = 0, onSeen, onClose, canDelete = () => false, onDelete }) {
  const [index, setIndex] = useState(startIndex);
  const [nonce, setNonce] = useState(0); // bumps to restart the current item
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [held, setHeld] = useState(false); // finger down
  const [holding, setHolding] = useState(false); // down long enough to hide the chrome
  const [kbPaused, setKbPaused] = useState(false); // space bar
  const [hidden, setHidden] = useState(document.hidden);
  const [muted, setMuted] = useState(false);
  const [confirming, setConfirming] = useState(false); // delete asked once
  const [deleting, setDeleting] = useState(false);

  const videoRef = useRef(null);
  const fillRef = useRef(null);
  const elapsed = useRef(0);
  const press = useRef(null);
  const closeRef = useRef(null);

  const item = items[index];
  const isVideo = item?.kind === 'video';
  const paused = held || kbPaused || hidden || confirming || deleting;

  /* The current person's run of stories, for the bars and the count. */
  let first = index;
  let last = index;
  while (first > 0 && items[first - 1].uploader_id === item?.uploader_id) first--;
  while (last < items.length - 1 && items[last + 1].uploader_id === item?.uploader_id) last++;

  const go = useCallback((i) => {
    if (i >= items.length) { onClose(); return; }
    elapsed.current = 0;
    if (i < 0) {
      /* Back on the first item: play it again from the top. */
      if (isVideo && videoRef.current) videoRef.current.currentTime = 0;
      setNonce((n) => n + 1);
      return;
    }
    setReady(false);
    setFailed(false);
    setIndex(i);
  }, [items.length, isVideo, onClose]);

  useEffect(() => { if (item) onSeen(item.id); }, [item, onSeen]);
  useEffect(() => { setConfirming(false); }, [item]);

  async function removeCurrent() {
    if (!confirming) { setConfirming(true); return; }
    setDeleting(true);
    try {
      await onDelete(item);
      /* The list closes up behind it: the same index is now the next story. */
      if (index >= items.length - 1) { onClose(); return; }
      elapsed.current = 0;
      setReady(false);
      setFailed(false);
      setNonce((n) => n + 1);
    } catch {
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  }

  /* Fresh item: its bar starts empty. */
  useLayoutEffect(() => {
    if (fillRef.current) fillRef.current.style.transform = 'scaleX(0)';
  }, [index, nonce]);

  /* Point the one video element at this item, or stop it downloading. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isVideo && item.src) {
      if (v.getAttribute('src') !== item.src) v.src = item.src;
    } else if (v.getAttribute('src')) {
      v.pause();
      v.removeAttribute('src');
      v.load();
    }
  }, [item, isVideo]);

  /* Play or pause the video with the story. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isVideo || failed) return;
    if (paused) { v.pause(); return; }
    v.play().catch((err) => {
      /* No sound without a fresh tap on some phones: play muted instead. */
      if (err?.name === 'NotAllowedError' && !v.muted) {
        v.muted = true;
        setMuted(true);
        v.play().catch(() => {});
      }
    });
  }, [isVideo, paused, failed, index, nonce]);

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  /* The clock: photos (and videos that failed to load) count PHOTO_MS;
     a video's bar follows its own playback, so buffering holds it. */
  useEffect(() => {
    if (paused || !ready) return undefined;
    const timed = !isVideo || failed;
    let last = performance.now();
    let raf;
    const tick = (now) => {
      let p;
      if (timed) {
        elapsed.current += now - last;
        last = now;
        p = elapsed.current / PHOTO_MS;
        if (p >= 1) { go(index + 1); return; }
      } else {
        const v = videoRef.current;
        p = v && Number.isFinite(v.duration) && v.duration > 0 ? v.currentTime / v.duration : 0;
      }
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${Math.min(1, p)})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, ready, isVideo, failed, index, nonce, go]);

  /* Get the next photo (or video poster) moving before it is needed. */
  useEffect(() => {
    const next = items[index + 1];
    const url = next && (next.kind === 'video' ? next.thumb : next.src);
    if (url) { const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; }
  }, [items, index]);

  /* Pause when the phone locks or the app goes to the background. */
  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
      if (e.key === ' ') { e.preventDefault(); setKbPaused((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, onClose]);

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function onPointerDown(e) {
    if (e.button > 0) return;
    const timer = setTimeout(() => setHolding(true), HOLD_MS);
    press.current = { x: e.clientX, y: e.clientY, t: performance.now(), timer };
    setHeld(true);
  }

  function onPointerUp(e) {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    setHolding(false);
    setHeld(false);
    if (e.type === 'pointercancel') return;
    if (e.clientY - p.y > SWIPE_CLOSE_PX) { onClose(); return; }
    if (performance.now() - p.t > HOLD_MS) return; // it was a pause, not a tap
    const box = e.currentTarget.getBoundingClientRect();
    go(e.clientX - box.left < box.width / 3 ? index - 1 : index + 1);
  }

  if (!item) return null;
  const chrome = `transition-opacity duration-200 ${holding ? 'opacity-0' : 'opacity-100'}`;

  return (
    <div role="dialog" aria-modal="true" aria-label="Album stories" className="fixed inset-0 z-[80] bg-black flex justify-center">
      <div className="relative h-full w-full max-w-[calc(100dvh*9/16)] overflow-hidden select-none [-webkit-touch-callout:none]">
        {/* Media */}
        <div className="absolute inset-0 flex items-center justify-center">
          {!isVideo && item.src && !failed && (
            <img key={item.id} src={item.src} crossOrigin="anonymous" alt={`Photo by ${item.uploader_name}`}
              onLoad={() => setReady(true)} onError={() => { setFailed(true); setReady(true); }}
              draggable={false} className="max-w-full max-h-full object-contain" />
          )}
          <video ref={videoRef} playsInline preload="auto" poster={isVideo ? item.thumb ?? undefined : undefined}
            aria-label={isVideo ? `Video by ${item.uploader_name}` : undefined}
            onLoadedData={() => setReady(true)}
            onEnded={() => go(index + 1)}
            onError={() => { if (isVideo) { setFailed(true); setReady(true); } }}
            className={`max-w-full max-h-full ${isVideo && !failed ? '' : 'hidden'}`} />
          {(failed || !item.src) && (
            <p className="text-onscrim text-sm opacity-70">This {isVideo ? 'video' : 'photo'} couldn’t load.</p>
          )}
          {!ready && !failed && item.src && (
            <span aria-hidden="true" className="absolute w-8 h-8 rounded-full border-2 border-white/25 border-t-white/80 animate-spin" />
          )}
        </div>

        {/* Taps, holds and swipes land here, under the header buttons. */}
        <div className="absolute inset-0 touch-none"
          onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()} />

        {/* Top: progress bars and who posted it */}
        <div className={`absolute inset-x-0 top-0 px-2.5 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-10 bg-gradient-to-b from-black/60 to-transparent pointer-events-none ${chrome}`}>
          <div className="flex gap-[3px]" aria-hidden="true">
            {items.slice(first, last + 1).map((it, k) => (
              <span key={it.id} className="h-[2.5px] flex-1 min-w-0 rounded-full bg-white/30 overflow-hidden">
                {first + k < index && <span className="block h-full w-full bg-white" />}
                {first + k === index && <span ref={fillRef} className="block h-full w-full bg-white origin-left" />}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2.5 text-onscrim">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{item.uploader_name}</p>
              <p className="font-mono text-[11px] opacity-70">{formatUploaded(item.created_at)}</p>
            </div>
            <span className="font-mono text-[11px] opacity-60 tick">{index - first + 1}/{last - first + 1}</span>
            {canDelete(item) && (
              <button type="button" onClick={removeCurrent} disabled={deleting}
                className={`pointer-events-auto h-8 px-3 rounded-lg text-xs font-medium cursor-pointer ${confirming ? 'bg-red text-paper' : 'text-onscrim/80 border border-white/30 hover:border-white/60'}`}>
                {deleting ? 'Deleting…' : confirming ? 'Tap again to delete' : 'Delete'}
              </button>
            )}
            {isVideo && (
              <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Turn sound on' : 'Mute'}
                className="pointer-events-auto w-10 h-10 grid place-items-center rounded-full text-lg cursor-pointer hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-onscrim">
                {muted ? '🔇' : '🔊'}
              </button>
            )}
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close stories"
              className="pointer-events-auto w-10 h-10 grid place-items-center rounded-full text-2xl leading-none cursor-pointer hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-onscrim">×</button>
          </div>
        </div>

        {kbPaused && (
          <p className="absolute inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] text-center font-mono text-[11px] tracking-[.18em] uppercase text-onscrim/70 pointer-events-none">
            Paused · space to play
          </p>
        )}
      </div>
    </div>
  );
}
