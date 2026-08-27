import { useState, useEffect, useCallback } from 'react';
import {
  CITIES, loadWeather, describeCode, advise,
  hourLabel, toF, summarise,
} from '../lib/weather';

const DAYS = [
  { short: 'Thu', num: '22' },
  { short: 'Fri', num: '23' },
  { short: 'Sat', num: '24' },
  { short: 'Sun', num: '25' },
  { short: 'Mon', num: '26' },
];

const METRICS = [
  { id: 'temp', label: 'Temperature' },
  { id: 'rain', label: 'Precipitation' },
  { id: 'wind', label: 'Wind' },
];

/* Which hours get an axis label — every third, so eight across. */
const TICKS = [0, 3, 6, 9, 12, 15, 18, 21];

/* ── Hourly chart ──────────────────────────────────────
   Hand-rolled SVG rather than a chart library: three series, one
   shape, and it keeps the bundle flat. The viewBox is phone-sized and
   scales up, so nothing needs measuring at runtime. */
function Chart({ hours, metric, unitF }) {
  // PAD_X keeps the first and last axis labels inside the viewBox —
  // they're middle-anchored, so a curve starting at x=0 clips them.
  const W = 380, H = 150, TOP = 30, BOTTOM = 26, PAD_X = 17;

  const valueOf = (h) => {
    if (metric === 'temp') return unitF ? toF(h.temp) : h.temp;
    if (metric === 'rain') return h.rainChance ?? (h.rain > 0 ? 100 : 0);
    return h.wind ?? 0;
  };

  const values = hours.map(valueOf);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // Flat series (all-zero rain, say) would divide by zero.
  const span = hi - lo || 1;
  const pad = metric === 'temp' ? span * 0.25 : span * 0.15;
  const min = metric === 'temp' ? lo - pad : Math.min(0, lo);
  const max = hi + pad;

  const x = (i) => PAD_X + (i / (hours.length - 1)) * (W - PAD_X * 2);
  const y = (v) => TOP + (1 - (v - min) / (max - min || 1)) * (H - TOP - BOTTOM);

  const line = hours.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(valueOf(h)).toFixed(1)}`).join(' ');
  const area = `${line} L${W - PAD_X},${H - BOTTOM} L${PAD_X},${H - BOTTOM} Z`;

  const suffix = metric === 'temp' ? '°' : metric === 'rain' ? '%' : '';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img"
      aria-label={`${metric} by hour`}>
      <defs>
        <linearGradient id="wx-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0.06" />
        </linearGradient>
      </defs>

      <path d={area} fill="url(#wx-fill)" />
      <path d={line} fill="none" stroke="var(--color-gold)" strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />

      {TICKS.map((t) => {
        const i = hours.findIndex((h) => h.hour === t);
        if (i === -1) return null;
        const v = valueOf(hours[i]);
        return (
          <g key={t}>
            <text x={x(i)} y={y(v) - 9} textAnchor="middle"
              fontSize="10" fontWeight="600" fill="var(--color-ink)">
              {Math.round(v)}{suffix}
            </text>
            <circle cx={x(i)} cy={y(v)} r="2.5" fill="var(--color-gold)" />
            <text x={x(i)} y={H - 8} textAnchor="middle"
              fontSize="9" fill="var(--color-ink-muted)" fontFamily="var(--font-mono)">
              {hourLabel(t)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Weather() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [city, setCity] = useState(CITIES[0].id);
  const [dayIndex, setDayIndex] = useState(0);
  const [metric, setMetric] = useState('temp');
  const [unitF, setUnitF] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await loadWeather());
    } catch {
      setError('Could not reach the weather service.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cityIndex = CITIES.findIndex((c) => c.id === city);
  const days = data?.cities?.[cityIndex] ?? [];
  const day = days[dayIndex];
  const stats = summarise(day);
  const cond = day ? describeCode(day.code) : null;
  const t = (c) => Math.round(unitF ? toF(c) : c);

  return (
    <section>
      <div className="py-8 text-center">
        <p className="text-xs text-gray-400 font-mono tracking-widest uppercase">22–26 Oct 2026</p>
        <h1 className="display text-3xl sm:text-4xl mt-2">
          Weather <span className="text-red">Forecast</span>
        </h1>
        <p className="text-sm text-gray-500 mt-2">Yokohama · Kamakura · Atami</p>
      </div>

      {/* City */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 mb-3">
        {CITIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCity(c.id)}
            className={`flex-none px-3.5 py-2 rounded-lg text-left transition-all ${
              c.id === city
                ? 'bg-ink dark:bg-flame text-white'
                : 'bg-white text-gray-500 border border-gray-200 active:border-gray-300'
            }`}
          >
            <span className="block font-display text-sm tracking-wide">{c.name}</span>
            <span className="block text-[10px] mt-0.5 opacity-70">{c.days}</span>
          </button>
        ))}
      </div>

      {error ? (
        <div className="bg-white border border-gray-200 rounded-lg py-10 text-center">
          <p className="text-sm text-gray-500 mb-3">{error}</p>
          <button type="button" onClick={load}
            className="px-4 py-2 rounded-lg bg-ink dark:bg-flame text-white text-xs font-medium">
            Try again
          </button>
        </div>
      ) : !day ? (
        <div className="bg-white border border-gray-200 rounded-lg py-10 text-center">
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {/* ── Summary ── */}
          <div className="flex items-start gap-3 p-4">
            <span className="text-5xl leading-none shrink-0">{cond.icon}</span>

            <div className="shrink-0">
              <p className="flex items-start">
                <span className="display text-5xl leading-none">{t(day.max)}</span>
                <span className="text-xs font-medium mt-0.5 ml-1">
                  <button type="button" onClick={() => setUnitF(false)}
                    className={unitF ? 'text-gray-400' : 'text-ink'}>°C</button>
                  <span className="text-gray-300 mx-0.5">|</span>
                  <button type="button" onClick={() => setUnitF(true)}
                    className={unitF ? 'text-ink' : 'text-gray-400'}>°F</button>
                </span>
              </p>
              <p className="text-xs text-gray-400 mt-1">Low {t(day.min)}°</p>
            </div>

            <div className="min-w-0 flex-1 text-right">
              <p className="font-display text-base tracking-wide leading-tight">
                {DAYS[dayIndex].short} {DAYS[dayIndex].num} Oct
              </p>
              <p className="text-xs text-gray-500 leading-snug">{cond.label}</p>
              <p className="text-[11px] text-gray-400 leading-snug mt-1">{CITIES[cityIndex].name}</p>
            </div>
          </div>

          <div className="px-4 pb-3 -mt-1 space-y-0.5">
            {stats.rainChance !== null && (
              <p className="text-xs text-gray-500">
                Precipitation: <span className="text-gray-600">{stats.rainChance}%</span>
                <span className="text-gray-400"> · {day.rain} mm</span>
              </p>
            )}
            {stats.humidity !== null && (
              <p className="text-xs text-gray-500">Humidity: <span className="text-gray-600">{stats.humidity}%</span></p>
            )}
            {stats.wind !== null && (
              <p className="text-xs text-gray-500">Wind: <span className="text-gray-600">{stats.wind} km/h</span></p>
            )}
            <p className="text-xs text-sea pt-1">{advise(day.min, day.max, day.rain)}</p>
          </div>

          {/* ── Metric tabs ── */}
          <div className="flex gap-4 px-4 border-b border-gray-100">
            {METRICS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetric(m.id)}
                className={`pb-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  metric === m.id
                    ? 'border-gold text-ink'
                    : 'border-transparent text-gray-400'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* ── Chart ── */}
          <div className="px-2 pt-2">
            {day.hours?.length
              ? <Chart hours={day.hours} metric={metric} unitF={unitF} />
              : <p className="text-xs text-gray-400 text-center py-10">No hourly data</p>}
          </div>

          {/* ── Day strip ── */}
          <div className="flex gap-1 px-2 pb-3 pt-1 overflow-x-auto scrollbar-none">
            {DAYS.map((d, i) => {
              const dd = days[i];
              const c = dd ? describeCode(dd.code) : null;
              return (
                <button
                  key={d.num}
                  type="button"
                  onClick={() => setDayIndex(i)}
                  className={`flex-1 min-w-[62px] rounded-lg py-2.5 text-center transition-colors border ${
                    i === dayIndex
                      ? 'border-gray-300 bg-card-hover'
                      : 'border-transparent active:bg-card-hover'
                  }`}
                >
                  <p className="font-display text-sm tracking-wide">{d.short}</p>
                  <p className="text-xl leading-tight my-0.5">{c ? c.icon : '·'}</p>
                  {dd && (
                    <p className="text-xs">
                      <span className="font-semibold">{t(dd.max)}°</span>{' '}
                      <span className="text-gray-400">{t(dd.min)}°</span>
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* What am I looking at? */}
      {data && (
        <div className={`rounded-lg p-3.5 mt-4 border ${
          data.mode === 'live' ? 'border-gray-200 bg-white' : 'border-gold'
        }`}>
          <p className="text-sm font-medium mb-0.5">
            {data.mode === 'live' ? '📡 Live forecast' : '📊 Typical late October'}
          </p>
          <p className="text-xs text-gray-500 leading-relaxed">
            {data.mode === 'live'
              ? 'Actual forecast for the trip dates, refreshed from Open-Meteo.'
              : `The trip is still beyond any real forecast — no service predicts this far out. These are the same five calendar days averaged over the last ${days.find((d) => d)?.years ?? 5} years, which is what to pack by. Precipitation % is how often those years were actually wet. The live forecast replaces this automatically about two weeks before departure.`}
            {data.cached && ' Showing the last saved copy — you appear to be offline.'}
          </p>
        </div>
      )}

      <p className="note text-center mt-5 pb-6">Open-Meteo</p>
    </section>
  );
}
