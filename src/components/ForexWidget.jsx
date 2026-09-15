import { useEffect, useState } from 'react';
import { BASE, QUOTE, loadForex } from '../lib/forex';

const QUICK_YEN = [1000, 3000, 5000, 10000];

const fmt = (n, digits = 2) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';

function Sparkline({ series }) {
  const W = 320, H = 56, PAD = 3;
  const vals = series.map((p) => p.rate);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i) => PAD + (i / Math.max(1, series.length - 1)) * (W - PAD * 2);
  const y = (v) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);
  const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ');
  const area = `${line} L${x(series.length - 1)},${H} L${x(0)},${H} Z`;
  const last = series[series.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14 block" preserveAspectRatio="none" role="img"
      aria-label={`${BASE} to ${QUOTE} over the last month, from ${fmt(series[0].rate)} to ${fmt(last.rate)}`}>
      <path d={area} fill="var(--color-sea)" opacity="0.1" />
      <path d={line} fill="none" stroke="var(--color-sea)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={x(series.length - 1)} cy={y(last.rate)} r="3" fill="var(--color-sea)" />
    </svg>
  );
}

export default function ForexWidget() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [myr, setMyr] = useState('100');
  const [jpy, setJpy] = useState('');
  const [edited, setEdited] = useState('myr'); // which box the user last typed in

  useEffect(() => {
    let live = true;
    loadForex()
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setError('Couldn’t reach the exchange-rate service.'); });
    return () => { live = false; };
  }, []);

  const rate = data?.rate;
  /* Derive the other box from whichever one was typed in, so neither
     drifts from rounding when you switch back and forth. */
  const myrShown = edited === 'myr' ? myr : (rate && jpy !== '' ? fmt(Number(jpy) / rate).replace(/,/g, '') : '');
  const jpyShown = edited === 'jpy' ? jpy : (rate && myr !== '' ? String(Math.round(Number(myr) * rate)) : '');

  const up = (data?.change ?? 0) >= 0;
  const inputCls =
    'w-full min-w-0 h-12 rounded-lg border border-gray-200 bg-white pl-11 pr-3 text-lg tick text-ink ' +
    'outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-red/40';

  return (
    <section className="mt-9" aria-labelledby="fx-h">
      <h2 id="fx-h" className="font-mono text-[10px] tracking-[.18em] uppercase text-gray-400 mb-2.5">
        Exchange rate
      </h2>
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {error && !data ? (
          <p className="text-sm text-gray-500">{error}</p>
        ) : !data ? (
          <p className="note">Loading rates…</p>
        ) : (
          <>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-sm text-gray-500">RM 1 =</p>
              <p className="display text-4xl leading-none tick">¥{fmt(rate)}</p>
              <p className={`ml-auto font-mono text-xs tick ${up ? 'text-green' : 'text-red'}`}
                title="Change over the last 30 days">
                {up ? '▲' : '▼'} {fmt(Math.abs(data.change))}% · 30d
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-1 tick">¥1,000 = RM {fmt(1000 / rate)}</p>

            <div className="mt-3 -mx-1"><Sparkline series={data.series} /></div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <label className="relative block">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">RM</span>
                <span className="sr-only">Ringgit</span>
                <input type="number" inputMode="decimal" min="0" value={myrShown}
                  onChange={(e) => { setMyr(e.target.value); setEdited('myr'); }} className={inputCls} />
              </label>
              <label className="relative block">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">¥</span>
                <span className="sr-only">Yen</span>
                <input type="number" inputMode="numeric" min="0" value={jpyShown}
                  onChange={(e) => { setJpy(e.target.value); setEdited('jpy'); }} className={inputCls} />
              </label>
            </div>

            <div className="flex gap-1.5 overflow-x-auto scrollbar-none mt-2">
              {QUICK_YEN.map((y) => (
                <button key={y} type="button" onClick={() => { setJpy(String(y)); setEdited('jpy'); }}
                  className="flex-none h-8 px-2.5 rounded-full border border-gray-200 text-xs text-gray-600 tick cursor-pointer hover:border-gray-300">
                  ¥{y.toLocaleString()} ≈ RM {fmt(y / rate, 0)}
                </button>
              ))}
            </div>

            <p className="note mt-3 leading-relaxed">
              ECB reference rate for {new Date(data.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              {data.cached ? ' · offline, last saved copy' : ''}. Money changers give a little less.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
