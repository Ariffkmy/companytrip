import { useState, useRef, useEffect, useCallback } from 'react';

/* ═══════════════════════════════════════════════════
   Atami Treasure Hunt — Embedded Stamp Rally Game
   ═══════════════════════════════════════════════════ */

const KANJI = ['壱', '弐', '参', '肆', '伍'];

const CONFIG = {
  raceMinutes: 90,
  points: { checkpoint: 10, quizPerAnswer: 2 },

  route: [
    { tag: 'START', name: 'Atami Station plaza', job: 'Briefing, teams, first clue', walk: '' },
    { tag: '1', name: 'Juraku Hotel forecourt', job: 'Copy the pose', walk: '5 min downhill' },
    { tag: '2', name: 'Sakimicho slope', job: 'Find the spot, then the riddle', walk: '5 min' },
    { tag: '3', name: 'Jacaranda Promenade', job: 'Buy it, try it', walk: '8 min' },
    { tag: '4', name: 'Itokawa Promenade', job: 'Look around you', walk: '5 min' },
    { tag: '5', name: 'Atami Water Park seafront', job: 'Team cheer', walk: '6 min' },
    { tag: 'END', name: 'Sun Beach steps', job: 'Scores, videos, winners', walk: '3 min north' },
  ],

  teams: [
    { id: 't1', name: 'Team Ume', colour: '#DE3B2B',
      pose: { key: 'pyramid', title: 'The Human Pyramid', note: 'Three at the bottom on all fours, the rest climb on. Nobody falls.' },
      spot: { name: 'Sakimicho — detail A', hint: 'Somewhere on the Sakimicho slope. Recce photo goes here.' } },
    { id: 't2', name: 'Team Kinomiya', colour: '#136375',
      pose: { key: 'ninja', title: 'Frozen Ninja', note: 'Everyone mid-air kick, faces deadly serious. Jump on three.' },
      spot: { name: 'Sakimicho — detail B', hint: 'Somewhere on the Sakimicho slope. Recce photo goes here.' } },
    { id: 't3', name: 'Team Sun Beach', colour: '#E9A82C',
      pose: { key: 'nap', title: 'Synchronised Nap', note: 'All asleep standing up, heads on each other\'s shoulders.' },
      spot: { name: 'Sakimicho — detail C', hint: 'Somewhere on the Sakimicho slope. Recce photo goes here.' } },
    { id: 't4', name: 'Team Ropeway', colour: '#5B7F3E',
      pose: { key: 'rocket', title: 'Rocket Launch', note: 'One person crouched as the rocket, everyone else pointing at the sky.' },
      spot: { name: 'Sakimicho — detail D', hint: 'Somewhere on the Sakimicho slope. Recce photo goes here.' } },
    { id: 't5', name: 'Team Hanabi', colour: '#8A4B9E',
      pose: { key: 'wave', title: 'The Frozen Wave', note: 'A five-person wave caught halfway — each person at a different height.' },
      spot: { name: 'Sakimicho — detail E', hint: 'Somewhere on the Sakimicho slope. Recce photo goes here.' } },
  ],

  buy: { budgetYen: 500, brief: 'Something Japanese that nobody on your team has tried before.' },

  quiz: {
    location: 'Itokawa Promenade, by the red bridge',
    questions: [
      { q: 'Something that is red. Name the object.', accept: [] },
      { q: 'Complete the sign: ________ Mart', accept: ['family', 'familymart', 'family mart'] },
      { q: 'Cafe name: ________ Nine Cafe', accept: ['cloud'] },
      { q: 'There are two of these at Jonathan\'s. What?', accept: [] },
      { q: 'Something white and floating.', accept: ['cloud', 'clouds', 'seagull', 'seagulls'] },
    ],
  },

  video: { seconds: 15, maxSeconds: 30 },
  finishPoint: 'Sun Beach — the wide steps down to the sand. Walk north along the promenade, 3 minutes.',
};

/* ── Helper functions ──────────────────────────────── */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]/g, '');

const mmss = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
};

/* ── Pose SVG illustrations ────────────────────────── */

function poseArt(key) {
  const g = 'stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  const head = (x, y, r = 9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor"/>`;
  const art = {
    pyramid: `${head(60, 86)}<path d="M60 95v16M46 111h28M50 111l-8 14M70 111l8 14" ${g}/>
      ${head(180, 86)}<path d="M180 95v16M166 111h28M170 111l-8 14M190 111l8 14" ${g}/>
      ${head(120, 40)}<path d="M120 49v22M120 56l-24-14M120 56l24-14M120 71l-14 20M120 71l14 20" ${g}/>
      <path d="M20 128h200" ${g}/>`,
    ninja: `${head(58, 52)}<path d="M58 61v20M58 66l-22 8M58 66l20-10M58 81l-16 14M58 81l24 4" ${g}/>
      ${head(122, 44)}<path d="M122 53v22M122 58l-24 4M122 58l22-12M122 75l-18 12M122 75l26 0" ${g}/>
      ${head(188, 56)}<path d="M188 65v20M188 70l-22 6M188 70l18-12M188 85l-14 16M188 85l22 6" ${g}/>
      <path d="M20 124h200" stroke-dasharray="10 9" ${g}/>`,
    nap: `${head(70, 54)}<path d="M70 63v30M70 70l-16 12M70 70l18 8M70 93l-10 26M70 93l12 26" ${g}/>
      ${head(120, 48)}<path d="M120 57v34M120 64l-16 10M120 64l16 10M120 91l-9 28M120 91l11 28" ${g}/>
      ${head(170, 54)}<path d="M170 63v30M170 70l-18 8M170 70l16 12M170 93l-12 26M170 93l10 26" ${g}/>
      <text x="196" y="34" font-size="26" fill="currentColor" font-family="serif">z</text>
      <text x="176" y="20" font-size="18" fill="currentColor" font-family="serif">z</text>`,
    rocket: `${head(120, 96, 11)}<path d="M120 107v14M104 118h32" ${g}/>
      ${head(56, 50)}<path d="M56 59v26M56 64l24-22M56 64l-16 12M56 85l-10 26M56 85l12 26" ${g}/>
      ${head(186, 50)}<path d="M186 59v26M186 64l-26-22M186 64l16 12M186 85l-12 26M186 85l10 26" ${g}/>
      <path d="M120 30l-9 22h18z" ${g}/>`,
    wave: `${head(38, 92)}<path d="M38 101v20M38 106l-14 10M38 106l16-14M38 121l-9 12M38 121l11 12" ${g}/>
      ${head(92, 70)}<path d="M92 79v22M92 84l-14 10M92 84l18-16M92 101l-10 14M92 101l12 14" ${g}/>
      ${head(146, 50)}<path d="M146 59v24M146 64l-16 10M146 64l18-18M146 83l-11 16M146 83l13 16" ${g}/>
      ${head(200, 74)}<path d="M200 83v22M200 88l-16 10M200 88l14-16M200 105l-10 14M200 105l12 14" ${g}/>`,
  };
  return `<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg">${art[key] || art.wave}</svg>`;
}

