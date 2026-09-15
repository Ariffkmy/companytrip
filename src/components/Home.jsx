/* Hallmark · macrostructure: Workbench · tone: utilitarian travel-zine
 * fingerprint: bottom-aligned heading · asymmetric spans · negative-space
 * dividers · widgets stacked weather → money → photos
 */

import { useState } from 'react';
import WeatherWidget from './Weather';
import ForexWidget from './ForexWidget';
import PhotoCarousel from './PhotoCarousel';
import groupRoster from '../data/groupRoster';

/* Lead and JP Speaker are the two you need to find fast, so they are
   the only rows that carry a badge. */
const ROLE_STYLE = {
  'Team Lead': 'text-sea',
  'JP Speaker': 'text-gold',
};

/* ── Groups ───────────────────────────────────────── */
function Groups() {
  const [openGroups, setOpenGroups] = useState([0]);

  const toggleGroup = (idx) => {
    setOpenGroups((prev) => prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]);
  };

  return (
    <section className="mt-9">
      <h2 className="font-mono text-[10px] tracking-[.18em] uppercase text-gray-400 mb-2.5">
        Teams
      </h2>
      <div className="space-y-2.5">
        {groupRoster.map((g, gi) => (
          <div key={g.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden transition-shadow hover:shadow-sm">
            <button
              onClick={() => toggleGroup(gi)}
              type="button"
              className="w-full flex items-center gap-3 px-4 py-3 text-left bg-transparent border-0 cursor-pointer"
            >
              <span className="font-display text-base tracking-wide">{g.name}</span>
              <span className="text-xs text-gray-400 font-mono">{g.members.length} pax</span>
              <span className={`ml-auto text-gray-400 text-xs transition-transform ${openGroups.includes(gi) ? 'rotate-90' : ''}`}>▶</span>
            </button>
            {openGroups.includes(gi) && (
              <div className="px-4 pb-3 border-t border-gray-100">
                {g.members.map((m) => (
                  <div key={m.name} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
                    <span className="text-sm font-medium leading-snug">
                      {m.name}
                      {ROLE_STYLE[m.role] && (
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ml-2 ${ROLE_STYLE[m.role]}`}>
                          {m.role}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
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

export default function Home({ onGo, onOpenTreasureHunt, userEmail, isAdmin, onSignOut }) {
  return (
    <section>
      <PhotoCarousel onOpenAlbum={() => onGo('album')} />
      <Groups />
      <WeatherWidget />
      <ForexWidget />
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
