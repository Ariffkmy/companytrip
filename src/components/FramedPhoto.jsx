import { useEffect, useRef, useState } from 'react';

/* How the committee framed a bingo photo: zoomed in by `zoom` around the
   point (x%, y%) of the picture, which sits at the same x%, y% of the
   tile. Because the point stays inside the tile and the zoom is never
   below 1, the picture always fills the tile — at any tile size, so the
   small grid tile and the full-size view show the same crop. */
export const ZOOM_MAX = 5;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function normFrame(frame) {
  const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    zoom: clamp(n(frame?.zoom, 1), 1, ZOOM_MAX),
    x: clamp(n(frame?.x, 50), 0, 100),
    y: clamp(n(frame?.y, 50), 0, 100),
  };
}

export function framedImgStyle(frame) {
  const f = normFrame(frame);
  return {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'cover',
    objectPosition: `${f.x}% ${f.y}%`,
    transformOrigin: `${f.x}% ${f.y}%`,
    transform: f.zoom === 1 ? undefined : `scale(${f.zoom})`,
    userSelect: 'none', pointerEvents: 'none',
  };
}

/* ── Same photo, different upload ────────────────────
   The committee uploads the same picture to each group's card, and each
   upload gets its own URL, so "the same photo" is decided by what it
   looks like: a 256-bit difference hash of a tiny greyscale copy, which
   survives re-encoding but tells two different spots apart. Null when
   the picture can't be read (offline, or no CORS), and then only the
   exact URL counts as a match. */
const prints = new Map();
function photoPrint(src) {
  if (!prints.has(src)) {
    prints.set(src, new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          /* Down in two steps: one jump from 1600px to 17px samples a
             handful of pixels and turns JPEG noise into flipped bits. */
          const mid = document.createElement('canvas');
          mid.width = 128; mid.height = 128;
          const m = mid.getContext('2d');
          m.imageSmoothingQuality = 'high';
          m.drawImage(img, 0, 0, 128, 128);
          const W = 17, H = 16;
          const c = document.createElement('canvas');
          c.width = W; c.height = H;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(mid, 0, 0, W, H);
          const d = ctx.getImageData(0, 0, W, H).data;
          const lum = (x, y) => { const i = (y * W + x) * 4; return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; };
          const bits = [];
          for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) bits.push(lum(x, y) > lum(x + 1, y));
          resolve({ bits, ratio: img.naturalWidth / img.naturalHeight });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    }));
  }
  return prints.get(src);
}

/* Which of `urls` are the same picture as `src` (src itself included). */
export async function samePhotos(src, urls) {
  const mine = await photoPrint(src);
  const out = [];
  for (const url of new Set(urls)) {
    if (url === src) { out.push(url); continue; }
    if (!mine) continue;
    const theirs = await photoPrint(url);
    if (!theirs || Math.abs(theirs.ratio - mine.ratio) > 0.02) continue;
    let diff = 0;
    for (let i = 0; i < mine.bits.length; i++) if (mine.bits[i] !== theirs.bits[i]) diff++;
    if (diff <= 12) out.push(url);
  }
  return out;
}

/* The admin's framing tool: drag to move, scroll or pinch to zoom. */
export function FrameEditor({ src, frame, onChange }) {
  const box = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const f = normFrame(frame);
  const latest = useRef(f);
  latest.current = f;

  const set = (next) => {
    latest.current = normFrame({ ...latest.current, ...next });
    onChange(latest.current);
  };

  /* Moving the picture right by one tile-width at zoom z moves the
     focus point left by about 100/z percent. */
  const pan = (dx, dy) => {
    const r = box.current.getBoundingClientRect();
    const { zoom, x, y } = latest.current;
    set({ x: x - (dx / r.width) * 100 / zoom, y: y - (dy / r.height) * 100 / zoom });
  };

  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = null;
  };
  const move = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinch.current) set({ zoom: latest.current.zoom * (d / pinch.current) });
      pinch.current = d;
    } else {
      pan(now.x - prev.x, now.y - prev.y);
    }
  };
  const up = (e) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
  };

  /* Wheel listeners added through React are passive, so preventDefault
     would not stop the page scrolling. */
  useEffect(() => {
    const el = box.current;
    const wheel = (e) => {
      e.preventDefault();
      set({ zoom: latest.current.zoom * Math.exp(-e.deltaY * 0.0015) });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  const nudge = (dx, dy) => set({ x: f.x + dx / f.zoom, y: f.y + dy / f.zoom });
  const btn = 'h-9 min-w-9 px-2 rounded-md border border-gray-200 bg-white text-sm font-medium text-ink cursor-pointer';

  return (
    <div>
      <div
        ref={box}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="relative aspect-square w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-900 cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        <img src={src} alt="" draggable={false} style={framedImgStyle(f)} />
      </div>
      <p className="note mt-1">Drag to move. Scroll or pinch to zoom. Players see exactly this square.</p>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" className={btn} aria-label="Zoom out" onClick={() => set({ zoom: f.zoom / 1.2 })}>−</button>
        <input type="range" min={1} max={ZOOM_MAX} step={0.01} value={f.zoom} aria-label="Zoom"
          onChange={(e) => set({ zoom: Number(e.target.value) })} className="flex-1 min-w-0" />
        <button type="button" className={btn} aria-label="Zoom in" onClick={() => set({ zoom: f.zoom * 1.2 })}>+</button>
        <span className="font-mono text-xs text-gray-500 w-10 text-right">{f.zoom.toFixed(1)}×</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button type="button" className={btn} aria-label="Move left" onClick={() => nudge(5, 0)}>←</button>
        <button type="button" className={btn} aria-label="Move right" onClick={() => nudge(-5, 0)}>→</button>
        <button type="button" className={btn} aria-label="Move up" onClick={() => nudge(0, 5)}>↑</button>
        <button type="button" className={btn} aria-label="Move down" onClick={() => nudge(0, -5)}>↓</button>
        <button type="button" className={`${btn} ml-auto`} onClick={() => { latest.current = normFrame(null); onChange(null); }}>Reset</button>
      </div>
    </div>
  );
}

/* A dialog around FrameEditor that edits a copy, so Cancel leaves the
   tile as it was. */
export function FrameDialog({ src, frame, onDone, onCancel, title, note }) {
  const [draft, setDraft] = useState(frame ?? null);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onCancel]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-full overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
        <p className="font-display text-lg tracking-wide text-ink">{title}</p>
        {note && <p className="note mb-3">{note}</p>}
        {!note && <div className="mb-3" />}
        <FrameEditor src={src} frame={draft} onChange={setDraft} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-10 px-4 rounded-lg border-2 border-ink bg-white text-ink font-display tracking-wide cursor-pointer">Cancel</button>
          <button type="button" onClick={() => onDone(draft)} className="h-10 px-4 rounded-lg bg-red text-paper font-display tracking-wide cursor-pointer">Done</button>
        </div>
      </div>
    </div>
  );
}