/* ── Stamp slot component ──────────────────────────── */

function StampSlot({ idx, done, now }) {
  return (
    <div className={`slot${done ? ' done' : ''}${now ? ' now' : ''}`}
      style={{
        position: 'relative',
        aspectRatio: 1,
        display: 'grid',
        placeItems: 'center',
      }}>
      <div className="ring" style={{
        position: 'absolute',
        inset: 4,
        border: `2px dashed ${done ? 'transparent' : '#B9AF97'}`,
        borderRadius: '50%',
        ...(now ? { borderStyle: 'solid', borderColor: '#136375', animation: 'breathe 1.8s ease-in-out infinite' } : {}),
      }} />
      <span style={{
        fontFamily: '"DM Mono", monospace',
        fontSize: 11,
        color: now ? '#136375' : '#B9AF97',
        fontWeight: now ? 700 : 400,
        zIndex: 1,
      }}>{idx + 1}</span>
      {done && (
        <div className="stamp" style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          border: '3px double #DE3B2B',
          borderRadius: '50%',
          color: '#DE3B2B',
          fontFamily: '"Zen Kaku Gothic New", sans-serif',
          fontWeight: 900,
          fontSize: 20,
          transform: 'rotate(-9deg)',
          boxShadow: 'inset 0 0 0 2px rgba(222,59,43,.15)',
          background: 'var(--card)',
          zIndex: 2,
          animation: 'slam .45s cubic-bezier(.2,1.5,.4,1) both',
        }}>
          {KANJI[idx]}
        </div>
      )}
    </div>
  );
}

/* ── Staggered entry animation keyframes (injected once) ── */

const styleId = 'treasure-hunt-anim';
if (!document.getElementById(styleId)) {
  const s = document.createElement('style');
  s.id = styleId;
  s.textContent = `
    @keyframes slam {
      0% { transform: scale(2.4) rotate(14deg); opacity: 0; }
      60% { opacity: 1; }
      100% { transform: scale(1) rotate(-9deg); opacity: 1; }
    }
    @keyframes breathe { 50% { transform: scale(1.07); } }
    @keyframes pulse { 50% { opacity: .55; } }
  `;
  document.head.appendChild(s);
}

/* ════════════════════════════════════════════════════════════
   React state store (simple in-memory, persists in localStorage)
   ════════════════════════════════════════════════════════════ */

