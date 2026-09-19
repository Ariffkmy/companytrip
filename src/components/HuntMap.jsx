import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* OpenStreetMap's own tiles: no key, fine for a couple of dozen phones.
   Dark mode is a CSS filter on the tile pane (see index.css). The
   service worker keeps tiles once seen, so the route area still draws
   on a weak signal. */
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const num = (v) => (String(v ?? '').trim() === '' ? NaN : Number(v));
const point = (p) => {
  const lat = num(p?.lat);
  const lng = num(p?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
};

/* Full-screen map of the hunt route, drawn from the admin's settings.
   Opened over the game, so closing it drops the team back exactly where
   they were. */
export default function HuntMap({ map: cfg, onClose }) {
  const el = useRef(null);
  const map = useRef(null);
  const me = useRef(null);
  const watch = useRef(null);
  const closeRef = useRef(null);
  const [locating, setLocating] = useState('off'); // off | finding | on | denied | unavailable

  const start = point(cfg?.start);
  const stops = (cfg?.checkpoints ?? []).map(point).filter(Boolean);
  /* No drawn line yet: join the stops so there is still something to follow. */
  const line = (cfg?.route ?? []).map((p) => (Array.isArray(p) ? p : point(p))).filter(Boolean);
  const route = line.length > 1 ? line : [start, ...stops].filter(Boolean);
  const link = String(cfg?.link ?? '').trim();

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, attributionControl: true });
    map.current = m;
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    L.tileLayer(TILES, {
      /* CORS mode, so cached tiles aren't opaque (which bloats quota). */
      attribution: ATTRIBUTION, maxZoom: 19, crossOrigin: 'anonymous',
    }).addTo(m);

    if (route.length > 1) {
      L.polyline(route, { className: 'hunt-route-casing', weight: 9, interactive: false }).addTo(m);
      L.polyline(route, { className: 'hunt-route', weight: 5, interactive: false }).addTo(m);
      L.polyline(route, { className: 'hunt-route-flow', weight: 5, interactive: false }).addTo(m);
    }

    if (start) {
      L.circleMarker(start, { className: 'hunt-start', radius: 9, weight: 3 })
        .addTo(m)
        .bindTooltip(cfg?.start?.label || 'Start & finish', { permanent: true, direction: 'top', offset: [0, -10], className: 'hunt-tip' });
    }

    /* A stop within a few metres of the start is drawn to the side so it
       isn't hidden under the start ring. */
    const near = (a, b) => a && b && Math.abs(a[0] - b[0]) < 0.0002 && Math.abs(a[1] - b[1]) < 0.0002;
    stops.forEach((at, i) => {
      const note = String(cfg.checkpoints[i]?.note ?? '').trim();
      const label = `Checkpoint ${i + 1}`;
      const marker = L.marker(at, {
        icon: L.divIcon({ className: 'hunt-cp', html: `<span>${i + 1}</span>`, iconSize: [26, 26], iconAnchor: near(at, start) ? [-4, 13] : [13, 13] }),
        title: note ? `${label} · ${note}` : label, alt: label, keyboard: false, zIndexOffset: 1000,
      }).addTo(m);
      if (note) marker.bindPopup(`<b>${label}</b><br>${note}`);
    });

    const bounds = L.latLngBounds([...route, ...stops, start].filter(Boolean));
    if (bounds.isValid()) m.fitBounds(bounds, { padding: [32, 32] });
    else m.setView([35.1033, 139.0784], 15);

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
    /* Built once per open; the config can't change while it is up. */
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fitRoute = () => {
    const bounds = L.latLngBounds([...route, ...stops, start].filter(Boolean));
    if (bounds.isValid()) map.current?.fitBounds(bounds, { padding: [32, 32] });
  };

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

  const km = num(cfg?.km);
  const walkMin = num(cfg?.walkMin);
  const stats = [
    Number.isFinite(km) && km > 0 ? `${km} km` : null,
    Number.isFinite(walkMin) && walkMin > 0 ? `about ${walkMin} min on foot` : null,
    stops.length ? `${stops.length} checkpoint${stops.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');

  const pill = 'h-10 px-3.5 rounded-full bg-white border border-gray-200 shadow-sm text-sm font-medium text-ink cursor-pointer whitespace-nowrap active:translate-y-px focus-visible:outline-2 focus-visible:outline-red';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="hunt-map-h" className="fixed inset-0 z-[90] flex flex-col bg-paper">
      <div className="shrink-0 bg-white border-b border-gray-200 pt-[env(safe-area-inset-top)]">
        <div className="max-w-[640px] mx-auto px-4 h-14 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="hunt-map-h" className="font-display text-lg tracking-wide leading-none">Hunt map</h2>
            {stats && <p className="font-mono text-[11px] text-gray-500 mt-1 truncate">{stats}</p>}
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
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className={`${pill} grid place-items-center no-underline`}>
              Google Maps ↗
            </a>
          )}
        </div>

        {locateNote && (
          <p role="alert" className="absolute top-16 inset-x-3 z-[500] rounded-lg bg-white border border-gray-200 shadow-sm px-3 py-2 text-sm text-ink">
            {locateNote}
          </p>
        )}
      </div>

      <div className="shrink-0 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
        <ul className="max-w-[640px] mx-auto px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          {route.length > 1 && <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-5 h-1.5 rounded-full bg-red" />Walking route</li>}
          {start && <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-3 rounded-full border-[3px] border-red bg-white" />{cfg?.start?.label || 'Start & finish'}</li>}
          {stops.length > 0 && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="w-4 h-4 rounded-full bg-ink dark:bg-flame text-white text-[9px] font-bold grid place-items-center">1</span>
              Checkpoint, in walking order
            </li>
          )}
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-3 rounded-full border-[3px] border-white bg-sea shadow" />You</li>
        </ul>
      </div>
    </div>
  );
}
