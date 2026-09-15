/* Hallmark · macrostructure: Workbench · tone: utilitarian travel-zine
 * fingerprint: bottom-aligned heading · asymmetric spans · negative-space
 * dividers · oversized solid CTA · no imagery · number-tick reveal
 */

import { useState } from 'react';
import schedule from '../data/schedule';
import { getTripState, getNextUp, TRIP_DAYS } from '../lib/tripClock';

/* ── Up next ────────────────────────────────────────
   The single most useful object on the screen, so it gets the
   only filled surface and the only accent bar on the page. */
function UpNext({ next, onGoToDay }) {
  if (!next) return null;
  const { activity, day, label, isLive, dayIndexInSchedule } = next;

  return (
    <section aria-label={label} className="pt-9">
      <div className="rounded-xl border-2 border-ink dark:border-gray-300 overflow-hidden bg-white">
        <div className="flex items-center gap-2 px-4 py-2 bg-ink dark:bg-gray-200">
          {isLive && (
            <span className="w-1.5 h-1.5 rounded-full bg-red shrink-0" aria-hidden="true" />
          )}
          <span className="font-mono text-[10px] tracking-[.18em] uppercase text-white dark:text-ink">
            {label}
          </span>
          <span className="ml-auto font-mono text-[10px] tracking-wider text-gray-400 dark:text-ink-soft">
            {day.day} · {day.label}
          </span>
        </div>

        <div className="px-4 pt-3.5 pb-4">
          <p className="font-mono text-2xl text-red leading-none tick">{activity.time}</p>
          <p className="text-[17px] font-medium leading-snug mt-2">{activity.activity}</p>
          <p className="text-sm text-gray-500 mt-1">{activity.place}</p>
          <p className="text-sm text-gray-500 leading-relaxed mt-2.5">{activity.note}</p>

          <button
            type="button"
            onClick={() => onGoToDay(dayIndexInSchedule)}
            /* text-paper, not white: on dark the accent lightens to flame
               orange, where white text drops to ~2.7:1. Paper flips to
               near-black there and the pair stays legible in both themes. */
            className="mt-4 w-full px-4 py-3 rounded-lg bg-red text-paper font-display text-lg tracking-wide border-0 cursor-pointer whitespace-nowrap transition-transform duration-100 active:translate-y-px"
          >
            Open {day.day} in full
          </button>
        </div>
      </div>
    </section>
  );
}

/* ── Day rail ───────────────────────────────────────
   The trip as one scannable object. Doubles as navigation. */
function DayRail({ state, onGoToDay }) {
  return (
    <section className="mt-9">
      <h2 className="font-mono text-[10px] tracking-[.18em] uppercase text-gray-400 mb-2.5">
        Six days
      </h2>
      <ol className="space-y-1.5">
        {TRIP_DAYS.map((d, i) => {
          const isToday = state.phase === 'during' && state.dayIndex === i;
          const isPast = state.phase === 'during' && i < state.dayIndex;
          return (
            <li key={d.day}>
              <button
                type="button"
                onClick={() => onGoToDay(schedule.indexOf(d))}
                aria-current={isToday ? 'date' : undefined}
                className={`w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3.5 py-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                  isToday
                    ? 'border-red bg-white'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                } ${isPast ? 'opacity-55' : ''}`}
              >
                <span className={`font-display text-sm tracking-wide w-7 ${isToday ? 'text-red' : 'text-gray-400'}`}>
                  {d.day}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-snug truncate">{d.title}</span>
                  <span className="block font-mono text-[10px] tracking-wider text-gray-400 mt-0.5">
                    {d.label}
                  </span>
                </span>
                <span className="text-lg shrink-0" aria-hidden="true">{d.emoji}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ── Jump ───────────────────────────────────────────
   Two-up, deliberately uneven in weight: Safety is the one you
   need under pressure, so it reads loudest. */
function Jump({ onGo, onOpenTreasureHunt }) {
  const items = [
    { label: 'Emergency', sub: 'Hospitals · 119 · phrases', go: () => onGo('safety'), urgent: true, wide: true },
    { label: 'Treasure Hunt', sub: 'Atami · Day 4', go: onOpenTreasureHunt },
    { label: 'My team', sub: 'Leads & JP speakers', go: () => onGo('group') },
    /* Wide so the grid closes on a full-width row instead of leaving a
       half-width orphan, which reads as a mistake rather than a rhythm. */
    { label: 'Weather', sub: 'Forecast & what to wear', go: () => onGo('weather'), wide: true },
  ];

  return (
    <section className="mt-9">
      <h2 className="font-mono text-[10px] tracking-[.18em] uppercase text-gray-400 mb-2.5">
        Jump to
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            onClick={it.go}
            className={`px-3.5 py-3 rounded-lg border text-left cursor-pointer transition-colors bg-white ${
              it.urgent ? 'border-red' : 'border-gray-200 hover:border-gray-300'
            } ${it.wide ? 'col-span-2' : ''}`}
          >
            <span className={`block text-sm font-medium leading-snug ${it.urgent ? 'text-red' : ''}`}>
              {it.label}
            </span>
            <span className="block text-xs text-gray-500 leading-snug mt-0.5">{it.sub}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Home({ onGo, onGoToDay, onOpenTreasureHunt, userEmail, isAdmin, onSignOut }) {
  /* One read at mount is enough — nobody leaves this screen open
     across a date boundary, and a ticking clock here would be motion
     for its own sake. */
  const [now] = useState(() => new Date());
  const state = getTripState(now);
  const next = getNextUp(now);

  return (
    <section>
      <UpNext next={next} onGoToDay={onGoToDay} />
      <DayRail state={state} onGoToDay={onGoToDay} />
      <Jump onGo={onGo} onOpenTreasureHunt={onOpenTreasureHunt} />

      <div className="mt-10 pb-4 border-t border-gray-200 pt-4 space-y-1.5">
        <p className="note flex items-baseline gap-2 min-w-0">
          <span className="truncate">Signed in as {userEmail}</span>
          {isAdmin && (
            <span className="shrink-0 font-semibold uppercase tracking-wider text-red">Admin</span>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="shrink-0 underline underline-offset-2 hover:text-red cursor-pointer"
          >
            Sign out
          </button>
        </p>
        <p className="note">Works offline · add to your home screen before you fly</p>
      </div>
    </section>
  );
}