function loadState(teamId) {
  try {
    const raw = localStorage.getItem('treasure:' + teamId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveState(teamId, state) {
  try { localStorage.setItem('treasure:' + teamId, JSON.stringify(state)); } catch { /* ignore */ }
}

const CP_INDEX = { cp1: 0, cp2a: 1, cp2b: 1, cp3: 2, cp4: 3, cp5: 4 };

const FLOW = [
  { type: 'cp', key: 'cp1' },
  { type: 'unlock', to: 'cp2' },
  { type: 'cp', key: 'cp2a' },
  { type: 'cp', key: 'cp2b' },
  { type: 'unlock', to: 'cp3' },
  { type: 'cp', key: 'cp3' },
  { type: 'unlock', to: 'cp4' },
  { type: 'cp', key: 'cp4' },
  { type: 'unlock', to: 'cp5' },
  { type: 'cp', key: 'cp5' },
  { type: 'finish' },
];

function blankState(team) {
  return {
    teamId: team.id,
    teamName: team.name,
    members: '',
    startedAt: null,
    finishedAt: null,
    stage: 0,
    subs: {},
    bonus: {},
  };
}

function scoreOf(run) {
  let p = 0;
  Object.keys(run.subs).forEach((k) => {
    if (k === 'cp4') {
      p += (run.subs.cp4.correct || 0) * CONFIG.points.quizPerAnswer + CONFIG.points.checkpoint;
    } else {
      p += CONFIG.points.checkpoint;
    }
  });
  Object.values(run.bonus || {}).forEach((v) => (p += v));
  return p;
}

/* ════════════════════════════════════════════════════════════
   Main Game Component
   ════════════════════════════════════════════════════════════ */

export default function TreasureHunt({ onClose }) {
  const [view, setView] = useState('start'); // start | race | done | organizer
  const [S, setS] = useState(null);
  const [draft, setDraft] = useState({});
  const [tick, setTick] = useState(null);
  const [toast, setToast] = useState(null);
  const [, setOrgS] = useState(null); // for organizer bonus toggle

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const handleFile = useCallback(async (file, draftKey) => {
    if (!file) return;
    if (file.type.startsWith('video')) {
      const v = document.createElement('video');
      const url = URL.createObjectURL(file);
      v.preload = 'metadata';
      await new Promise((res, rej) => {
        v.onloadedmetadata = () => {
          setDraft((d) => ({
            ...d,
            [draftKey]: { url, seconds: Math.round(v.duration * 10) / 10, name: file.name, size: file.size },
          }));
          res();
        };
        v.onerror = rej;
        v.src = url;
      });
    } else {
      // compress image
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise((res, rej) => {
        img.onload = () => {
          const max = 760;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          setDraft((d) => ({ ...d, photo: c.toDataURL('image/jpeg', 0.72) }));
          res();
        };
        img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
        img.src = url;
      });
    }
  }, []);

  const save = useCallback((run) => {
    saveState(run.teamId, run);
  }, []);

  // Clock tick
  useEffect(() => {
    if (view !== 'race' && view !== 'done') return;
    if (!S?.startedAt) return;
    const id = setInterval(() => {
      // force re-render to update clock
      setS((prev) => ({ ...prev }));
    }, 1000);
    return () => clearInterval(id);
  }, [view, S?.startedAt]);

  const clockLeft = useCallback(() => {
    if (!S?.startedAt) return CONFIG.raceMinutes * 60;
    const end = S.startedAt + CONFIG.raceMinutes * 60000;
    const now = S.finishedAt || Date.now();
    return Math.max(0, Math.round((now > end ? 0 : end - now) / 1000));
  }, [S]);

  const currentTeam = S ? CONFIG.teams.find((t) => t.id === S.teamId) : null;

  /* ── Render views ──────────────────────────────────── */

  const renderStampRally = () => {
    const doneStamps = new Set(
      Object.keys(S.subs || {}).map((k) => (k === 'cp2a' ? null : CP_INDEX[k])).filter((v) => v != null)
    );
    const curFlow = FLOW[S.stage];
    const nowIdx =
      curFlow?.type === 'cp'
        ? CP_INDEX[curFlow.key]
        : curFlow?.type === 'unlock'
        ? CP_INDEX[curFlow.to + 'a'] ?? CP_INDEX[curFlow.to]
        : -1;

    return (
      <div style={{
        background: 'var(--card)', border: 'var(--line)', borderRadius: 10, boxShadow: 'var(--hard)',
        margin: '12px 0', padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px 10px' }}>
          <b style={{ fontFamily: 'var(--display)', fontSize: 15, letterSpacing: '.06em' }}>Stamp rally</b>
          <span style={{ fontSize: 11, letterSpacing: '.34em', color: 'var(--ink-soft)', fontWeight: 700 }}>スタンプラリー</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <StampSlot key={i} idx={i} done={doneStamps.has(i)} now={!doneStamps.has(i) && i === nowIdx} />
          ))}
        </div>
      </div>
    );
  };

  const renderStartScreen = () => (
    <div>
      <div className="hero" style={{ padding: '16px 0 6px' }}>
        <div className="kana">熱海 · 社員旅行</div>
        <div className="big" style={{ marginTop: 8 }}>Atami<em>Treasure Hunt</em></div>
        <div className="rule" />
        <p className="note">
          Five checkpoints. {CONFIG.raceMinutes} minutes. One stamp each.<br />
          All downhill, station to sea. About 30 minutes of walking.
        </p>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ color: 'var(--red)' }}>The walk</div>
        <ol className="route" style={{ marginTop: 10 }}>
          {CONFIG.route.map((r, i) => (
            <li key={i}>
              <span className={`rt${r.tag === 'START' || r.tag === 'END' ? ' st' : ''}`}>{r.tag}</span>
              <span className="rn">
                <b>{esc(r.name)}</b>
                <small>{esc(r.job)}</small>
              </span>
              {r.walk && <span className="rw">{esc(r.walk)}</span>}
            </li>
          ))}
        </ol>
        <p className="note" style={{ margin: '12px 0 0' }}>Each stop unlocks the next. Nobody gets the whole list up front.</p>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ color: 'var(--red)' }}>Step 1</div>
        <h2 className="display" style={{ fontSize: 24, margin: '4px 0 12px' }}>Pick your team</h2>
        <div style={{ display: 'grid', gap: 9 }}>
          {CONFIG.teams.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setDraft((d) => ({ ...d, teamId: t.id }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: 12,
                border: 'var(--line)', borderRadius: 8, background: 'var(--card)',
                cursor: 'pointer', textAlign: 'left', width: '100%', boxShadow: 'var(--hard-sm)',
                ...(draft.teamId === t.id ? { background: 'var(--gold)', boxShadow: 'var(--hard)' } : {}),
              }}
              type="button"
            >
              <span style={{
                width: 30, height: 30, borderRadius: '50%', border: '2px solid var(--ink)',
                display: 'grid', placeItems: 'center', fontWeight: 900, color: '#fff',
                fontSize: 14, background: t.colour, flex: 'none',
              }}>{i + 1}</span>
              <span>
                <b style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: '.03em', display: 'block' }}>{t.name}</b>
                <small style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-soft)' }}>Pose: {t.pose.title}</small>
              </span>
            </button>
          ))}
        </div>
        <label className="f" style={{ marginTop: 14, display: 'block' }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 5 }}>Who's in the team?</span>
          <input
            type="text"
            placeholder="Aisyah, Kenji, Farah, Wei Ling"
            value={draft.members || ''}
            onChange={(e) => setDraft((d) => ({ ...d, members: e.target.value }))}
            style={{
              width: '100%', fontFamily: 'var(--body)', fontSize: 16, padding: '11px 12px',
              border: 'var(--line)', borderRadius: 7, background: 'var(--card)', color: 'var(--ink)',
            }}
          />
        </label>
        <button
          className="btn block"
          style={{ marginTop: 14 }}
          disabled={!draft.teamId}
          onClick={() => {
            const t = CONFIG.teams.find((x) => x.id === draft.teamId);
            const blank = blankState(t);
            blank.members = draft.members || '';
            blank.startedAt = Date.now();
            saveState(blank.teamId, blank);
            setS(blank);
            setDraft({});
            setView('race');
          }}
          type="button"
        >
          Start the clock
        </button>
        <p className="note" style={{ margin: '12px 0 0' }}>Your clock starts the moment you tap. Keep this tab open.</p>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button className="linky" onClick={() => setView('organizer')} type="button">
          Organiser view →
        </button>
      </div>
    </div>
  );

  const renderHeader = () => {
    if (view !== 'race' && view !== 'done') return null;
    const doneCount = Object.keys(S.subs || {}).filter((k) => k !== 'cp2a').length;
    return (
      <div style={{
        position: 'sticky', top: 0, zIndex: 60,
        background: 'var(--ink)', color: 'var(--card)',
        borderBottom: '4px solid var(--red)', margin: '0 -14px', padding: '0 14px',
      }}>
        <div style={{
          maxWidth: 540, margin: '0 auto', padding: '9px 0',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--display)', fontSize: 19, textTransform: 'uppercase',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{S.teamName}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#A9B6C1', letterSpacing: '.1em' }}>
              {doneCount}/5 STAMPS
            </div>
          </div>
          <div style={{
            fontFamily: '"DM Mono", monospace', fontSize: 20, fontWeight: 500,
            padding: '2px 8px', border: '2px solid var(--gold)', color: 'var(--gold)',
            borderRadius: 4,
            ...(clockLeft() <= 300 ? { borderColor: '#DE3B2B', color: '#fff', background: '#DE3B2B', animation: 'pulse 1s infinite' } : {}),
          }}>
            {mmss(clockLeft())}
          </div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--gold)', lineHeight: 1 }}>
            {scoreOf(S)}
            <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 9, display: 'block', color: '#A9B6C1', letterSpacing: '.1em' }}>PTS</span>
          </div>
        </div>
      </div>
    );
  };

  const renderCpHead = (n, title, kana) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
      <div style={{
        flex: 'none', width: 42, height: 42, borderRadius: '50%',
        background: 'var(--ink)', color: 'var(--gold)',
        display: 'grid', placeItems: 'center', fontFamily: 'var(--body)',
        fontWeight: 900, fontSize: 19,
      }}>{KANJI[n - 1]}</div>
      <div>
        <div className="eyebrow" style={{ color: 'var(--red)' }}>Checkpoint {n} of 5</div>
        <h2 className="display" style={{ fontSize: 25, margin: '2px 0 1px' }}>{title}</h2>
        <div className="kana">{kana}</div>
      </div>
    </div>
  );

  const renderShot = (preview, label, sub) => {
    if (preview) {
      return (
        <div style={{ position: 'relative', border: 'var(--line)', borderRadius: 8, overflow: 'hidden', background: 'var(--ink)' }}>
          <img src={preview} alt="" style={{ display: 'block', width: '100%', maxHeight: 340, objectFit: 'contain', background: '#0E1720' }} />
          <button
            onClick={() => setDraft((d) => ({ ...d, photo: null }))}
            style={{
              position: 'absolute', top: 8, right: 8, background: 'var(--card)',
              border: 'var(--line)', borderRadius: 6, padding: '5px 9px',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
            type="button"
          >
            Retake
          </button>
        </div>
      );
    }
    return (
      <label style={{
        display: 'block', width: '100%', border: '3px dashed #B9AF97', borderRadius: 8,
        background: '#F3EEE0', padding: '20px 14px', textAlign: 'center', cursor: 'pointer',
      }}>
        <b style={{ display: 'block', fontFamily: 'var(--display)', fontSize: 17, letterSpacing: '.03em' }}>{label}</b>
        <small style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: 'var(--ink-soft)' }}>{sub}</small>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files[0];
            if (f) handleFile(f, 'photo').catch(() => showToast("That file didn't load. Try another."));
          }}
        />
      </label>
    );
  };

  const renderCp1 = () => {
    const t = currentTeam;
    if (!t) return null;
    return (
      <div className="card flag">
        {renderCpHead(1, 'Copy the pose', 'ポーズを真似ろ')}
        <div className="task">
          <p><b>{esc(t.pose.title)}.</b> {esc(t.pose.note)}</p>
          <p style={{ margin: 0 }}>Everyone in the frame. Ask a stranger to hold the phone if you have to.</p>
        </div>
        <div style={{
          background: 'var(--ink)', padding: '10px 10px 34px', borderRadius: 6,
          position: 'relative', color: 'var(--card)', marginBottom: 14,
        }}>
          <div style={{ background: '#136375', borderRadius: 3, aspectRatio: '3/2', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            <div dangerouslySetInnerHTML={{ __html: poseArt(t.pose.key) }} style={{ width: '78%', height: '78%', color: '#FFFCF4' }} />
          </div>
          <div style={{
            position: 'absolute', left: 12, right: 12, bottom: 9,
            fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#A9B6C1',
            display: 'flex', justifyContent: 'space-between', gap: 8,
          }}>
            <span>REFERENCE — {esc(t.name)}</span>
            <b style={{ color: 'var(--gold)', fontWeight: 500 }}>NO.1</b>
          </div>
        </div>
        {renderShot(draft.photo, 'Add your group photo', 'Camera or gallery · one photo')}
        <button
          className="btn block"
          style={{ marginTop: 14 }}
          disabled={!draft.photo}
          onClick={() => {
            const newS = { ...S };
            newS.subs = { ...(newS.subs || {}), cp1: { photo: draft.photo, at: Date.now() } };
            newS.stage = S.stage + 1;
            saveState(newS.teamId, newS);
            setS(newS);
            setDraft({});
            showToast('Stamp collected.');
          }}
          type="button"
        >
          Send photo
        </button>
        <p className="note" style={{ marginTop: 12 }}>Stuck? The committee is in the WhatsApp group.</p>
      </div>
    );
  };

  const renderCp2a = () => {
    const t = currentTeam;
    if (!t) return null;
    const s = t.spot;
    return (
      <div className="card flag">
        {renderCpHead(2, 'Find the place', '現地で自撮り')}
        <div className="task">
          <p style={{ margin: 0 }}>Work out where this is, go there, and take a team selfie on the spot. The riddle unlocks when the selfie lands.</p>
        </div>
        <div style={{
          background: 'var(--ink)', padding: '10px 10px 34px', borderRadius: 6,
          position: 'relative', color: 'var(--card)', marginBottom: 14,
        }}>
          <div style={{
            background: '#136375', borderRadius: 3, aspectRatio: '3/2',
            display: 'grid', placeItems: 'center', overflow: 'hidden',
          }}>
            <svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" style={{ width: '78%', height: '78%' }}>
              <g stroke="currentColor" strokeWidth="6" fill="none" strokeLinejoin="round">
                <rect x="44" y="46" width="152" height="86" rx="10" />
                <path d="M92 46l12-16h32l12 16" />
                <circle cx="120" cy="90" r="26" />
              </g>
            </svg>
          </div>
          <div style={{
            position: 'absolute', left: 12, right: 12, bottom: 9,
            fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#A9B6C1',
            display: 'flex', justifyContent: 'space-between', gap: 8,
          }}>
            <span>{esc(s.hint)}</span>
            <b style={{ color: 'var(--gold)', fontWeight: 500 }}>NO.2</b>
          </div>
        </div>
        {renderShot(draft.photo, 'Add your selfie', 'Everyone in frame, landmark behind you')}
        <button
          className="btn block"
          style={{ marginTop: 14 }}
          disabled={!draft.photo}
          onClick={() => {
            const newS = { ...S };
            newS.subs = { ...(newS.subs || {}), cp2a: { photo: draft.photo, at: Date.now() } };
            newS.stage = S.stage + 1;
            saveState(newS.teamId, newS);
            setS(newS);
            setDraft({});
            showToast('Selfie in. Riddle unlocked.');
          }}
          type="button"
        >
          Send selfie
        </button>
        <div style={{
          textAlign: 'center', padding: '26px 16px', border: '3px dashed #B9AF97',
          borderRadius: 10, background: '#F3EEE0', marginTop: 14,
        }}>
          <div style={{ fontSize: 30 }}>🔒</div>
          <b style={{ display: 'block', fontFamily: 'var(--display)', fontSize: 17, marginTop: 6 }}>Riddle sealed</b>
          <small style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: 'var(--ink-soft)' }}>Opens after the selfie</small>
        </div>
      </div>
    );
  };

  const renderCp2b = () => (
    <div className="card flag">
      {renderCpHead(2, 'Three switches', 'スイッチの謎')}
      <div className="task">
        <p>You're outside a room with the door shut. On the wall next to you are <b>three switches</b>. Inside the room are <b>three light bulbs</b>, one per switch.</p>
        <p style={{ margin: 0 }}>You may flip the switches as much as you like. You may open the door and go in <b>once</b> — and once you're in, you can't touch the switches again. How do you tell which switch controls which bulb?</p>
      </div>
      <label className="f" style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 5 }}>Your method</span>
        <textarea
          placeholder="Write the steps your team agreed on."
          value={draft.answer || ''}
          onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value }))}
          style={{
            width: '100%', fontFamily: 'var(--body)', fontSize: 16, padding: '11px 12px',
            border: 'var(--line)', borderRadius: 7, background: 'var(--card)', color: 'var(--ink)',
            minHeight: 110, resize: 'vertical', lineHeight: 1.5,
          }}
        />
      </label>
      <button
        className="btn block"
        disabled={(draft.answer || '').trim().length <= 15}
        onClick={() => {
          const newS = { ...S };
          newS.subs = { ...(newS.subs || {}), cp2b: { answer: draft.answer, at: Date.now() } };
          newS.stage = S.stage + 1;
          saveState(newS.teamId, newS);
          setS(newS);
          setDraft({});
          showToast('Answer sent. Stamp 2 collected.');
        }}
        type="button"
      >
        Send answer
      </button>
      <p className="note" style={{ margin: '12px 0 0' }}>Describe the steps — one line won't be enough.</p>
    </div>
  );

  const renderCp3 = () => (
    <div className="card flag">
      {renderCpHead(3, 'Buy it, try it', '買って食べる')}
      <div className="task">
        <p><b>Budget: ¥{CONFIG.buy.budgetYen} for the whole team.</b> {esc(CONFIG.buy.brief)}</p>
        <p style={{ margin: 0 }}>Every member has to taste it. Photo has to show all of you eating or drinking, mid-bite.</p>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <label className="f" style={{ flex: 1, display: 'block' }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 5 }}>What did you buy?</span>
          <input
            type="text"
            placeholder="e.g. ume soft serve"
            value={draft.item || ''}
            onChange={(e) => setDraft((d) => ({ ...d, item: e.target.value }))}
            style={{
              width: '100%', fontFamily: 'var(--body)', fontSize: 16, padding: '11px 12px',
              border: 'var(--line)', borderRadius: 7, background: 'var(--card)', color: 'var(--ink)',
            }}
          />
        </label>
        <label className="f" style={{ flex: 'none', maxWidth: 120, display: 'block' }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 5 }}>Price ¥</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="380"
            value={draft.price || ''}
            onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
            style={{
              width: '100%', fontFamily: 'var(--body)', fontSize: 16, padding: '11px 12px',
              border: 'var(--line)', borderRadius: 7, background: 'var(--card)', color: 'var(--ink)',
            }}
          />
        </label>
      </div>
      {renderShot(draft.photo, 'Add the tasting photo', 'Everyone eating or drinking')}
      <button
        className="btn block"
        style={{ marginTop: 14 }}
        disabled={!draft.photo || !draft.item}
        onClick={() => {
          const newS = { ...S };
          newS.subs = { ...(newS.subs || {}), cp3: { photo: draft.photo, item: draft.item, price: draft.price, at: Date.now() } };
          newS.stage = S.stage + 1;
          saveState(newS.teamId, newS);
          setS(newS);
          setDraft({});
          showToast('Stamp collected.');
        }}
        type="button"
      >
        Send it
      </button>
      <p className="note" style={{ margin: '12px 0 0' }}>Most interesting find takes a bonus stamp at the finish.</p>
    </div>
  );

  const renderCp4 = () => {
    const answers = draft.answers || [];
    return (
      <div className="card flag">
        {renderCpHead(4, 'Look around you', '周りを見ろ')}
        <div className="task">
          <p style={{ margin: 0 }}>Go to <b>{esc(CONFIG.quiz.location)}</b>. Every answer is somewhere in sight. Phones down — this one isn't on the internet.</p>
        </div>
        {CONFIG.quiz.questions.map((q, i) => (
          <label key={i} className="f" style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 5 }}>{i + 1}. {esc(q.q)}</span>
            <input
              type="text"
              placeholder="Your answer"
              value={answers[i] || ''}
              onChange={(e) => {
                const newAnswers = [...answers];
                newAnswers[i] = e.target.value;
                setDraft((d) => ({ ...d, answers: newAnswers }));
              }}
              style={{
                width: '100%', fontFamily: 'var(--body)', fontSize: 16, padding: '11px 12px',
                border: 'var(--line)', borderRadius: 7, background: 'var(--card)', color: 'var(--ink)',
              }}
            />
          </label>
        ))}
        {renderShot(draft.photo, 'Add a photo of the spot', 'Proof you\'re actually standing there')}
        <button
          className="btn block"
          style={{ marginTop: 14 }}
          disabled={answers.filter(Boolean).length !== CONFIG.quiz.questions.length || !draft.photo}
          onClick={() => {
            let correct = 0;
            CONFIG.quiz.questions.forEach((q, i) => {
              if (!q.accept.length) return;
              if (q.accept.some((a) => norm(answers[i]).includes(norm(a)))) correct++;
            });
            const newS = { ...S };
            newS.subs = { ...(newS.subs || {}), cp4: { answers, photo: draft.photo, correct, at: Date.now() } };
            newS.stage = S.stage + 1;
            saveState(newS.teamId, newS);
            setS(newS);
            setDraft({});
            showToast('Stamp collected.');
          }}
          type="button"
        >
          Send answers
        </button>
        <p className="note" style={{ margin: '12px 0 0' }}>{CONFIG.points.quizPerAnswer} points per correct answer, on top of the stamp.</p>
      </div>
    );
  };

  const renderCp5 = () => {
    const v = draft.video;
    return (
      <div className="card flag">
        {renderCpHead(5, 'The team cheer', 'チームコール')}
        <div className="task">
          <p><b>{CONFIG.video.seconds} seconds. One take.</b> Your team cheer — chant, dance, war cry, whatever you invented on the way here.</p>
          <p style={{ margin: 0 }}>Everyone on camera. Say "Atami" once. Loud enough to embarrass yourselves.</p>
        </div>
        {v ? (
          <div>
            <div style={{ position: 'relative', border: 'var(--line)', borderRadius: 8, overflow: 'hidden', background: 'var(--ink)' }}>
              <video src={v.url} controls playsInline style={{ display: 'block', width: '100%', maxHeight: 340, objectFit: 'contain', background: '#0E1720' }} />
              <button
                onClick={() => setDraft((d) => ({ ...d, video: null }))}
                style={{
                  position: 'absolute', top: 8, right: 8, background: 'var(--card)',
                  border: 'var(--line)', borderRadius: 6, padding: '5px 9px',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
                type="button"
              >
                Retake
              </button>
            </div>
            <p className="meta" style={{ marginTop: 8, fontFamily: '"DM Mono", monospace', fontSize: 11, color: 'var(--ink-soft)' }}>
              {v.seconds}s · {(v.size / 1048576).toFixed(1)} MB
              {v.seconds > CONFIG.video.maxSeconds ? ' · <span style="color:var(--red)">over ' + CONFIG.video.maxSeconds + 's</span>' : ''}
            </p>
          </div>
        ) : (
          <label style={{
            display: 'block', width: '100%', border: '3px dashed #B9AF97', borderRadius: 8,
            background: '#F3EEE0', padding: '20px 14px', textAlign: 'center', cursor: 'pointer',
          }}>
            <b style={{ display: 'block', fontFamily: 'var(--display)', fontSize: 17, letterSpacing: '.03em' }}>Add your video</b>
            <small style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: 'var(--ink-soft)' }}>Max {CONFIG.video.maxSeconds} seconds</small>
            <input
              type="file"
              accept="video/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files[0];
                if (f) handleFile(f, 'video').catch(() => showToast("That file didn't load. Try another."));
              }}
            />
          </label>
        )}
        <button
          className="btn block"
          style={{ marginTop: 14 }}
          disabled={!v || v.seconds > CONFIG.video.maxSeconds}
          onClick={() => {
            const newS = { ...S };
            newS.subs = { ...(newS.subs || {}), cp5: { name: v.name, seconds: v.seconds, at: Date.now() } };
            newS.finishedAt = Date.now();
            newS.stage = S.stage + 1;
            saveState(newS.teamId, newS);
            setS(newS);
            setDraft({});
            setView('done');
          }}
          type="button"
        >
          Send video and finish
        </button>
      </div>
    );
  };

  const renderUnlock = (to) => {
    const copy = {
      cp2: {
        h: 'Head down to Sakimicho',
        p: `Keep walking downhill from the hotel. Somewhere on that slope is the thing in the next photo — find it, selfie with it, and the riddle opens. Your photo is different from every other team's, so following them won't help.`,
      },
      cp3: {
        h: 'Down to Jacaranda Promenade',
        p: `Carry on to the promenade and the Ginza shops behind it. ¥${CONFIG.buy.budgetYen} for the team, one thing none of you have tried, everyone tastes it.`,
      },
      cp4: {
        h: 'Cut inland to Itokawa',
        p: `Head to ${CONFIG.quiz.location}. Five questions, every answer within sight. Nothing to google.`,
      },
      cp5: {
        h: 'Last one — back to the sea',
        p: `Walk down to the Water Park seafront and film your cheer with the water behind you. That's the finish: ${CONFIG.finishPoint}`,
      },
    }[to];
    return (
      <div style={{
        background: 'var(--ink)', color: 'var(--card)', borderRadius: 10,
        padding: 20, boxShadow: 'var(--hard)', border: 'var(--line)', marginBottom: 16,
      }}>
        <div className="eyebrow" style={{ color: 'var(--gold)' }}>Stamp collected</div>
        <h2 className="display" style={{ fontSize: 29, margin: '6px 0 10px', textTransform: 'uppercase', lineHeight: 0.95 }}>
          {copy.h}
        </h2>
        <p style={{ color: '#D6DDE3' }}>{esc(copy.p)}</p>
        <button
          className="btn block sea"
          onClick={() => {
            const newS = { ...S };
            newS.stage = S.stage + 1;
            saveState(newS.teamId, newS);
            setS(newS);
          }}
          type="button"
        >
          Open it
        </button>
        <p className="note" style={{ marginTop: 12, color: '#A9B6C1' }}>
          Points so far: {scoreOf(S)}. Time left: {mmss(clockLeft())}.
        </p>
      </div>
    );
  };

  const renderStage = () => {
    if (!S) return null;
    const st = FLOW[S.stage];
    if (!st) return null;
    if (st.type === 'unlock') return renderUnlock(st.to);
    if (st.type === 'finish') {
      // Auto-finish — trigger the done screen
      setTimeout(() => {
        if (view !== 'done') {
          const newS = { ...S };
          newS.finishedAt = Date.now();
          saveState(newS.teamId, newS);
          setS(newS);
          setView('done');
        }
      }, 100);
      return <p className="note" style={{ textAlign: 'center', padding: 20 }}>Finishing...</p>;
    }
    const renderers = { cp1: renderCp1, cp2a: renderCp2a, cp2b: renderCp2b, cp3: renderCp3, cp4: renderCp4, cp5: renderCp5 };
    const fn = renderers[st.key];
    return fn ? fn() : null;
  };

  const renderDoneScreen = () => {
    const rows = [
      ['1', 'Pose photo', CONFIG.points.checkpoint],
      ['2', 'Selfie + riddle', CONFIG.points.checkpoint],
      ['3', 'Buy &amp; try', CONFIG.points.checkpoint],
      ['4', `Observation quiz (${S.subs?.cp4?.correct ?? 0} auto-marked)`, CONFIG.points.checkpoint + (S.subs?.cp4?.correct || 0) * CONFIG.points.quizPerAnswer],
      ['5', 'Team cheer', CONFIG.points.checkpoint],
    ];
    const used = CONFIG.raceMinutes * 60 - clockLeft();
    const doneStamps = new Set(
      Object.keys(S.subs || {}).map((k) => (k === 'cp2a' ? null : CP_INDEX[k])).filter((v) => v != null)
    );
    return (
      <div>
        {renderStampRally()}
        <div className="hero" style={{ padding: '10px 0' }}>
          <div className="big" style={{ fontSize: 'clamp(40px, 13vw, 62px)' }}>All five<em>stamped</em></div>
          <div className="rule" />
        </div>
        <div className="card">
          <div className="eyebrow" style={{ color: 'var(--red)' }}>{esc(S.teamName)}</div>
          <h2 className="display" style={{ fontSize: 22, margin: '4px 0 12px' }}>Finished in {mmss(used)}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rows.map((r, i) => (
              <li key={i} style={{
                display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0',
                borderBottom: '1px dashed #C9C0AA', fontSize: 14,
              }}>
                <span style={{ fontFamily: 'var(--body)', fontWeight: 900, color: 'var(--red)', width: 22 }}>{r[0]}</span>
                <span dangerouslySetInnerHTML={{ __html: r[1] }} />
                <span style={{ marginLeft: 'auto', fontFamily: '"DM Mono", monospace', fontSize: 12 }}>+{r[2]}</span>
              </li>
            ))}
          </ul>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14,
            paddingTop: 12, borderTop: 'var(--line)',
          }}>
            <span className="eyebrow">Running total</span>
            <span className="display" style={{ fontSize: 38, marginLeft: 'auto', color: 'var(--red)' }}>
              {scoreOf(S)}
            </span>
          </div>
          <p className="note" style={{ margin: '12px 0 0' }}>Creativity bonuses get added by the committee at the finish point.</p>
        </div>
        <div style={{
          background: 'var(--ink)', color: 'var(--card)', borderRadius: 10,
          padding: 20, boxShadow: 'var(--hard)', border: 'var(--line)', marginBottom: 16,
        }}>
          <div className="eyebrow" style={{ color: 'var(--gold)' }}>Last thing</div>
          <h2 className="display" style={{ fontSize: 29, margin: '6px 0 10px', textTransform: 'uppercase', lineHeight: 0.95 }}>
            Walk it in
          </h2>
          <p style={{ color: '#D6DDE3' }}>{esc(CONFIG.finishPoint)}</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <button className="linky" onClick={() => setView('organizer')} type="button">Organiser view →</button>
        </div>
      </div>
    );
  };

  const renderOrganizer = () => {
    const allRuns = CONFIG.teams
      .map((t) => loadState(t.id))
      .filter(Boolean)
      .sort((a, b) => scoreOf(b) - scoreOf(a));

    const bonuses = [
      ['photo', 'Best pose photo', 5],
      ['item', 'Most interesting buy', 5],
      ['video', 'Best cheer video', 10],
      ['first', 'First to finish', 5],
    ];

    const handleBonus = (teamId, key, val) => {
      const run = loadState(teamId);
      if (!run) return;
      run.bonus = run.bonus || {};
      if (run.bonus[key]) delete run.bonus[key];
      else run.bonus[key] = val;
      saveState(teamId, run);
      // force re-render
      setOrgS({ ...(orgS || {}), _tick: Date.now() });
    };

    const handleReset = (teamId) => {
      localStorage.removeItem('treasure:' + teamId);
      setOrgS({ ...(orgS || {}), _tick: Date.now() });
    };

    return (
      <div>
        <div className="hero" style={{ padding: '10px 0' }}>
          <div className="big" style={{ fontSize: 'clamp(36px, 12vw, 54px)' }}>Organiser</div>
          <div className="rule" />
        </div>
        {allRuns.length === 0 ? (
          <div className="card">
            <p style={{ margin: 0 }}>No teams have started yet. Once a team taps <b>Start the clock</b>, they show up here.</p>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button className="linky" onClick={() => setView('start')} type="button">← Back to start</button>
            </div>
          </div>
        ) : (
          <div>
            {/* Leaderboard */}
            <div className="card flag">
              <div className="eyebrow" style={{ color: 'var(--red)', marginBottom: 8 }}>Live board</div>
              <table style={{
                width: '100%', borderCollapse: 'collapse', fontSize: 13,
              }}>
                <thead>
                  <tr>
                    <th style={{
                      fontFamily: '"DM Mono", monospace', fontSize: 10, letterSpacing: '.08em',
                      textTransform: 'uppercase', textAlign: 'left', padding: '6px 4px',
                      borderBottom: 'var(--line)',
                    }}>Team</th>
                    <th style={{
                      fontFamily: '"DM Mono", monospace', fontSize: 10, letterSpacing: '.08em',
                      textTransform: 'uppercase', textAlign: 'left', padding: '6px 4px',
                      borderBottom: 'var(--line)',
                    }}>Stamps</th>
                    <th style={{
                      fontFamily: '"DM Mono", monospace', fontSize: 10, letterSpacing: '.08em',
                      textTransform: 'uppercase', textAlign: 'left', padding: '6px 4px',
                      borderBottom: 'var(--line)',
                    }}>Time</th>
                    <th style={{
                      fontFamily: '"DM Mono", monospace', fontSize: 10, letterSpacing: '.08em',
                      textTransform: 'uppercase', textAlign: 'right', padding: '6px 4px',
                      borderBottom: 'var(--line)',
                    }}>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {allRuns.map((run, i) => {
                    const done = new Set(
                      Object.keys(run.subs || {}).map((k) => (k === 'cp2a' ? null : CP_INDEX[k])).filter(Boolean)
                    );
                    const left = run.startedAt
                      ? Math.max(0, Math.round(((run.startedAt + CONFIG.raceMinutes * 60000) - (run.finishedAt || Date.now())) / 1000))
                      : 0;
                    return (
                      <tr key={i}>
                        <td style={{ padding: '8px 4px', borderBottom: '1px dashed #C9C0AA', verticalAlign: 'middle' }}>
                          <b style={{ fontFamily: 'var(--body)', fontSize: 13 }}>{run.teamName}</b>
                          <br /><span className="note">{run.members || '—'}</span>
                        </td>
                        <td style={{ padding: '8px 4px', borderBottom: '1px dashed #C9C0AA', verticalAlign: 'middle' }}>
                          {[0, 1, 2, 3, 4].map((si) => (
                            <span key={si} style={{
                              display: 'inline-block', width: 13, height: 13, borderRadius: '50%',
                              border: '2px solid var(--ink)', marginRight: 3,
                              background: done.has(si) ? 'var(--red)' : '#EFE9DA',
                            }} />
                          ))}
                        </td>
                        <td style={{ padding: '8px 4px', borderBottom: '1px dashed #C9C0AA', verticalAlign: 'middle', fontFamily: '"DM Mono", monospace', fontSize: 11, color: 'var(--ink-soft)' }}>
                          {run.finishedAt ? 'DONE' : mmss(left)}
                        </td>
                        <td style={{ padding: '8px 4px', borderBottom: '1px dashed #C9C0AA', verticalAlign: 'middle', textAlign: 'right' }}>
                          <b className="display" style={{ fontSize: 20 }}>{scoreOf(run)}</b>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Team panels */}
            {allRuns.map((run, i) => {
              const s = run.subs || {};
              const imgs = [s.cp1?.photo, s.cp2a?.photo, s.cp3?.photo, s.cp4?.photo].filter(Boolean);
              return (
                <div key={i} className="card">
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <b className="display" style={{ fontSize: 20 }}>{esc(run.teamName)}</b>
                    <span className="note" style={{ marginLeft: 'auto' }}>{Object.keys(s).filter((k) => k !== 'cp2a').length}/5</span>
                  </div>
                  {imgs.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8, marginTop: 10 }}>
                      {imgs.map((img, ii) => <img key={ii} src={img} alt="" style={{ width: '100%', aspectRatio: 1, objectFit: 'cover', border: 'var(--line)', borderRadius: 6 }} />)}
                    </div>
                  )}
                  {s.cp2b && <p className="note" style={{ marginTop: 12 }}>RIDDLE — {esc(s.cp2b.answer).slice(0, 220)}</p>}
                  {s.cp3 && <p className="note">BOUGHT — {esc(s.cp3.item)} · ¥{esc(s.cp3.price || '?')}</p>}
                  {s.cp4 && <p className="note">QUIZ — {s.cp4.answers.map((a, ai) => `${ai + 1}. ${esc(a)}`).join(' · ')} <span className="tag" style={{
                    background: s.cp4.correct ? 'rgba(143,190,126,.3)' : '#DCD3BE',
                    color: s.cp4.correct ? '#2f6b1f' : 'var(--ink-soft)',
                  }}>{s.cp4.correct} auto-marked</span></p>}
                  {s.cp5 && <p className="note">VIDEO — {esc(s.cp5.name)} · {s.cp5.seconds}s (held on the team's phone)</p>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
                    {bonuses.map((b) => (
                      <button
                        key={b[0]}
                        className="mini"
                        style={run.bonus?.[b[0]] ? { background: 'var(--gold)' } : {}}
                        onClick={() => handleBonus(run.teamId, b[0], b[2])}
                        type="button"
                      >
                        {b[1]} +{b[2]}
                      </button>
                    ))}
                    <button
                      className="mini"
                      style={{ marginLeft: 'auto', color: 'var(--red)' }}
                      onClick={() => handleReset(run.teamId)}
                      type="button"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              );
            })}

            <div style={{ textAlign: 'center' }}>
              <button className="linky" onClick={() => setView('start')} type="button">← Back to start</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ── Main render ──────────────────────────────────── */

  return (
    <div style={{ position: 'relative', minHeight: 300 }}>
      {/* Close button */}
      <div style={{ position: 'sticky', top: 0, zIndex: 70, display: 'flex', justifyContent: 'flex-end', padding: '6px 0' }}>
        <button
          onClick={onClose}
          className="mini"
          style={{ background: 'var(--ink)', color: 'var(--card)', border: '2px solid var(--red)' }}
          type="button"
        >
          ← Back to Day 4
        </button>
      </div>

      {renderHeader()}

      {view === 'start' && renderStartScreen()}
      {view === 'race' && (
        <div>
          {renderStampRally()}
          {renderStage()}
        </div>
      )}
      {view === 'done' && renderDoneScreen()}
      {view === 'organizer' && renderOrganizer()}

      {/* Toast */}
      {toast && (
        <div className="toast">{toast}</div>
      )}
    </div>
  );
}