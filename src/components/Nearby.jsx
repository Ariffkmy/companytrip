import { useMemo, useState } from 'react';
import { BASE_LOCATION, CATEGORIES, PLACES } from '../data/nearby';

/* ── Icons ──────────────────────────────────────────
   Drawn after the Lucide set the category data names, inline so the
   tiles still draw with no signal. */
const ICON_PATHS = {
  store: 'M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6',
  'shopping-cart': 'M3 3h2l2.4 12h11l2-8H6.2M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z',
  'moon-star': 'M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5zM18 3v4m-2-2h4',
  cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  'shopping-bag': 'M5 7h14l-1 14H6L5 7zm4 0V5a3 3 0 016 0v2',
  'map-pin': 'M12 21s-7-6.2-7-12a7 7 0 0114 0c0 5.8-7 12-7 12zm0-9.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  train: 'M6 3h12a1 1 0 011 1v11a3 3 0 01-3 3H8a3 3 0 01-3-3V4a1 1 0 011-1zM5 10h14M8 21l2-3m6 3l-2-3M9 14h.01M15 14h.01',
  hotel: 'M3 21V5a2 2 0 012-2h9a2 2 0 012 2v16M16 9h3a2 2 0 012 2v10M2 21h20M7 7h1m3 0h1M7 11h1m3 0h1M7 15h1m3 0h1',
};

function Icon({ name, className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICON_PATHS[name] ?? ICON_PATHS['map-pin']} />
    </svg>
  );
}

/* Tile colour when there is no photo, or it didn't load. */
const TONE = {
  convenience_store: 'bg-sea/10 text-sea',
  supermarket: 'bg-green/10 text-green',
  halal_grocery: 'bg-green/10 text-green',
  pharmacy: 'bg-red/10 text-red',
  shopping: 'bg-gold/15 text-gold',
  shopping_area: 'bg-gold/15 text-gold',
  transport: 'bg-sea/10 text-sea',
  hotel: 'bg-gray-100 text-gray-500',
};

/* ── Navigation links ───────────────────────────────
   Coordinates, not addresses: several of these are a mall floor or a
   street, which the apps geocode badly. Walking, because everything
   here is on foot from the hotel. */
const googleUrl = (p) =>
  `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}&travelmode=walking`;
const wazeUrl = (p) => `https://waze.com/ul?ll=${p.latitude}%2C${p.longitude}&navigate=yes`;

