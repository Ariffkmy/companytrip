import { useEffect, useRef, useState } from 'react';
import { formatUploaded, listPhotos } from '../lib/album';

const COUNT = 12;
const INTERVAL = 5000;
const IDLE_AFTER_TOUCH = 8000;

/* Latest album photos as a swipeable slideshow. Native scroll-snap does
   the swiping; the timer only nudges it forward, and stops for anyone
   who asked the OS for less motion. */
export default function PhotoCarousel() {
  const [photos, setPhotos] = useState(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const track = useRef(null);
  const touchedAt = useRef(0);
  const indexRef = useRef(0);

  useEffect(() => {
    let live = true;
    listPhotos({ limit: COUNT })
      .then((rows) => { if (live) setPhotos(rows.filter((r) => r.src)); })
      .catch(() => { if (live) { setPhotos([]); setFailed(true); } });
    return () => { live = false; };
  }, []);

  const goTo = (i) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!photos || photos.length < 2) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = setInterval(() => {
      if (document.hidden || Date.now() - touchedAt.current < IDLE_AFTER_TOUCH) return;
      goTo((indexRef.current + 1) % photos.length);
    }, INTERVAL);
    return () => clearInterval(id);
  }, [photos]);

  const onScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    indexRef.current = i;
    setIndex(i);
  };

  const heading = (
    <h2 id="photos-h" className="font-mono text-[10px] tracking-[.18em] uppercase text-gray-400 mb-2.5">Latest photos</h2>
  );

  if (photos === null) {
    return (
      <section className="mt-9" aria-labelledby="photos-h">
        {heading}
        <div className="aspect-[4/3] rounded-lg bg-gray-100 border border-gray-200" />
      </section>
    );
  }

  if (!photos.length) {
    return (
      <section className="mt-9" aria-labelledby="photos-h">
        {heading}
        <div className="w-full rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center">
          <span className="block font-display text-lg tracking-wide">
            {!failed ? 'No photos yet' : navigator.onLine === false ? 'Photos need a connection' : 'Photos didn’t load'}
          </span>
          <span className="block text-sm text-gray-500 mt-1">
            {!failed ? 'Photos will show here once added.' : navigator.onLine === false ? 'They’ll show here when you’re back online.' : 'Try again later.'}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-9" aria-labelledby="photos-h" aria-roledescription="carousel">
      {heading}
      <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-black">
        <ul
          ref={track}
          onScroll={onScroll}
          onPointerDown={() => { touchedAt.current = Date.now(); }}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
        >
          {photos.map((p, i) => (
            <li key={p.id} className="relative w-full shrink-0 snap-center aspect-[4/3]"
              aria-roledescription="slide" aria-label={`${i + 1} of ${photos.length}`}>
              <img src={p.src} alt={`Photo by ${p.uploader_name}`} loading={i < 2 ? 'eager' : 'lazy'}
                className="w-full h-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 px-3.5 pt-10 pb-3 text-left bg-gradient-to-t from-black/75 to-transparent">
                <span className="block text-sm font-medium text-onscrim leading-snug truncate">{p.uploader_name}</span>
                <span className="block font-mono text-[10px] text-onscrim/80">{formatUploaded(p.created_at)}</span>
              </span>
            </li>
          ))}
        </ul>
        {photos.length > 1 && (
          <div className="absolute top-2.5 right-2.5 flex gap-1" aria-hidden="true">
            {photos.map((p, i) => (
              <span key={p.id} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-onscrim' : 'w-1.5 bg-onscrim/50'}`} />
            ))}
          </div>
        )}
      </div>
      {photos.length > 1 && (
        <div className="flex justify-between mt-1.5">
          <button type="button" onClick={() => { touchedAt.current = Date.now(); goTo(Math.max(0, index - 1)); }}
            disabled={index === 0} className="h-8 px-2 text-xs text-gray-500 cursor-pointer disabled:opacity-30">‹ Prev</button>
          <button type="button" onClick={() => { touchedAt.current = Date.now(); goTo(Math.min(photos.length - 1, index + 1)); }}
            disabled={index === photos.length - 1} className="h-8 px-2 text-xs text-gray-500 cursor-pointer disabled:opacity-30">Next ›</button>
        </div>
      )}
    </section>
  );
}
