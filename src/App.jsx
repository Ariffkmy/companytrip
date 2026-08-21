import { useState, useCallback } from 'react';
import schedule from './data/schedule';
import restaurants, { tagColors } from './data/restaurants';
import groupRoster from './data/groupRoster';
import TreasureHunt from './components/TreasureHunt';

const KANJI = ['壱', '弐', '参', '肆', '伍'];

const TABS = [
  { id: 'itinerary', label: '🗓️ Itinerary' },
  { id: 'restaurants', label: '🍽️ Restaurants' },
  { id: 'logistics', label: '🚆 Logistics' },
  { id: 'group', label: '👥 Group' },
  { id: 'contact', label: '📞 Contact' },
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
  const [open, setOpen] = useState(i === 0); // first open by default

  const isSpecial = act.time === '🎯';
  const cls = `activity-item${isSpecial ? ' special' : ''}`;
  const timeDisplay = isSpecial ? (
    <span style={{ fontSize: 20 }}>🎯</span>
  ) : (
    act.time
  );

  return (
    <div className={cls}>
      <div className={`activity-card${open ? ' open' : ''}`}>
        <button
          className="activity-toggle"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          type="button"
        >
          <span className="activity-time">{timeDisplay}</span>
          <span className="activity-title">{act.activity}</span>
          <span className="activity-chevron">▶</span>
        </button>
        <div className="activity-details">
          <p className="activity-place">{act.place}</p>
          <p>{act.note}</p>
        </div>
      </div>
    </div>
  );
}

/* ── DayPanel ──────────────────────────────────────── */
function DayPanel({ day, index, active, onOpenTreasureHunt }) {
  if (!active) return null;

  return (
    <div className={`day-panel${active ? ' on' : ''}`}>
      {/* Treasure hunt button for Day 4 */}
      {index === 3 && (
        <button
          className="treasure-btn"
          onClick={onOpenTreasureHunt}
          type="button"
          style={{ border: 0, width: '100%' }}
        >
          <span className="treasure-icon">🗺️</span>
          <span><em>Atami</em> Treasure Hunt</span>
        </button>
      )}

      <div className="activity-timeline">
        {day.activities.map((act, i) => (
          <ActivityCard key={i} act={act} i={i} />
        ))}
      </div>

      {/* Prep cards */}
      <div className="prep-grid">
        <div className="prep-card participant">
          <h4>🎒 Participants</h4>
          <ul>
            {day.participantPrep.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="prep-card committee">
          <h4>📋 Committee</h4>
          <ul>
            {day.committeePrep.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Stamp count */}
      {index === 3 && (
        <div className="rally">
          <b>Atami Treasure Hunt</b>
          <p>5 checkpoints · 90 minutes · All downhill station to sea</p>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 10 }}>
            {KANJI.map((k, i) => (
              <div
                key={i}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  border: `2px dashed #B9AF97`,
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: '#B9AF97',
                }}
              >
                {i + 1}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, marginTop: 8 }}>Open the hunt above to begin.</p>
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
      <div className="hero" style={{ paddingTop: 0 }}>
        <div className="kana">熱海 · 社員旅行</div>
        <div className="big" style={{ marginTop: 6 }}>
          OLC<em>Company Trip</em>
        </div>
        <div className="rule" />
        <p className="note">Yokohama → Kamakura → Atami · 22–26 Okt 2026 · 30 pax</p>
      </div>

      {/* Day tabs */}
      <div className="day-tabs" role="tablist">
        {schedule.map((d, i) => (
          <button
            key={i}
            className={`day-tab${i === activeDay ? ' on' : ''}`}
            onClick={() => setActiveDay(i)}
            role="tab"
            aria-selected={i === activeDay}
            type="button"
          >
            <b>{d.day}</b>
            <span>{d.label}</span>
          </button>
        ))}
      </div>

      {/* Day panels */}
      {schedule.map((day, i) => (
        <DayPanel key={i} day={day} index={i} active={i === activeDay} onOpenTreasureHunt={onOpenTreasureHunt} />
      ))}
    </section>
  );
}