const commonsFile = (file) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;
const commonsImage = (file) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=480`;

/* ── Walking time ───────────────────────────────────
   Straight-line distance, stretched by 1.3 for the street grid, at
   80 m a minute. The data's own figure wins where it has one. */
function walkMinutes(p) {
  if (p.approx_walk_minutes_from_hotel) return p.approx_walk_minutes_from_hotel;
  const rad = Math.PI / 180;
  const dLat = (p.latitude - BASE_LOCATION.latitude) * rad;
  const dLng = (p.longitude - BASE_LOCATION.longitude) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(BASE_LOCATION.latitude * rad) * Math.cos(p.latitude * rad) * Math.sin(dLng / 2) ** 2;
  const metres = 2 * 6371000 * Math.asin(Math.sqrt(a));
  return Math.max(1, Math.round((metres * 1.3) / 80));
}

/* ── Open now ───────────────────────────────────────
   Always Japan time, whatever the phone's clock says: a phone still on
   Malaysian time would be an hour out. */
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function tokyoNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((x) => [x.type, x.value]),
  );
  return { day: parts.weekday.toLowerCase(), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function openStatus(hours, now = tokyoNow()) {
  if (!hours) return null;
  const today = typeof hours === 'string' ? hours : hours[now.day];
  if (!today) return null;
  if (/24\s*hours/i.test(today)) return { open: true, label: 'Open 24h' };
  const [from, to] = today.split('-');
  const o = toMinutes(from);
  const c = toMinutes(to);
  /* A close at or before the open time runs past midnight (00:00, 03:00). */
  const open = c > o ? now.minutes >= o && now.minutes < c : now.minutes >= o || now.minutes < c;
  if (open) return { open: true, label: `Open · till ${to}` };
  if (typeof hours !== 'string' && now.minutes >= c) {
    const tomorrow = hours[DAYS[(DAYS.indexOf(now.day) + 1) % 7]];
    if (tomorrow) return { open: false, label: `Closed · opens ${tomorrow.split('-')[0]}` };
  }
  return { open: false, label: `Closed · opens ${from}` };
}

/* ── Pieces ─────────────────────────────────────── */
function NavButtons({ place, compact }) {
  const cls = `flex-1 inline-flex items-center justify-center gap-1.5 ${compact ? 'h-9' : 'h-10'} rounded-lg border border-gray-200 bg-white text-xs font-medium text-ink no-underline transition-colors hover:border-gray-300`;
  return (
    <div className="flex gap-2">
      <a href={googleUrl(place)} target="_blank" rel="noopener noreferrer" className={cls}
        aria-label={`Walk to ${place.name} with Google Maps`}>
        <Icon name="map-pin" className="w-3.5 h-3.5 text-red" />Google Maps
      </a>
      <a href={wazeUrl(place)} target="_blank" rel="noopener noreferrer" className={cls}
        aria-label={`Navigate to ${place.name} with Waze`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          className="w-3.5 h-3.5 text-sea" aria-hidden="true">
          <path d="M5 16a3 3 0 01-2-3c0-5 4-9 9-9s9 4 9 8-3 7-7 7h-4M9 10h.01M15 10h.01M9.5 13.5c1.5 1 3.5 1 5 0" />
          <circle cx="7.5" cy="19" r="1.5" /><circle cx="16.5" cy="19" r="1.5" />
        </svg>Waze
      </a>
    </div>
  );
}

function Photo({ place }) {
  const [failed, setFailed] = useState(false);
  const cat = CATEGORIES[place.category];

  if (!place.photo || failed) {
    return (
      <div className={`h-full w-full flex flex-col items-center justify-center gap-1.5 ${TONE[place.category] ?? TONE.hotel}`}>
        <Icon name={cat?.icon} className="w-9 h-9" />
        <span className="font-display text-sm tracking-wide text-ink/70">{place.brand ?? place.name}</span>
      </div>
    );
  }

  return (
    <>
      <img src={commonsImage(place.photo)} alt={place.photoIsThisPlace ? place.name : `A ${place.brand ?? place.name} in Japan`}
        loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}
        className="h-full w-full object-cover" />
      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-2.5 pt-6 pb-1.5 bg-gradient-to-t from-black/60 to-transparent">
        {!place.photoIsThisPlace && (
          <span className="font-mono text-[9px] tracking-wider uppercase text-onscrim/90">Typical branch</span>
        )}
        <a href={commonsFile(place.photo)} target="_blank" rel="noopener noreferrer"
          className="ml-auto font-mono text-[9px] text-onscrim/80 underline underline-offset-2">Photo · Wikimedia</a>
      </span>
    </>
  );
}

function PlaceCard({ place, now }) {
  const cat = CATEGORIES[place.category];
  const status = openStatus(place.opening_hours, now);
  const mins = walkMinutes(place);
  const detail = place.subcategory === 'train_station'
    ? `${place.line} · ${place.station_code}`
    : (place.services ?? []).slice(0, 3).join(' · ');

  return (
    <li className="snap-start shrink-0 w-[76%] max-w-[270px] flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="relative aspect-[4/3] bg-gray-100">
        <Photo place={place} />
        {place.muslim_friendly && (
          <span className="absolute top-2 left-2 rounded-full bg-green px-2 py-0.5 text-[10px] font-semibold text-onscrim">Halal</span>
        )}
      </div>

      <div className="flex flex-col flex-1 p-3.5">
        <p className="font-mono text-[10px] tracking-[.14em] uppercase text-gray-400 flex items-center gap-1">
          <Icon name={cat?.icon} className="w-3 h-3" />{cat?.label ?? place.category}
        </p>
        <h3 className="text-sm font-semibold leading-snug mt-1">{place.name}</h3>
        {place.name_jp && <p className="text-xs text-gray-500 leading-snug">{place.name_jp}</p>}

        <p className="text-xs mt-2 flex flex-wrap gap-x-2 gap-y-0.5">
          <span className="font-medium text-ink">{mins} min walk</span>
          {status && (
            <span className={status.open ? 'text-green font-medium' : 'text-red font-medium'}>{status.label}</span>
          )}
        </p>

        {detail && <p className="text-xs text-gray-500 leading-snug mt-1.5">{detail}</p>}
        {place.notes && <p className="text-xs text-gray-500 leading-snug mt-1.5 italic">{place.notes}</p>}
        {place.tax_free_available && (
          <p className="text-xs text-gray-500 mt-1.5">Tax-free · {place.ic_card_payment?.join(' / ')}</p>
        )}
        {place.phone && (
          <a href={`tel:${place.phone.replace(/[^\d+]/g, '')}`} className="text-xs text-ink underline underline-offset-2 decoration-gray-300 mt-1.5 self-start">
            {place.phone}
          </a>
        )}

        <div className="mt-auto pt-3">
          <NavButtons place={place} compact />
        </div>
      </div>
    </li>
  );
}

/* The hotel itself: the address to show a taxi driver and the way
   back after a late konbini run. */
function HomeBase() {
  const b = BASE_LOCATION;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="font-mono text-[10px] tracking-[.14em] uppercase text-gray-400 flex items-center gap-1">
        <Icon name="hotel" className="w-3 h-3" />Our hotel
      </p>
      <p className="font-display text-base tracking-wide leading-snug mt-1">{b.name}</p>
      <p className="text-sm text-ink leading-snug mt-1 select-all">{b.address}</p>
      <a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`} className="inline-block text-sm text-ink underline underline-offset-2 decoration-red mt-1">
        {b.phone}
      </a>
      <ul className="mt-2 space-y-0.5">
        {b.notes.map((n) => <li key={n} className="text-xs text-gray-500 leading-snug">· {n}</li>)}
      </ul>
      <div className="mt-3"><NavButtons place={b} /></div>
    </div>
  );
}

