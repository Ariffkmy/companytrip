/* ═══════════════════════════════════════════════════
   Weather — Open-Meteo

   No API key, CORS-enabled, so the browser calls it directly. That
   matters for a static build: a keyed provider would ship its secret
   inside the JS bundle.

   The widget shows a rolling five days starting today, so it is
   always about now rather than about the trip window.

   Two modes:
     • LIVE     — the actual forecast. Today is always inside
                  Open-Meteo's ~16 day horizon, so this is the normal
                  path.
     • TYPICAL  — the same calendar days averaged over recent years,
                  from the historical archive. A fallback for when the
                  forecast endpoint cannot be reached.

   Both endpoints accept comma-separated coordinates, so all three
   cities arrive in one request.
   ═══════════════════════════════════════════════════ */

export const CITIES = [
  { id: 'yokohama', name: 'Yokohama', lat: 35.4437, lon: 139.638, days: 'Day 1–2' },
  { id: 'kamakura', name: 'Kamakura', lat: 35.3192, lon: 139.5467, days: 'Day 3' },
  { id: 'atami', name: 'Atami', lat: 35.0953, lon: 139.0717, days: 'Day 4–5' },
];

export const TRIP_DATES = [
  '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26',
];

/* Which city you are in on each trip date. Used to label the forecast
   once the window reaches the trip; outside it there is no answer, and
   callers fall back to the first or last destination. */
export const TRIP_CITY_BY_DATE = Object.fromEntries(
  TRIP_DATES.map((date, i) => [date, [0, 0, 1, 2, 2][i]])
);

/* How many days the widget shows, starting today. */
const WINDOW = 5;

/* How many past years to average for the TYPICAL view. */
const NORMAL_YEARS = 5;

/* Dates are the forecast's own, so "today" means today in Japan — the
   window must not slide a day when someone opens the app late at night
   in Malaysia. en-CA formats as YYYY-MM-DD. */
const tokyoToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The days the widget covers: today first, then the next four. */
export function forecastDates() {
  const first = tokyoToday();
  return Array.from({ length: WINDOW }, (_, i) => addDays(first, i));
}

const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum';
const HOURLY = 'temperature_2m,precipitation,weather_code,relative_humidity_2m,wind_speed_10m';
const LAT = CITIES.map((c) => c.lat).join(',');
const LON = CITIES.map((c) => c.lon).join(',');

/* The chart plots every hour; only every third gets an axis label. */
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** "14:00" → "2 pm", matching how the day strip reads. */
export function hourLabel(h) {
  if (h === 0) return '12 am';
  if (h === 12) return '12 pm';
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

export const toF = (c) => c * 9 / 5 + 32;

const CACHE_KEY = 'olc-weather-cache';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h — forecasts don't move faster than this

/* WMO weather interpretation codes → something a human reads. */
const CODES = [
  [[0], '☀️', 'Clear'],
  [[1], '🌤', 'Mostly clear'],
  [[2], '⛅', 'Partly cloudy'],
  [[3], '☁️', 'Overcast'],
  [[45, 48], '🌫', 'Fog'],
  [[51, 53, 55, 56, 57], '🌦', 'Drizzle'],
  [[61, 63, 80, 81], '🌧', 'Rain'],
  [[65, 82], '🌧', 'Heavy rain'],
  [[66, 67], '🌧', 'Freezing rain'],
  [[71, 73, 75, 77, 85, 86], '🌨', 'Snow'],
  [[95, 96, 99], '⛈', 'Thunderstorm'],
];

export function describeCode(code) {
  const hit = CODES.find(([codes]) => codes.includes(code));
  return hit ? { icon: hit[1], label: hit[2] } : { icon: '·', label: '—' };
}

/** What to wear, given the day's low. October in Kanto is jacket weather. */
export function advise(min, max, rain) {
  if (rain >= 5) return 'Umbrella — steady rain likely';
  if (rain >= 1) return 'Pack a folding umbrella';
  if (min <= 13) return 'Cold after dark — bring a jacket';
  if (max >= 24) return 'Warm for October — layer light';
  return 'Comfortable — light jacket at night';
}

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (!raw || Date.now() - raw.at >= CACHE_TTL) return null;
    /* A copy saved while the widget still covered the fixed trip window
       has no dates on it, and one saved yesterday is a day behind. Both
       would draw a strip that disagrees with its own labels, so treat
       them as a miss and fetch. */
    const dates = raw.payload?.dates;
    if (!Array.isArray(dates) || dates[0] !== tokyoToday()) return null;
    return raw.payload;
  } catch { /* ignore */ }
  return null;
}

function writeCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), payload }));
  } catch { /* quota — cache is optional */ }
}

/* Open-Meteo returns a bare object for one coordinate and an array for
   many. Normalise so the callers below never have to care. */
async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const json = await res.json();
  return Array.isArray(json) ? json : [json];
}