/* ── Restaurants ───────────────────────────────────── */
function Restaurants() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [openDetails, setOpenDetails] = useState({});

  const toggleDetail = (name) => {
    setOpenDetails((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const filtered = restaurants.filter((r) => {
    const catMatch = filter === 'all' || r.tags.includes(filter);
    const q = search.toLowerCase().trim();
    const textMatch =
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.city.toLowerCase().includes(q) ||
      r.note.toLowerCase().includes(q);
    return catMatch && textMatch;
  });

  const cities = [...new Set(restaurants.map((r) => r.city))];

  return (
    <section>
      <div className="hero" style={{ paddingTop: 0 }}>
        <div className="kana">食べ物</div>
        <div className="big" style={{ fontSize: 'clamp(32px, 10vw, 48px)', marginTop: 6 }}>
          Restaurant<em>Directory</em>
        </div>
        <div className="rule" />
      </div>

      <div className="filters">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')} type="button">All</button>
        <button className={filter === 'halal' ? 'on' : ''} onClick={() => setFilter('halal')} type="button">🟢 Halal</button>
        <button className={filter === 'pork' ? 'on' : ''} onClick={() => setFilter('pork')} type="button">🟡 Pork-Free</button>
        <button className={filter === 'muslim' ? 'on' : ''} onClick={() => setFilter('muslim')} type="button">🔵 Muslim-Friendly</button>
        <button className={filter === 'group' ? 'on' : ''} onClick={() => setFilter('group')} type="button">🟣 30 Pax</button>
      </div>

      <input
        className="search-input"
        placeholder="🔍 Search restaurant name / city / cuisine..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {cities.map((city) => {
        const cityRestos = filtered.filter((r) => r.city === city);
        if (cityRestos.length === 0) return null;
        return (
          <div key={city}>
            <div className="city-header">{city === 'Atami' ? '🌊' : city === 'Yokohama' ? '🌃' : '⛩️'} {city}</div>
            {cityRestos.map((r) => (
              <div key={r.name} className="restaurant-card">
                <div className="restaurant-head">
                  <h3>{r.name}</h3>
                  <a
                    className="maps-btn"
                    href={`https://www.google.com/maps/search/?api=1&query=${r.maps}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Maps ↗
                  </a>
                </div>
                {r.tags.length > 0 && (
                  <div className="restaurant-tags">
                    {r.tags.map((t) => {
                      const tc = tagColors[t];
                      return tc ? (
                        <span
                          key={t}
                          className="tag"
                          style={{
                            background: tc.bg,
                            color: tc.color,
                            border: `1px solid ${tc.border}`,
                          }}
                        >
                          {tc.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
                <div className="restaurant-body">
                  <p>{r.note}</p>
                  {r.address && <p className="restaurant-meta">📍 {r.address}</p>}
                </div>
                {r.phone && (
                  <p className="restaurant-phone">
                    📞 {r.phone}
                    <button className="copy-btn" onClick={() => copyText(r.phone)} type="button">
                      Copy
                    </button>
                  </p>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

/* ── Logistics ─────────────────────────────────────── */
function Logistics() {
  return (
    <section>
      <div className="hero" style={{ paddingTop: 0 }}>
        <div className="kana">ロジスティクス</div>
        <div className="big" style={{ fontSize: 'clamp(32px, 10vw, 48px)', marginTop: 6 }}>
          Logistics<em>&amp; Tips</em>
        </div>
        <div className="rule" />
      </div>

      <div className="card flag">
        <div className="eyebrow" style={{ color: 'var(--red)', marginBottom: 8 }}>🚆 Transport</div>
        <table className="data-table">
          <thead>
            <tr><th>Route</th><th>Time</th><th>Cost</th></tr>
          </thead>
          <tbody>
            <tr><td>Tokyo → Yokohama</td><td>~30–90 min</td><td>~¥500–3,000</td></tr>
            <tr><td>Yokohama ↔ Kamakura</td><td>~25 min (JR Yokosuka)</td><td>~¥330</td></tr>
            <tr><td>Kamakura → Atami</td><td>~1h 20min (via Ofuna)</td><td>~¥1,900</td></tr>
            <tr><td>Atami → Tokyo</td><td>40–50 min (Shinkansen)</td><td>~¥4,000</td></tr>
          </tbody>
        </table>
        <p className="note" style={{ marginTop: 10 }}>
          💡 <b>7-day JR Pass (~¥50,000) NOT worth it</b> — buy regular tickets + Suica/IC. Atami 1-Day Pass (¥800) = bus + discounts.
        </p>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ color: 'var(--gold)', marginBottom: 8 }}>🌦️ Weather — October</div>
        <p>15–22°C — comfortable, cool at night. <b>Bring a jacket.</b> Autumn colours start. Fireworks night: warm clothes + top up Suica early.</p>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ color: 'var(--red)', marginBottom: 8 }}>📅 Early Booking — Required!</div>
        <ul style={{ paddingLeft: 18, lineHeight: 1.8, fontSize: 13 }}>
          <li><b>Atami ryokan on 25 Oct</b> — fireworks night, fills up fast. For halal: <b>ATAMI Sekaie</b>.</li>
          <li><b>30-person venues</b> — Khazana / Cinta Jawa (charter) / Sekaie — reserve immediately.</li>
          <li>Hachinoki shojin lunch &amp; Cup Noodles Museum (make-your-own) — reserve ahead.</li>
        </ul>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ color: 'var(--gold)', marginBottom: 8 }}>💰 Estimated Budget / Person</div>
        <table className="data-table">
          <thead>
            <tr><th>Item</th><th>Cost</th></tr>
          </thead>
          <tbody>
            <tr><td>Casual meals</td><td>¥1,000–3,000</td></tr>
            <tr><td>Group dinner course</td><td>¥2,500–6,000</td></tr>
            <tr><td>Ryokan + kaiseki (Sekaie)</td><td>¥15,000–30,000/night</td></tr>
            <tr><td>Transport (overall)</td><td>~¥10,000–12,000</td></tr>
            <tr><td>AirAsia X round trip</td><td>~RM2,200–2,700 (base)</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card flag">
        <div className="eyebrow" style={{ color: 'var(--red)', marginBottom: 8 }}>✈️ AirAsia X — KUL ↔ Haneda</div>
        <table className="data-table">
          <thead>
            <tr><th>Route</th><th>Flight</th><th>Schedule</th></tr>
          </thead>
          <tbody>
            <tr><td>KUL → HND</td><td><b>D7522</b></td><td>14:10 → 22:35 (summer) / 14:50 → 22:40 (winter)</td></tr>
            <tr><td>HND → KUL</td><td><b>D7523</b></td><td>23:50 → 06:15+1 (summer) / 23:55 → 06:50+1 (winter)</td></tr>
          </tbody>
        </table>
        <p className="note" style={{ marginTop: 10 }}>
          ⚠️ Trip 22 Oct — likely summer schedule. Arrive HND 22:35 → hotel check-in (30–45 min to Yokohama).
        </p>
      </div>
    </section>
  );
}

/* ── Group ──────────────────────────────────────────── */
function Group() {
  const [openGroups, setOpenGroups] = useState([0]);

  const toggleGroup = (idx) => {
    setOpenGroups((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  return (
    <section>
      <div className="hero" style={{ paddingTop: 0 }}>
        <div className="kana">グループ</div>
        <div className="big" style={{ fontSize: 'clamp(32px, 10vw, 48px)', marginTop: 6 }}>
          Group<em>Roster</em>
        </div>
        <div className="rule" />
      </div>

      <p className="note" style={{ marginBottom: 14 }}>
        5 groups of ~5–6 pax. Each group has a leader. Total: 24 members + committee.
      </p>

      {groupRoster.map((g, gi) => (
        <div key={g.id} className="group-card">
          <details
            open={openGroups.includes(gi)}
            onToggle={() => toggleGroup(gi)}
          >
            <summary>
              {g.name}
              <span className="group-count">{g.leader ? 1 + g.members.length : g.members.length} pax</span>
              <span className="arrow">▶</span>
            </summary>
            <div className="group-body">
              {g.leader && (
                <div className="person-row">
                  <div>
                    <span className="person-name">{g.leader.name}</span>
                    <span className="person-role">Leader</span>
                  </div>
                  <span className="person-phone">
                    {g.leader.phone}
                    <button className="copy-btn" onClick={() => copyText(g.leader.phone)} type="button">
                      Copy
                    </button>
                  </span>
                </div>
              )}
              {g.members.map((m, mi) => (
                <div key={mi} className="person-row">
                  <span className="person-name">{m.name}</span>
                  <span className="person-phone">
                    {m.phone}
                    <button className="copy-btn" onClick={() => copyText(m.phone)} type="button">
                      Copy
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </details>
        </div>
      ))}
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
      <div className="hero" style={{ paddingTop: 0 }}>
        <div className="kana">連絡先</div>
        <div className="big" style={{ fontSize: 'clamp(32px, 10vw, 48px)', marginTop: 6 }}>
          Contact<em>Numbers</em>
        </div>
        <div className="rule" />
      </div>

      <div className="card flag">
        <div className="eyebrow" style={{ color: 'var(--red)', marginBottom: 8 }}>📞 Call / WhatsApp</div>
        <table className="data-table contact-table">
          <thead>
            <tr><th>Venue</th><th>City</th><th>Phone</th></tr>
          </thead>
          <tbody>
            {contacts.map((c, i) => (
              <tr key={i}>
                <td><b>{c.venue}</b></td>
                <td>{c.city}</td>
                <td className="phone-num">
                  {c.phone}
                  <button className="copy-btn" onClick={() => copyText(c.phone)} type="button">
                    Copy
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── App ────────────────────────────────────────────── */
export default function App() {
  const [tab, setTab] = useState('itinerary');
  const [treasureOpen, setTreasureOpen] = useState(false);

  const openTreasureHunt = useCallback(() => {
    setTreasureOpen(true);
  }, []);

  const closeTreasureHunt = useCallback(() => {
    setTreasureOpen(false);
  }, []);

  if (treasureOpen) {
    return (
      <>
        <header className="app-header">
          <div className="hbar">
            <div className="hteam">
              <div className="nm">Orangeleaf · 2026</div>
              <div className="sub">ATAMI · YOKOHAMA · KAMAKURA</div>
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--gold)', lineHeight: 1 }}>
              30<span style={{ fontFamily: 'var(--mono)', fontSize: 9, display: 'block', color: '#A9B6C1', letterSpacing: '.1em' }}>PAX</span>
            </div>
          </div>
        </header>
        <div className="shell">
          <TreasureHunt onClose={closeTreasureHunt} />
        </div>
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="app-header">
        <div className="hbar">
          <div className="hteam">
            <div className="nm">Orangeleaf · 2026</div>
            <div className="sub">ATAMI · YOKOHAMA · KAMAKURA</div>
          </div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--gold)', lineHeight: 1 }}>
            30<span style={{ fontFamily: 'var(--mono)', fontSize: 9, display: 'block', color: '#A9B6C1', letterSpacing: '.1em' }}>PAX</span>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <nav className="tab-nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="shell">
        {tab === 'itinerary' && <Itinerary onOpenTreasureHunt={openTreasureHunt} />}
        {tab === 'restaurants' && <Restaurants />}
        {tab === 'logistics' && <Logistics />}
        {tab === 'group' && <Group />}
        {tab === 'contact' && <Contact />}
      </div>
    </>
  );
}