/* ═══════════════════════════════════════════════════
   Forex — Frankfurter (European Central Bank reference rates)

   Free, no API key, CORS-enabled — so the browser calls it directly
   and no secret ships in the bundle. ECB publishes once per working
   day (~16:00 CET), so this is a reference rate for tracking the
   trend, not what a money changer will give you.

   One time-series request covers both the latest rate and the
   30-day trend. Cached so the widget still shows something offline.
   ═══════════════════════════════════════════════════ */

export const BASE = 'MYR';
export const QUOTE = 'JPY';
const DAYS = 30;
const CACHE_KEY = 'olc-forex-cache';
const CACHE_TTL = 3 * 60 * 60 * 1000; // 3h — the source only moves daily

const HOSTS = ['https://api.frankfurter.dev/v1', 'https://api.frankfurter.app'];

function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch (e) {
    return null;
  }
}

/**
 * → { rate, date, series: [{ date, rate }], change, cached? }
 * rate = how many JPY one MYR buys. change = % move over the series.
 */
export async function loadForex({ force = false } = {}) {
  const cache = readCache();
  if (!force && cache && Date.now() - cache.at < CACHE_TTL) return cache.payload;

  const path = `/${isoDaysAgo(DAYS)}..?base=${BASE}&symbols=${QUOTE}`;
  let json = null;
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + path);
      if (res.ok) { json = await res.json(); break; }
    } catch (e) { /* try the next host */ }
  }

  if (!json?.rates) {
    if (cache) return { ...cache.payload, cached: true };
    throw new Error('forex unavailable');
  }

  const series = Object.entries(json.rates)
    .map(([date, r]) => ({ date, rate: r[QUOTE] }))
    .filter((p) => typeof p.rate === 'number')
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!series.length) throw new Error('forex empty');

  const first = series[0].rate;
  const last = series[series.length - 1];
  const payload = {
    rate: last.rate,
    date: last.date,
    series,
    change: ((last.rate - first) / first) * 100,
  };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), payload })); } catch (e) { /* optional */ }
  return payload;
}
