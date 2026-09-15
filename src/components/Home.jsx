/* Hallmark · macrostructure: Workbench · tone: utilitarian travel-zine
 * fingerprint: bottom-aligned heading · asymmetric spans · negative-space
 * dividers · widgets stacked weather → money → photos
 */

import WeatherWidget from './Weather';
import ForexWidget from './ForexWidget';
import PhotoCarousel from './PhotoCarousel';

/* ── Jump ───────────────────────────────────────────
   Two-up, deliberately uneven in weight: Safety is the one you
   need under pressure, so it reads loudest. */
function Jump({ onGo, onOpenTreasureHunt }) {
  const items = [
    { label: 'Emergency', sub: 'Hospitals · 119 · phrases', go: () => onGo('safety'), urgent: true, wide: true },
    { label: 'Treasure Hunt', sub: 'Atami · Day 4', go: onOpenTreasureHunt },
    { label: 'My team', sub: 'Leads & JP speakers', go: () => onGo('group') },
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
      <WeatherWidget />
      <ForexWidget />
      <PhotoCarousel onOpenAlbum={() => onGo('album')} />
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
