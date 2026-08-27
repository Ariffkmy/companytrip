import { useState, useCallback, useEffect } from 'react';
import schedule from './data/schedule';
import groupRoster from './data/groupRoster';
import TreasureHunt from './components/TreasureHunt';
import Gallery from './components/Gallery';

const KANJI = ['壱', '弐', '参', '肆', '伍'];

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

const TABS = [
  { id: 'itinerary', label: 'Itinerary', icon: '🗓️' },
  { id: 'group', label: 'Group', icon: '👥' },
  { id: 'gallery', label: 'Gallery', icon: '📸' },
  { id: 'logistics', label: 'Logistics', icon: '🚆' },
  { id: 'contact', label: 'Contact', icon: '📞' },
];

function copyText(t) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(t).catch(() => fallbackCopy(t));
  } else {
    fallbackCopy(t);
  }
}

function fallbackCopy(t) {
  const ta = document.createElement('textarea');
  ta.value = t;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* silent */ }
  ta.remove();
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

/* ── DayPanel ──────────────────────────────────────── */
function DayPanel({ day, index, active, onOpenTreasureHunt }) {
  if (!active) return null;

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
          <p className="text-sm text-gray-500 mt-1">5 checkpoints · 90 minutes · All downhill</p>
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
function Itinerary({ onOpenTreasureHunt }) {
  const [activeDay, setActiveDay] = useState(0);

  return (
    <section>
      <div className="py-8 text-center">
        <p className="text-xs text-gray-400 font-mono tracking-widest uppercase">22–26 Oct 2026</p>
        <h1 className="display text-4xl sm:text-5xl mt-2 leading-tight">
          OLC<br /><span className="text-red">Company Trip</span>
        </h1>
        <p className="text-sm text-gray-500 mt-2">Yokohama → Kamakura → Atami · 30 pax</p>
      </div>

      {/* Day tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 scrollbar-none" role="tablist">
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

/* ── Logistics ─────────────────────────────────────── */
function Logistics() {
  return (
    <section>
      <div className="py-8 text-center">
        <p className="text-xs text-gray-400 font-mono tracking-widest uppercase">Logistics</p>
        <h1 className="display text-3xl sm:text-4xl mt-2">Planning <span className="text-red">Details</span></h1>
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="eyebrow mb-3">🚆 Transport</h3>
          <div className="space-y-2.5">
            {[
              { route: 'Tokyo → Yokohama', time: '~30–90 min', cost: '~¥500–3,000' },
              { route: 'Yokohama ↔ Kamakura', time: '~25 min (JR)', cost: '~¥330' },
              { route: 'Kamakura → Atami', time: '~1h 20min', cost: '~¥1,900' },
              { route: 'Atami → Tokyo', time: '40–50 min (Shinkansen)', cost: '~¥4,000' },
            ].map((r, i) => (
              <div key={i} className="flex items-baseline gap-3 text-sm pb-2 border-b border-gray-100 last:border-b-0 last:pb-0">
                <span className="font-medium text-ink min-w-[140px]">{r.route}</span>
                <span className="text-gray-500 flex-1">{r.time}</span>
                <span className="font-mono text-gray-500">{r.cost}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 font-mono mt-3">💡 7-day JR Pass (~¥50,000) not worth it. Use Suica/IC. Atami 1-Day Pass (¥800) = bus + discounts.</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="eyebrow mb-2">🌦️ Weather</h3>
          <p className="text-sm text-gray-600">15–22°C October. Comfortable and cool at night. <span className="font-medium">Bring a jacket.</span> Fireworks night: warm clothes + top up Suica early.</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="eyebrow mb-3">📅 Early Booking</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red shrink-0" /> <span><b>Atami ryokan on 25 Oct</b> — fireworks night fills fast. Halal: <b>ATAMI Sekaie</b>.</span></li>
            <li className="flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red shrink-0" /> <span><b>30-person venues</b> — Khazana / Cinta Jawa / Sekaie — reserve immediately.</span></li>
            <li className="flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red shrink-0" /> <span>Hachinoki shojin lunch &amp; Cup Noodles Museum — reserve ahead.</span></li>
          </ul>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="eyebrow mb-3">💰 Budget / Person</h3>
          <div className="space-y-2">
            {[
              { item: 'Casual meals', cost: '¥1,000–3,000' },
              { item: 'Group dinner course', cost: '¥2,500–6,000' },
              { item: 'Ryokan + kaiseki', cost: '¥15,000–30,000/night' },
              { item: 'Transport (overall)', cost: '~¥10,000–12,000' },
              { item: 'AirAsia X round trip', cost: '~RM2,200–2,700' },
            ].map((r, i) => (
              <div key={i} className="flex justify-between text-sm pb-2 border-b border-gray-100 last:border-b-0 last:pb-0">
                <span className="text-gray-600">{r.item}</span>
                <span className="font-mono text-gray-500">{r.cost}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="eyebrow mb-3">✈️ AirAsia X — KUL ↔ Haneda</h3>
          <div className="space-y-2">
            {[
              { route: 'KUL → HND', flight: 'D7522', schedule: '14:10 → 22:35 (summer)' },
              { route: 'HND → KUL', flight: 'D7523', schedule: '23:50 → 06:15+1 (summer)' },
            ].map((r, i) => (
              <div key={i} className="flex items-baseline gap-3 text-sm pb-2 border-b border-gray-100 last:border-b-0 last:pb-0">
                <span className="font-medium min-w-[80px]">{r.route}</span>
                <span className="font-mono text-gray-500 min-w-[60px]">{r.flight}</span>
                <span className="text-gray-500">{r.schedule}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 font-mono mt-3">⚠️ Trip 22 Oct — likely summer schedule. Arrive HND 22:35.</p>
        </div>
      </div>
    </section>
  );
}

/* ── Group ──────────────────────────────────────────── */
function Group() {
  const [openGroups, setOpenGroups] = useState([0]);

  const toggleGroup = (idx) => {
    setOpenGroups((prev) => prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]);
  };

  return (
    <section>
      <div className="py-8 text-center">
        <p className="text-xs text-gray-400 font-mono tracking-widest uppercase">Roster</p>
        <h1 className="display text-3xl sm:text-4xl mt-2">The <span className="text-red">Groups</span></h1>
      </div>

      <p className="text-sm text-gray-500 mb-4">5 groups of ~5–6 pax with a leader each. Total: 24 members + committee.</p>

      <div className="space-y-2.5">
        {groupRoster.map((g, gi) => (
          <div key={g.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden transition-shadow hover:shadow-sm">
            <button
              onClick={() => toggleGroup(gi)}
              type="button"
              className="w-full flex items-center gap-3 px-4 py-3 text-left bg-transparent border-0 cursor-pointer"
            >
              <span className="font-display text-base tracking-wide">{g.name}</span>
              <span className="text-xs text-gray-400 font-mono">{g.leader ? 1 + g.members.length : g.members.length} pax</span>
              <span className={`ml-auto text-gray-400 text-xs transition-transform ${openGroups.includes(gi) ? 'rotate-90' : ''}`}>▶</span>
            </button>
            {openGroups.includes(gi) && (
              <div className="px-4 pb-3 border-t border-gray-100">
                {g.leader && (
                  <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-b-0">
                    <div>
                      <span className="text-sm font-medium">{g.leader.name}</span>
                      <span className="text-[10px] text-sea font-semibold uppercase tracking-wider ml-2">Leader</span>
                    </div>
                    <span className="text-xs font-mono text-gray-400">
                      {g.leader.phone}
                      <button onClick={() => copyText(g.leader.phone)} type="button" className="ml-2 text-xs text-gray-400 hover:text-sea underline underline-offset-2">Copy</button>
                    </span>
                  </div>
                )}
                {g.members.map((m, mi) => (
                  <div key={mi} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-b-0">
                    <span className="text-sm">{m.name}</span>
                    <span className="text-xs font-mono text-gray-400">
                      {m.phone}
                      <button onClick={() => copyText(m.phone)} type="button" className="ml-2 text-xs text-gray-400 hover:text-sea underline underline-offset-2">Copy</button>
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

/* ── Contact ────────────────────────────────────────── */
function Contact() {
  const contacts = [
    { venue: 'ATAMI Sekaie (Ryokan Halal)', city: 'Atami', phone: '0557-86-2002' },
    { venue: 'Kamatsuru (Seafood Pork-Free)', city: 'Atami', phone: '0557-85-1755' },
    { venue: 'Khazana Minatomirai (Indian Halal)', city: 'Yokohama', phone: '045-682-2873' },
    { venue: 'Cinta Jawa Café (Indonesian Halal)', city: 'Yokohama', phone: '045-211-4277' },
    { venue: '🇲🇾 Malay Asian Cuisine', city: 'Yokohama', phone: '045-307-9839' },
    { venue: 'Kissho Yokohama', city: 'Yokohama', phone: '045-222-5522' },
  ];

  return (
    <section>
      <div className="py-8 text-center">
        <p className="text-xs text-gray-400 font-mono tracking-widest uppercase">Contact</p>
        <h1 className="display text-3xl sm:text-4xl mt-2">Key <span className="text-red">Numbers</span></h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold tracking-wider uppercase text-gray-400">
          <span>Venue</span>
          <span>City</span>
          <span>Phone</span>
        </div>
        {contacts.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 items-center border-b border-gray-100 last:border-b-0">
            <span className="text-sm font-medium">{c.venue}</span>
            <span className="text-xs text-gray-400">{c.city}</span>
            <span className="text-xs font-mono text-gray-500">
              {c.phone}
              <button onClick={() => copyText(c.phone)} type="button" className="ml-2 text-[10px] text-gray-400 hover:text-sea underline underline-offset-2">Copy</button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── App ────────────────────────────────────────────── */
export default function App() {
  const [tab, setTab] = useState('itinerary');
  const [treasureOpen, setTreasureOpen] = useState(false);
  const [dark, toggleTheme] = useTheme();

  const openTreasureHunt = useCallback(() => setTreasureOpen(true), []);
  const closeTreasureHunt = useCallback(() => setTreasureOpen(false), []);

  const Header = () => (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-[640px] mx-auto px-4 h-12 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-display text-sm tracking-wide text-ink">Orangeleaf · 2026</div>
          <div className="text-[10px] text-gray-400 font-mono tracking-wider">ATAMI · YOKOHAMA · KAMAKURA</div>
        </div>
        <div className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded-md">30 PAX</div>
        <ThemeToggle dark={dark} onToggle={toggleTheme} />
      </div>
    </header>
  );

  if (treasureOpen) {
    return (
      <>
        <Header />
        <div className="max-w-[640px] mx-auto px-4 pb-8">
          <TreasureHunt onClose={closeTreasureHunt} />
        </div>
      </>
    );
  }

  return (
    <>
      <Header />

      {/* Tab navigation */}
      <nav className="sticky top-12 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 flex gap-1 overflow-x-auto px-4 scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            type="button"
            className={`flex-none px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'border-ink text-ink dark:border-flame dark:text-flame'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="max-w-[640px] mx-auto px-4 pb-12">
        {tab === 'itinerary' && <Itinerary onOpenTreasureHunt={openTreasureHunt} />}
        {tab === 'group' && <Group />}
        {tab === 'gallery' && <Gallery />}
        {tab === 'logistics' && <Logistics />}
        {tab === 'contact' && <Contact />}
      </div>
    </>
  );
}