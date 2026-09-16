import { useState, useCallback, useEffect } from 'react';
import schedule from './data/schedule';
import TreasureHunt from './components/TreasureHunt';
import Safety from './components/Safety';
import Album from './components/Album';
import Home from './components/Home';
import Login from './components/Login';
import Admin from './components/Admin';
import { useAuth } from './lib/useAuth';
import { cachedHuntConfig, fetchHuntConfig } from './lib/huntConfig';

const THEME_KEY = 'olc-theme';

/* Reads whatever the pre-paint script in index.html already decided,
   so the first render matches the DOM. */
function useTheme() {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0A0A0C' : '#FFFFFF');
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (e) { /* silent */ }
  }, [dark]);

  return [dark, useCallback(() => setDark((d) => !d), [])];
}

function ThemeToggle({ dark, onToggle }) {
  return (
    <button
      onClick={onToggle}
      type="button"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="shrink-0 w-8 h-8 grid place-items-center rounded-md border border-gray-200 bg-white text-sm text-gray-500 transition-colors hover:border-gray-300 dark:hover:border-flame dark:hover:text-flame"
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}

/* Safety is deliberately absent here — it lives as a pinned button in
   the header instead, so it is one tap from every screen rather than
   scrolled off the end of the strip exactly when it is needed. */
const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'itinerary', label: 'Itinerary' },
  { id: 'album', label: 'Album' },
];

/* 24px outline glyphs for the mobile tab bar, drawn to one stroke
   weight so the four read as a set. */
