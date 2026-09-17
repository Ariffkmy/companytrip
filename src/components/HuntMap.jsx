import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CHECKPOINTS, HUNT_MAP_LINK, ROUTE, ROUTE_STATS, START } from '../data/huntRoute';

/* OpenStreetMap's own tiles: no key, fine for a couple of dozen phones.
   Dark mode is a CSS filter on the tile pane (see index.css). The
   service worker keeps tiles once seen, so the route area still draws
   on a weak signal. */
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/* Full-screen map of the hunt route. Opened over the game, so closing
   it drops the team back exactly where they were. */
export default function HuntMap({ onClose }) {
  const el = useRef(null);
  const map = useRef(null);
  const me = useRef(null);
  const watch = useRef(null);
  const closeRef = useRef(null);
  const [locating, setLocating] = useState('off'); // off | finding | on | denied | unavailable

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, attributionControl: true });
    map.current = m;
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    L.tileLayer(TILES, {
      /* CORS mode, so cached tiles aren't opaque (which bloats quota). */
      attribution: ATTRIBUTION, maxZoom: 19, crossOrigin: 'anonymous',
    }).addTo(m);

    L.polyline(ROUTE, { className: 'hunt-route-casing', weight: 9, interactive: false }).addTo(m);
    const route = L.polyline(ROUTE, { className: 'hunt-route', weight: 5, interactive: false }).addTo(m);
    L.polyline(ROUTE, { className: 'hunt-route-flow', weight: 5, interactive: false }).addTo(m);

    L.circleMarker([START.lat, START.lng], { className: 'hunt-start', radius: 9, weight: 3 })
      .addTo(m)
      .bindTooltip(START.label, { permanent: true, direction: 'top', offset: [0, -10], className: 'hunt-tip' });

    /* Checkpoint 1 sits a few metres from the start, so it is drawn on
       top and to the side rather than hidden under the start ring. */
    CHECKPOINTS.forEach((c) => {
      L.marker([c.lat, c.lng], {
        icon: L.divIcon({ className: 'hunt-cp', html: `<span>${c.n}</span>`, iconSize: [26, 26], iconAnchor: c.n === 1 ? [-4, 13] : [13, 13] }),
        title: `Checkpoint ${c.n}`, alt: `Checkpoint ${c.n}`, keyboard: false, zIndexOffset: 1000,
      }).addTo(m);
    });

    m.fitBounds(route.getBounds(), { padding: [32, 32] });

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (watch.current != null) navigator.geolocation?.clearWatch(watch.current);
      m.remove();
    };
  }, [onClose]);

  const fitRoute = () => map.current?.fitBounds(L.latLngBounds(ROUTE), { padding: [32, 32] });

  /* Only asks for location when tapped — no permission prompt on open. */
  const locate = () => {
    const m = map.current;
    if (!m) return;
    if (me.current && locating === 'on') { m.setView(me.current.dot.getLatLng(), Math.max(m.getZoom(), 17)); return; }
    if (!navigator.geolocation) { setLocating('unavailable'); return; }
    setLocating('finding');
    let first = true;
    watch.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const at = [coords.latitude, coords.longitude];
        if (!me.current) {
          me.current = {
            ring: L.circle(at, { radius: coords.accuracy, className: 'hunt-me-ring', weight: 1, interactive: false }).addTo(m),
            dot: L.circleMarker(at, { radius: 7, weight: 3, className: 'hunt-me' }).addTo(m),
          };
        } else {
          me.current.ring.setLatLng(at).setRadius(coords.accuracy);
          me.current.dot.setLatLng(at);
        }
        setLocating('on');
        if (first) { first = false; m.setView(at, Math.max(m.getZoom(), 17)); }
      },
      (err) => {
        setLocating(err.code === 1 ? 'denied' : 'unavailable');
        if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
  };

  const locateNote = {
    denied: 'Location is blocked for this app. Allow it in your browser settings to see yourself on the map.',
    unavailable: 'Couldn’t find your location. Try again outside, away from tall buildings.',
  }[locating];

  const pill = 'h-10 px-3.5 rounded-full bg-white border border-gray-200 shadow-sm text-sm font-medium text-ink cursor-pointer whitespace-nowrap active:translate-y-px focus-visible:outline-2 focus-visible:outline-red';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="hunt-map-h" className="fixed inset-0 z-[90] flex flex-col bg-paper">
      <div className="shrink-0 bg-white border-b border-gray-200 pt-[env(safe-area-inset-top)]">
        <div className="max-w-[640px] mx-auto px-4 h-14 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="hunt-map-h" className="font-display text-lg tracking-wide leading-none">Hunt map</h2>
            <p className="font-mono text-[11px] text-gray-500 mt-1">{ROUTE_STATS.km} km loop · about {ROUTE_STATS.walkMin} min on foot</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose}
            className="h-9 px-3 rounded-lg bg-ink dark:bg-flame text-white text-sm font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red">
            Close
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <div ref={el} className="absolute inset-0" aria-label="Map of the treasure hunt route" role="region" />

        <div className="absolute top-3 inset-x-0 z-[500] px-3 flex gap-2 overflow-x-auto scrollbar-none">
          <button type="button" onClick={locate} className={pill} disabled={locating === 'finding'}>
            {locating === 'finding' ? 'Finding you…' : locating === 'on' ? '◉ Me' : '◎ Show me'}
          </button>
          <button type="button" onClick={fitRoute} className={pill}>Whole route</button>
          <a href={HUNT_MAP_LINK} target="_blank" rel="noopener noreferrer" className={`${pill} grid place-items-center no-underline`}>
            Google Maps ↗
          </a>
        </div>

        {locateNote && (
          <p role="alert" className="absolute top-16 inset-x-3 z-[500] rounded-lg bg-white border border-gray-200 shadow-sm px-3 py-2 text-sm text-ink">
            {locateNote}
          </p>
        )}
      </div>

      <div className="shrink-0 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
        <ul className="max-w-[640px] mx-auto px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-5 h-1.5 rounded-full bg-red" />Walking route</li>
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-3 rounded-full border-[3px] border-red bg-white" />Start &amp; finish</li>
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-4 h-4 rounded-full bg-ink dark:bg-flame text-white text-[9px] font-bold grid place-items-center">1</span>Checkpoint, in walking order</li>
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-3 rounded-full border-[3px] border-white bg-sea shadow" />You</li>
        </ul>
      </div>
    </div>
  );
}