/** The real forecast for the rolling window. Null if it can't be had. */
async function fetchLive(dates) {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${LAT}&longitude=${LON}&daily=${DAILY}&hourly=${HOURLY}`
    + `&timezone=Asia%2FTokyo&start_date=${dates[0]}&end_date=${dates[dates.length - 1]}`;

  let results;
  try {
    results = await get(url);
  } catch {
    return null; // out of range comes back as an error, not empty data
  }

  const byCity = results.map((r) => readDays(r, dates));
  // Every value being null means the window returned placeholder rows.
  const hasData = byCity.some((days) => days.some((d) => d && d.max !== null));
  return hasData ? byCity : null;
}

/** The same calendar days averaged across the last NORMAL_YEARS years. */
async function fetchTypical(dates) {
  const thisYear = Number(dates[0].slice(0, 4));
  const years = Array.from({ length: NORMAL_YEARS }, (_, i) => thisYear - 1 - i);
  const from = dates[0].slice(5);
  const to = dates[dates.length - 1].slice(5);
  /* A window that straddles New Year would need two ranges per year for
     no real gain — this is only ever a fallback, so skip it and let the
     caller fall through to the cached copy. */
  if (from > to) throw new Error('window crosses the year');

  const perYear = await Promise.all(
    years.map((y) =>
      get(
        'https://archive-api.open-meteo.com/v1/archive'
        + `?latitude=${LAT}&longitude=${LON}&daily=${DAILY}&hourly=${HOURLY}`
        + `&timezone=Asia%2FTokyo&start_date=${y}-${from}&end_date=${y}-${to}`
      ).catch(() => null)
    )
  );

  const good = perYear.filter(Boolean);
  if (good.length === 0) throw new Error('no archive data');

  // For each city, for each of the 5 days, average across the years.
  return CITIES.map((_, ci) =>
    dates.map((date, di) => {
      const rows = good.map((yr) => readDays(yr[ci], dates)[di]).filter((d) => d && d.max !== null);
      if (rows.length === 0) return null;
      const mean = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
      return {
        date,
        max: Math.round(mean('max')),
        min: Math.round(mean('min')),
        rain: Math.round(mean('rain') * 10) / 10,
        // Most frequent condition across the sampled years
        code: mode(rows.map((r) => r.code)),
        hours: meanHours(rows),
        years: rows.length,
      };
    })
  );
}

/* Average each clock hour across the sampled years, so 09:00 on the
   typical view is the mean of every 09:00 in the sample. */
function meanHours(rows) {
  const withHours = rows.filter((r) => r.hours);
  if (withHours.length === 0) return null;

  return HOURS.map((h) => {
    const at = withHours.map((r) => r.hours.find((x) => x.hour === h)).filter(Boolean);
    if (at.length === 0) return null;
    const avg = (k) => {
      const vals = at.map((x) => x[k]).filter((v) => v !== null && v !== undefined);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };
    const humidity = avg('humidity');
    const wind = avg('wind');
    return {
      hour: h,
      temp: Math.round(avg('temp') * 10) / 10,
      rain: Math.round(avg('rain') * 10) / 10,
      code: mode(at.map((x) => x.code)),
      humidity: humidity === null ? null : Math.round(humidity),
      wind: wind === null ? null : Math.round(wind * 10) / 10,
      /* No archive equivalent of "chance of rain", so derive an
         empirical one: the share of sampled years that were actually
         wet at this hour. */
      rainChance: Math.round((at.filter((x) => x.rain > 0.1).length / at.length) * 100),
    };
  }).filter(Boolean);
}

/* Day-level figures for the summary block, taken from the hours so
   live and typical modes agree on how they're computed. */
export function summarise(day) {
  const hours = day?.hours;
  if (!hours || hours.length === 0) return { humidity: null, wind: null, rainChance: null };
  const nums = (k) => hours.map((h) => h[k]).filter((v) => v !== null && v !== undefined);
  const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
  const hum = mean(nums('humidity'));
  const chance = hours[0].rainChance !== undefined
    ? Math.max(...hours.map((h) => h.rainChance ?? 0))
    : null;
  return {
    humidity: hum === null ? null : Math.round(hum),
    wind: Math.round(Math.max(0, ...nums('wind'))),
    rainChance: chance,
  };
}

function mode(values) {
  const counts = new Map();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/* Pull the HOURS of one calendar date out of the flat hourly arrays.
   Open-Meteo returns local times as "YYYY-MM-DDTHH:mm". */
function readHours(hourly, date) {
  if (!hourly?.time) return null;
  const out = HOURS.map((h) => {
    const stamp = `${date}T${String(h).padStart(2, '0')}:00`;
    const i = hourly.time.indexOf(stamp);
    if (i === -1 || hourly.temperature_2m[i] === null) return null;
    return {
      hour: h,
      temp: hourly.temperature_2m[i],
      rain: hourly.precipitation[i] ?? 0,
      code: hourly.weather_code[i],
      humidity: hourly.relative_humidity_2m?.[i] ?? null,
      wind: hourly.wind_speed_10m?.[i] ?? null,
    };
  }).filter(Boolean);
  return out.length ? out : null;
}

function readDays(result, dates) {
  const d = result?.daily;
  if (!d) return dates.map(() => null);
  return d.time.map((date, i) => ({
    date,
    code: d.weather_code[i],
    max: d.temperature_2m_max[i],
    min: d.temperature_2m_min[i],
    rain: d.precipitation_sum[i] ?? 0,
    hours: readHours(result.hourly, date),
  }));
}

/**
 * Weather for the next five days, starting today.
 * → { mode: 'live' | 'typical', dates: [iso …], cities: [[day, …] …], cached?: true }
 */
export async function loadWeather() {
  const dates = forecastDates();

  const live = await fetchLive(dates);
  if (live) {
    const payload = { mode: 'live', dates, cities: live };
    writeCache(payload);
    return payload;
  }

  try {
    const payload = { mode: 'typical', dates, cities: await fetchTypical(dates) };
    writeCache(payload);
    return payload;
  } catch (err) {
    const cached = readCache();
    if (cached) return { ...cached, cached: true };
    throw err;
  }
}