const TAB_ICONS = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  itinerary: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9.5h16M8.5 3v4M15.5 3v4M8 13.5h3M8 16.5h6" />
    </>
  ),
  album: (
    <>
      <rect x="3.5" y="5.5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10.5" r="1.75" />
      <path d="m4 17.5 5-4.5 3.5 3 3-2.5 4.5 4" />
    </>
  ),
  admin: (
    <>
      <path d="M12 3.5 5 6.2v5.3c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6.2z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

/* One header treatment, parameterised — rather than seven hand-rolled
   centred blocks that made every tab look like the same page. */
function PageHead({ kicker, title, accent, lede }) {
  return (
    <div className="pt-9 pb-6">
      <p className="font-mono text-[10px] tracking-[.28em] uppercase text-gray-400">{kicker}</p>
      <h1 className="display text-3xl sm:text-4xl mt-2.5 leading-[1.05]">
        {title} <span className="text-red">{accent}</span>
      </h1>
      {lede && <p className="text-sm text-gray-500 leading-relaxed mt-2.5 max-w-[46ch]">{lede}</p>}
    </div>
  );
}

/* ── ActivityCard ──────────────────────────────────── */
function ActivityCard({ act, i }) {
  const [open, setOpen] = useState(i === 0);
  const isSpecial = act.time === '🎯';

  return (
    <div className="animate-fade-up">
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden transition-shadow hover:shadow-sm">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          type="button"
          className="w-full grid grid-cols-[auto_1fr_auto] gap-3 px-3.5 py-3 text-left bg-transparent border-0 cursor-pointer text-ink transition-colors hover:bg-gray-50"
        >
          <span className={`font-mono text-xs font-semibold tracking-tight ${isSpecial ? 'text-xl' : 'text-red'}`}>
            {isSpecial ? '🎯' : act.time}
          </span>
          <span className="text-sm font-medium leading-snug">{act.activity}</span>
          <span className={`text-gray-400 text-xs self-center transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>▶</span>
        </button>
        {open && (
          <div className="px-3.5 pb-3.5 pl-[72px] text-sm text-gray-500 leading-relaxed space-y-1">
            <p className="font-medium text-gray-700 text-xs">{act.place}</p>
            <p>{act.note}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Checklist (Day 0) ────────────────────────────────
   Prep day, not a day of activities — a to-do list reads better
   than a timeline of collapsible cards nobody needs to expand twice. */
const CHECKLIST_KEY = 'olc-checklist-d0';

function useChecklist(key) {
  const [checked, setChecked] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(key)) ?? []); } catch (e) { return new Set(); }
  });

  const toggle = (id) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { localStorage.setItem(key, JSON.stringify([...next])); } catch (e) { /* silent */ }
    return next;
  });

  return [checked, toggle];
}

function ChecklistItem({ id, label, sub, checked, onToggle, compact }) {
  if (compact) {
    return (
      <label className="flex items-start gap-2 text-sm leading-relaxed cursor-pointer">
        <input type="checkbox" checked={checked} onChange={() => onToggle(id)}
          className="mt-1 w-3.5 h-3.5 rounded border-gray-300 text-red focus:ring-red shrink-0 cursor-pointer" />
        <span className={checked ? 'line-through text-gray-400' : 'text-gray-600'}>{label}</span>
      </label>
    );
  }
  return (
    <label className="flex items-start gap-3 px-3.5 py-3 bg-white border border-gray-200 rounded-lg cursor-pointer transition-colors hover:bg-gray-50">
      <input type="checkbox" checked={checked} onChange={() => onToggle(id)}
        className="mt-1 w-4 h-4 rounded border-gray-300 text-red focus:ring-red shrink-0 cursor-pointer" />
      <span className="min-w-0">
        <span className={`block text-sm font-medium leading-snug ${checked ? 'line-through text-gray-400' : 'text-ink'}`}>{label}</span>
        {sub && <span className={`block text-xs mt-0.5 leading-relaxed ${checked ? 'text-gray-300' : 'text-gray-500'}`}>{sub}</span>}
      </span>
    </label>
  );
}

function ChecklistDayPanel({ day }) {
  const [checked, toggle] = useChecklist(CHECKLIST_KEY);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {day.activities.map((act, i) => {
          const id = `act-${i}`;
          return (
            <ChecklistItem key={id} id={id} label={act.activity} sub={act.note}
              checked={checked.has(id)} onToggle={toggle} />
          );
        })}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-[11px] font-semibold tracking-wider uppercase text-sea mb-2.5">🎒 Participants</h4>
          <div className="space-y-2">
            {day.participantPrep.map((item, i) => {
              const id = `pp-${i}`;
              return <ChecklistItem key={id} id={id} label={item} compact
                checked={checked.has(id)} onToggle={toggle} />;
            })}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-[11px] font-semibold tracking-wider uppercase text-red mb-2.5">📋 Committee</h4>
          <div className="space-y-2">
            {day.committeePrep.map((item, i) => {
              const id = `cp-${i}`;
              return <ChecklistItem key={id} id={id} label={item} compact
                checked={checked.has(id)} onToggle={toggle} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── DayPanel ──────────────────────────────────────── */
function DayPanel({ day, index, active, onOpenTreasureHunt }) {
  if (!active) return null;

  if (index === 0) {
    return <ChecklistDayPanel day={day} />;
  }

  return (
    <div className="space-y-4">
      {/* Treasure hunt button for Day 4 */}
      {index === 4 && (
        <button
          onClick={onOpenTreasureHunt}
          type="button"
          className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl bg-ink dark:bg-flame text-white font-display text-xl tracking-wide transition-all hover:opacity-90 active:scale-[.98]"
        >
          <span className="text-2xl">🗺️</span>
          <span><em className="not-italic text-gold dark:text-paper">Atami</em> Treasure Hunt</span>
        </button>
      )}

      {/* Timeline */}
      <div className="relative space-y-2.5 pl-5">
        <div className="absolute left-[7px] top-3 bottom-3 w-px bg-gray-200" />
        {day.activities.map((act, i) => (
          <div key={i} className="relative">
            <div className="absolute left-[-18px] top-[18px] w-2.5 h-2.5 rounded-full bg-red border-2 border-white shadow-sm" />
            <ActivityCard act={act} i={i} />
          </div>
        ))}
      </div>

      {/* Prep cards */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-[11px] font-semibold tracking-wider uppercase text-sea mb-2.5">🎒 Participants</h4>
          <ul className="space-y-2">
            {day.participantPrep.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600 leading-relaxed">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-sea shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-[11px] font-semibold tracking-wider uppercase text-red mb-2.5">📋 Committee</h4>
          <ul className="space-y-2">
            {day.committeePrep.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600 leading-relaxed">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Stamp teaser on Day 4 */}
      {index === 4 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="font-display text-base tracking-wide">Atami Treasure Hunt</p>
          <p className="text-sm text-gray-500 mt-1">5 checkpoints · 14:10–17:30 · All downhill</p>
          <div className="flex gap-2 justify-center mt-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="w-8 h-8 rounded-full border border-dashed border-gray-300 grid place-items-center font-mono text-xs text-gray-400">
                {i + 1}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Itinerary ─────────────────────────────────────── */
function Itinerary({ onOpenTreasureHunt, activeDay, setActiveDay }) {
  return (
    <section>
      <PageHead
        kicker="22 – 27 Oct 2026"
        title="The"
        accent="Plan"
      />

      {/* Day tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 mb-1 scrollbar-none" role="tablist">
        {schedule.map((d, i) => (
          <button
            key={i}
            onClick={() => setActiveDay(i)}
            role="tab"
            aria-selected={i === activeDay}
            type="button"
            className={`flex-none px-3 py-2 rounded-lg text-left transition-all ${
              i === activeDay
                ? 'bg-ink dark:bg-flame text-white'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="font-display text-sm tracking-wide">{d.day}</div>
            <div className="text-xs mt-0.5 opacity-70">{d.label}</div>
          </button>
        ))}
      </div>

      {schedule.map((day, i) => (
        <DayPanel key={i} day={day} index={i} active={i === activeDay} onOpenTreasureHunt={onOpenTreasureHunt} />
      ))}
    </section>
  );
}