export default function Nearby() {
  const [filter, setFilter] = useState('all');
  /* Read once per render of the section; the labels don't need to tick. */
  const now = tokyoNow();

  const sorted = useMemo(
    () => [...PLACES].sort((a, b) => walkMinutes(a) - walkMinutes(b)),
    [],
  );
  const present = Object.keys(CATEGORIES).filter((c) => PLACES.some((p) => p.category === c));
  const shown = filter === 'all' ? sorted : sorted.filter((p) => p.category === filter);

  const chip = (active) =>
    `shrink-0 h-8 px-3 rounded-full border text-xs font-medium cursor-pointer transition-colors ${
      active ? 'bg-ink text-paper border-ink' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`;

  return (
    <section className="mt-9" aria-labelledby="nearby-h">
      <h2 id="nearby-h" className="font-mono text-[13px] font-bold tracking-[.14em] uppercase text-gray-700 mb-2.5">
        Around the hotel · Yokohama
      </h2>

      <HomeBase />

      <div className="flex gap-2 overflow-x-auto scrollbar-none mt-4 -mx-1 px-1 pb-1" role="group" aria-label="Filter places">
        <button type="button" onClick={() => setFilter('all')} className={chip(filter === 'all')}
          aria-pressed={filter === 'all'}>All</button>
        {present.map((c) => (
          <button key={c} type="button" onClick={() => setFilter(c)} className={chip(filter === c)}
            aria-pressed={filter === c}>{CATEGORIES[c].label}</button>
        ))}
      </div>

      <ul className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none mt-2.5 -mx-1 px-1 pb-1 scroll-px-1">
        {shown.map((p) => <PlaceCard key={p.id} place={p} now={now} />)}
      </ul>
      <p className="note mt-1.5">Swipe for more · walking times are from the hotel</p>
    </section>
  );
}
