import { useState } from 'react';
import {
  ALERT_SETUP, EMERGENCY_NUMBERS, HAZARDS, REGROUP, PHRASES,
} from '../data/safety';

function Card({ eyebrow, title, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      {eyebrow && <h3 className="eyebrow mb-1">{eyebrow}</h3>}
      {title && <h2 className="font-display text-lg tracking-wide mb-3">{title}</h2>}
      {children}
    </div>
  );
}

function Bullets({ items, dot = 'bg-red' }) {
  return (
    <ul className="space-y-2.5">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600 leading-relaxed">
          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/* One hazard, collapsed by default — the full set open at once is an
   unreadable wall on a phone. */
function Hazard({ hazard, open, onToggle }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left bg-transparent border-0 cursor-pointer"
      >
        <span className="text-2xl shrink-0">{hazard.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base tracking-wide">{hazard.title}</span>
          <span className="block text-xs text-gray-500 leading-snug mt-0.5">{hazard.when}</span>
        </span>
        <span className={`text-gray-400 text-xs shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          <Bullets items={hazard.steps} />

          {hazard.tiers && (
            <div className="mt-4 space-y-1.5">
              {hazard.tiers.map((t) => (
                <div key={t.en} className="flex items-baseline gap-2.5 text-sm pb-2 border-b border-gray-100 last:border-b-0 last:pb-0">
                  <span className="font-medium shrink-0">{t.jp}</span>
                  <span className="text-xs text-gray-500 flex-1 leading-snug">
                    <b className="text-gray-600">{t.en}</b> — {t.detail}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Safety() {
  const [open, setOpen] = useState(null);

  return (
    <section>
      <div className="py-8 text-center">
        <p className="text-xs text-gray-400 font-mono tracking-widest uppercase">Emergency</p>
        <h1 className="display text-3xl sm:text-4xl mt-2">
          If Something <span className="text-red">Goes Wrong</span>
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Works with no signal. Read it once before you fly.
        </p>
      </div>

      <div className="rounded-lg border-2 border-red p-4 mb-4">
        <p className="text-sm font-semibold mb-1">This page does not warn you.</p>
        <p className="text-sm text-gray-600 leading-relaxed">
          Japan’s warnings — earthquake, tsunami, typhoon, landslide — reach you through
          your phone’s alert system, not through this app, which will be closed when it
          matters. Set up the alerts below and treat this page as the reference you read
          afterwards.
        </p>
      </div>

      <div className="space-y-4">
        {/* Numbers first: the thing you need fastest. */}
        <Card eyebrow="📞 Emergency numbers" title="Tap to call">
          <div className="space-y-2">
            {EMERGENCY_NUMBERS.map((n) => (
              <a
                key={n.label}
                href={`tel:${n.dial}`}
                className={`flex items-center gap-3 p-3 rounded-lg no-underline border transition-colors active:bg-card-hover ${
                  n.highlight ? 'border-red' : 'border-gray-200'
                }`}
              >
                <span className="font-display text-lg tracking-wide text-red shrink-0 min-w-[92px]">
                  {n.number}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{n.label}</span>
                  <span className="block text-xs text-gray-500 leading-snug">{n.note}</span>
                </span>
              </a>
            ))}
          </div>
          <p className="note mt-3">
            Japanese operators on 110 / 119 may have limited English — say your location first,
            then “English please”. The Visitor Hotline can interpret for you.
          </p>
        </Card>

        {/* Hazards */}
        <div>
          <h3 className="eyebrow mb-2 px-1">⚠️ What to do — tap a situation</h3>
          <div className="space-y-2">
            {HAZARDS.map((h) => (
              <Hazard
                key={h.id}
                hazard={h}
                open={open === h.id}
                onToggle={() => setOpen(open === h.id ? null : h.id)}
              />
            ))}
          </div>
        </div>

        <Card eyebrow="🔔 Before you fly" title="Turn on real alerts">
          <div className="space-y-3.5">
            {ALERT_SETUP.map((s) => (
              <div key={s.title}>
                <p className="text-sm font-medium mb-0.5">{s.title}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{s.body}</p>
                {s.action && (
                  <a
                    href={s.action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-1.5 text-xs font-medium text-sea no-underline"
                  >
                    {s.action.label} ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card eyebrow="👥 Finding each other" title="If the group is split">
          <Bullets items={REGROUP} dot="bg-gold" />
        </Card>

        <Card eyebrow="🗣 Say it in Japanese" title="Emergency phrases">
          <div className="space-y-2.5">
            {PHRASES.map((p) => (
              <div key={p.en} className="pb-2.5 border-b border-gray-100 last:border-b-0 last:pb-0">
                <p className="text-base font-medium leading-snug">{p.jp}</p>
                <p className="text-xs font-mono text-gray-400 mt-0.5">{p.romaji}</p>
                <p className="text-sm text-gray-500">{p.en}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <p className="note text-center mt-5 pb-6">
        Numbers verified Aug 2026 · confirm the embassy line before you travel
      </p>
    </section>
  );
}