/* ── App ────────────────────────────────────────────── */
export default function App() {
  const [tab, setTab] = useState('home');
  const [itinDay, setItinDay] = useState(0);
  const [treasureOpen, setTreasureOpen] = useState(false);
  const [dark, toggleTheme] = useTheme();
  const auth = useAuth();

  /* Re-read the team on the way in: an admin may have just assigned it. */
  const { refreshMember } = auth;
  /* Hunt content is edited by admins. Open with the phone's last copy
     straight away, then swap in the latest if there is signal. */
  const [huntConfig, setHuntConfig] = useState(() => cachedHuntConfig());
  const openTreasureHunt = useCallback(() => {
    refreshMember();
    fetchHuntConfig().then(({ config }) => setHuntConfig(config));
    setTreasureOpen(true);
  }, [refreshMember]);
  const closeTreasureHunt = useCallback(() => setTreasureOpen(false), []);

  const go = useCallback((id) => {
    setTab(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const Header = () => (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-[640px] mx-auto px-4 h-13 py-2 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => go('home')}
          aria-label="Go to home"
          className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer"
        >
          <span className="block font-display text-sm tracking-wide text-ink">Orangeleaf · Japan 2026</span>
        </button>

        {/* Pinned, not a tab: the one screen you must never have to hunt for. */}
        <button
          type="button"
          onClick={() => go('safety')}
          aria-label="Emergency and medical information"
          className={`shrink-0 h-8 px-2.5 grid place-items-center rounded-md border font-display text-sm tracking-wide cursor-pointer transition-colors ${
            tab === 'safety'
              ? 'bg-red text-paper border-red'
              : 'border-red text-red hover:bg-red hover:text-paper'
          }`}
        >
          SOS
        </button>
        <ThemeToggle dark={dark} onToggle={toggleTheme} />
      </div>
    </header>
  );

  /* Blank for the instant the stored session is read — flashing the
     login form at someone already signed in reads as being logged out. */
  if (auth.loading) return null;

  const tabs = auth.isAdmin ? [...TABS, { id: 'admin', label: 'Admin' }] : TABS;

  if (!auth.session || auth.setup) {
    return (
      <Login
        key={auth.setup ?? 'signin'}
        setup={auth.setup}
        onPasswordSet={auth.endSetup}
        themeToggle={<ThemeToggle dark={dark} onToggle={toggleTheme} />}
      />
    );
  }

  if (treasureOpen) {
    return (
      <>
        <Header />
        <div className="max-w-[640px] mx-auto px-4 pb-8">
          <TreasureHunt onClose={closeTreasureHunt} teamId={auth.member.team} config={huntConfig} />
        </div>
      </>
    );
  }

  return (
    <>
      <Header />

      {/* Tab navigation — desktop/tablet: strip under the header, edge-faded
          so it is obvious it scrolls. Phones get the bottom bar instead. */}
      <nav aria-label="Sections" className="hidden md:block sticky top-13 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-[640px] mx-auto nav-fade">
          <div className="flex gap-1 overflow-x-auto px-4 scrollbar-none">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                type="button"
                aria-current={tab === t.id ? 'page' : undefined}
                className={`flex-none px-3 py-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  tab === t.id
                    ? 'border-red text-ink'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Mobile tab bar — within thumb reach, the way native apps do it.
          Pads for the iPhone home indicator (viewport-fit=cover is set). */}
      <nav
        aria-label="Sections"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="max-w-[640px] mx-auto grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                type="button"
                aria-current={active ? 'page' : undefined}
                className={`relative h-16 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors active:bg-gray-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red ${
                  active ? 'text-red' : 'text-gray-400'
                }`}
              >
                {active && <span aria-hidden="true" className="absolute top-0 inset-x-5 h-0.5 rounded-full bg-red" />}
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2 : 1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {TAB_ICONS[t.id]}
                </svg>
                <span className={`text-[11px] leading-none ${active ? 'font-semibold text-ink' : 'font-medium'}`}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content — extra bottom room on phones so the last card clears the tab bar */}
      <div className="max-w-[640px] mx-auto px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-14">
        {tab === 'home' && (
          <Home
            onGo={go}
            onOpenTreasureHunt={openTreasureHunt}
            userEmail={auth.user?.email}
            isAdmin={auth.isAdmin}
            onSignOut={auth.signOut}
          />
        )}
        {tab === 'itinerary' && (
          <Itinerary
            onOpenTreasureHunt={openTreasureHunt}
            activeDay={itinDay}
            setActiveDay={setItinDay}
          />
        )}
        {tab === 'album' && <Album userId={auth.user?.id} isAdmin={auth.isAdmin} />}
        {tab === 'admin' && auth.isAdmin && (
          <Admin currentEmail={auth.user?.email} onSelfChanged={auth.refreshMember} />
        )}
        {tab === 'safety' && <Safety />}
      </div>
    </>
  );
}