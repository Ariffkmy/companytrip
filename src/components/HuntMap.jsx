import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* OpenStreetMap's own tiles: no key, fine for a couple of dozen phones.
   Dark mode is a CSS filter on the tile pane (see index.css). The
   service worker keeps tiles once seen, so the playing area still draws
   on a weak signal. */
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const num = (v) => (String(v ?? '').trim() === '' ? NaN : Number(v));
const point = (p) => {
  const lat = num(p?.lat);
  const lng = num(p?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
};

/* Turn an area's outline into Leaflet [lat, lng] pairs, dropping any
   vertex an admin has left half-filled. */
const ring = (polygon) => (polygon ?? [])
  .map((p) => (Array.isArray(p) ? [num(p[0]), num(p[1])] : [num(p?.lat), num(p?.lng)]))
  .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

/* Full-screen map of the hunt areas, drawn from the admin's settings.
   Opened over the game, so closing it drops the team back exactly where
   they were. Areas are outlined rather than pinned: a team may be
   anywhere inside one, and may take them in any order. */
export default function HuntMap({ map: cfg, onClose }) {
  const el = useRef(null);
  const map = useRef(null);
  const me = useRef(null);
  const watch = useRef(null);
  const closeRef = useRef(null);
  const [locating, setLocating] = useState('off'); // off | finding | on | denied | unavailable

  const start = point(cfg?.start);
  const areas = (cfg?.areas ?? [])
    .map((a, i) => ({ ...a, n: a.n ?? i + 1, ring: ring(a.polygon) }))
    .filter((a) => a.ring.length >= 3);
  const boundary = ring(cfg?.boundary);
  const link = String(cfg?.link ?? '').trim();

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, attributionControl: true });
    map.current = m;
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    L.tileLayer(TILES, {
      /* CORS mode, so cached tiles aren't opaque (which bloats quota). */
      attribution: ATTRIBUTION, maxZoom: 19, crossOrigin: 'anonymous',
    }).addTo(m);

    /* The areas tile the field, so they are drawn as a patchwork rather
       than as six outlined objects: a soft tint per area, hairline
       dividers between neighbours, and one heavy line around the whole
       field. Six identical heavy outlines read as six islands, which is
       the opposite of what these are. */
    areas.forEach((a) => {
      const label = a.label || `Area ${a.n}`;
      const note = String(a.note ?? '').trim();
      const shape = L.polygon(a.ring, { className: `hunt-area hunt-area-${((a.n - 1) % 6) + 1}`, weight: 1.5 })
        .addTo(m)
        .bindTooltip(label, { permanent: true, direction: 'center', className: 'hunt-area-tip' });
      shape.bindPopup(note ? `<b>${label}</b><br>${note}` : `<b>${label}</b>`);
    });

    if (boundary.length >= 3) {
      L.polygon(boundary, { className: 'hunt-field-casing', weight: 11, fill: false, interactive: false }).addTo(m);
      L.polygon(boundary, { className: 'hunt-field', weight: 5, fill: false, interactive: false }).addTo(m);
    }

    if (start) {
      L.circleMarker(start, { className: 'hunt-start', radius: 9, weight: 3 })
        .addTo(m)
        .bindTooltip(cfg?.start?.label || 'Start & finish', { permanent: true, direction: 'top', offset: [0, -10], className: 'hunt-tip' });
    }

    const bounds = L.latLngBounds([...boundary, ...areas.flatMap((a) => a.ring), start].filter(Boolean));
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

  const fitAll = () => {
    const bounds = L.latLngBounds([...boundary, ...areas.flatMap((a) => a.ring), start].filter(Boolean));
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
    Number.isFinite(km) && km > 0 ? `${km} km across` : null,
    Number.isFinite(walkMin) && walkMin > 0 ? `about ${walkMin} min end to end` : null,
    areas.length ? `${areas.length} area${areas.length === 1 ? '' : 's'}, any order` : null,
  ].filter(Boolean).join(' · ');

  const pill = 'h-10 px-3.5 rounded-full bg-white border border-gray-200 shadow-sm text-sm font-medium text-ink cursor-pointer whitespace-nowrap active:translate-y-px focus-visible:outline-2 focus-visible:outline-red';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="hunt-map-h" className="fixed inset-0 z-[90] flex flex-col bg-paper">
      <div className="shrink-0 bg-white border-b border-gray-200 pt-[env(safe-area-inset-top)]">
        <div className="max-w-[640px] mx-auto px-4 h-14 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="hunt-map-h" className="font-display text-lg tracking-wide leading-none">Hunt areas</h2>
            {stats && <p className="font-mono text-[11px] text-gray-500 mt-1 truncate">{stats}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose}
            className="h-9 px-3 rounded-lg bg-ink dark:bg-flame text-white text-sm font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red">
            Close
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <div ref={el} className="absolute inset-0" aria-label="Map of the treasure hunt areas" role="region" />

        <div className="absolute top-3 inset-x-0 z-[500] px-3 flex gap-2 overflow-x-auto scrollbar-none">
          <button type="button" onClick={locate} className={pill} disabled={locating === 'finding'}>
            {locating === 'finding' ? 'Finding you…' : locating === 'on' ? '◉ Me' : '◎ Show me'}
          </button>
          <button type="button" onClick={fitAll} className={pill}>All areas</button>
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
          {boundary.length > 0 && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="w-5 h-3.5 rounded-sm border-2 border-red" />
              Stay inside this
            </li>
          )}
          {areas.length > 0 && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="w-5 h-3.5 rounded-sm bg-sea/25 border border-sea/40" />
              The six areas — play them in any order
            </li>
          )}
          {start && <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-3 rounded-full border-[3px] border-red bg-white" />{cfg?.start?.label || 'Start & finish'}</li>}
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-3 rounded-full border-[3px] border-white bg-sea shadow" />You</li>
        </ul>
      </div>
    </div>
  );
}
