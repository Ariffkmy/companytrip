import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* Same tiles as the hunt map (HuntMap.jsx). */
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Leaflet draws SVG attributes, which don't take var(--red): look the
   group colours up from the page. */
function resolve(colour) {
  const m = /^var\((--[^)]+)\)$/.exec(String(colour ?? '').trim());
  if (!m) return colour || '#333';
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#333';
}

const num = (v) => (String(v ?? '').trim() === '' ? NaN : Number(v));

/* Admin → Check-ins: one dot per person at their latest shared
   location, coloured by group, with a faint circle for its accuracy.
   Fits everyone once; after that the admin's own zoom is kept as new
   check-ins arrive, until "Fit everyone" (fitKey) asks again. */
export default function CheckinMap({ points, start, focus, fitKey }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const markers = useRef(new Map());
  const fitted = useRef(false);

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19, crossOrigin: 'anonymous' }).addTo(m);
    m.setView([35.1033, 139.0784], 15);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  const startLat = num(start?.lat);
  const startLng = num(start?.lng);
  const hasStart = Number.isFinite(startLat) && Number.isFinite(startLng);

  const fit = () => {
    const m = map.current;
    if (!m) return;
    const all = points.map((p) => [p.lat, p.lng]);
    if (hasStart) all.push([startLat, startLng]);
    if (!all.length) return;
    m.fitBounds(L.latLngBounds(all), { padding: [36, 36], maxZoom: 17 });
  };

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    markers.current.clear();
    if (hasStart) {
      L.circleMarker([startLat, startLng], { className: 'hunt-start', radius: 9, weight: 3 })
        .addTo(g)
        .bindTooltip(esc(start?.label || 'Start & finish'), { direction: 'top', offset: [0, -10], className: 'hunt-tip' });
    }
    points.forEach((p) => {
      const colour = resolve(p.colour);
      if (p.accuracy) {
        L.circle([p.lat, p.lng], { radius: p.accuracy, color: colour, weight: 1, fillOpacity: 0.08, interactive: false }).addTo(g);
      }
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 8, color: p.overdue ? '#DE3B2B' : '#1a1a1a', weight: p.overdue ? 3 : 2, fillColor: colour, fillOpacity: 1,
      })
        .addTo(g)
        .bindTooltip(esc(p.name), { permanent: true, direction: 'top', offset: [0, -8], className: 'hunt-tip' })
        .bindPopup(`<b>${esc(p.name)}</b> · ${esc(p.group)}<br>${esc(p.when)} · ±${esc(p.accuracy ?? '?')} m`
          + `<br><a href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>`);
      markers.current.set(p.id, marker);
    });
    if (!fitted.current && points.length) { fit(); fitted.current = true; }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit reads the same points
  }, [points, hasStart, startLat, startLng, start?.label]);

  useEffect(() => { if (fitKey) fit(); }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focus?.id || !map.current) return;
    const marker = markers.current.get(focus.id);
    if (!marker) return;
    map.current.setView(marker.getLatLng(), 18);
    marker.openPopup();
    el.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [focus]);

  /* Its own stacking context, so Leaflet's high z-indexes stay under
     the app's sticky bars. */
  return (
    <div ref={el} role="region" aria-label="Map of everyone’s latest check-in"
      style={{ position: 'relative', zIndex: 0, height: 'min(60vh, 460px)', borderRadius: 10, border: 'var(--line)', overflow: 'hidden' }} />
  );
}
