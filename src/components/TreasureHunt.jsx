import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { toRuntime, withDefaults } from '../lib/huntConfig';
import { tileAccess, fetchCard, previewCard, listShots, uploadShot, deleteShot } from '../lib/bingo';

/* ═══════════════════════════════════════════════════
   Atami Treasure Hunt — Embedded Stamp Rally Game
   ═══════════════════════════════════════════════════ */

const KANJI = ['壱', '弐', '参', '肆', '伍', '陸', '漆', '捌'];

/* 3x3 bingo card — rows, columns, diagonals */
const BINGO_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

/* ── Helper functions ──────────────────────────────── */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]/g, '');

/* Downscale to a JPEG data URL. Preview bingo tiles pass a smaller max/quality. */
function compressImage(file, max = 760, quality = 0.72) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}

const mmss = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
};

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
        border: `2px dashed ${done ? 'transparent' : 'var(--th-dash)'}`,
        borderRadius: '50%',
        ...(now ? { borderStyle: 'solid', borderColor: 'var(--sea)', animation: 'breathe 1.8s ease-in-out infinite' } : {}),
      }} />
      <span style={{
        fontFamily: '"DM Mono", monospace',
        fontSize: 11,
        color: now ? 'var(--sea)' : 'var(--th-dash)',
        fontWeight: now ? 700 : 400,
        zIndex: 1,
      }}>{idx + 1}</span>
      {done && (
        <div className="stamp" style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          border: '3px double var(--red)',
          borderRadius: '50%',
          color: 'var(--red)',
          fontFamily: '"Zen Kaku Gothic New", sans-serif',
          fontWeight: 900,
          fontSize: 20,
          transform: 'rotate(-9deg)',
          boxShadow: 'inset 0 0 0 2px var(--th-stamp-glow)',
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

/* Where team runs are kept. The real hunt persists to localStorage on
   the phone; an admin preview lives only in memory, so trying the game
   never touches a real team's run. */
function makeStore(preview) {
  if (preview) {
    const mem = new Map();
    return {
      load: (teamId) => (mem.has(teamId) ? structuredClone(mem.get(teamId)) : null),
      save: (teamId, state) => { mem.set(teamId, structuredClone(state)); return true; },
      remove: (teamId) => { mem.delete(teamId); },
    };
  }
  return {
    load(teamId) {
      try {
        const raw = localStorage.getItem('treasure:' + teamId);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },
    save(teamId, state) {
      try {
        localStorage.setItem('treasure:' + teamId, JSON.stringify(state));
        return true;
      } catch {
        return false; // quota — the caller decides whether to say so
      }
    },
    remove(teamId) {
      try { localStorage.removeItem('treasure:' + teamId); } catch { /* ignore */ }
    },
  };
}

/* Admin-written text: blank line = paragraph, **stars** = bold. */
function Rich({ text, lead }) {
  const paras = String(text ?? '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  if (lead) paras[0] = `**${lead}** ${paras[0] ?? ''}`.trim();
  return paras.map((para, i) => (
    <p key={i}>
      {para.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
        /^\*\*[^*]+\*\*$/.test(chunk) ? <b key={j}>{chunk.slice(2, -2)}</b> : chunk
      )}
    </p>
  ));
}

/* Optional admin-supplied photo shown under a checkpoint's instructions. */
function CheckpointPhoto({ src }) {
  if (!src) return null;
  return (
    <img src={src} alt="" style={{
      display: 'block', width: '100%', maxHeight: 360, objectFit: 'cover',
      border: 'var(--line)', borderRadius: 8, marginBottom: 14,
    }} />
  );
}

/* Stamp slot each submission fills. The cheer keeps its own key rather
   than a number so the display order stays readable when it moved last. */
let ANSWERS = null;

function loadAnswers() {
  if (!ANSWERS) {
    try { ANSWERS = JSON.parse(localStorage.getItem('treasure:answers')) || {}; }
    catch { ANSWERS = {}; }
  }
  return ANSWERS;
}

function saveAnswers(next) {
  ANSWERS = next;
  try { localStorage.setItem('treasure:answers', JSON.stringify(next)); } catch { /* ignore */ }
}

const SLOTS = Array.from({ length: 8 }, (_, i) => i);

/* Photo bingo is its own game and comes first; the stamp rally follows. */
const CP_INDEX = { bingo: 0, cp1: 1, cp2a: 2, cp2b: 2, cp3: 3, cp4: 4, ask: 5, guess: 6, cheer: 7 };
const CP_NUM = Object.fromEntries(Object.entries(CP_INDEX).map(([k, v]) => [k, v + 1]));

/* Label for each FLOW step, shown in the admin preview's jump menu. */
function flowLabel(step, cp) {
  const n = CP_NUM;
  if (step.type === 'unlock') {
    const key = step.to === 'cp2' ? 'cp2a' : step.to;
    return `Unlock screen → ${n[key]}`;
  }
  if (step.type === 'finish') return 'Finish';
  return `${n[step.key]}. ${cp[step.key]?.title ?? step.key}`;
}

const FLOW = [
  { type: 'cp', key: 'bingo' },
  { type: 'unlock', to: 'cp1' },
  { type: 'cp', key: 'cp1' },
  { type: 'unlock', to: 'cp2' },
  { type: 'cp', key: 'cp2a' },
  { type: 'cp', key: 'cp2b' },
  { type: 'unlock', to: 'cp3' },
  { type: 'cp', key: 'cp3' },
  { type: 'unlock', to: 'cp4' },
  { type: 'cp', key: 'cp4' },
  { type: 'unlock', to: 'ask' },
  { type: 'cp', key: 'ask' },
  { type: 'unlock', to: 'guess' },
  { type: 'cp', key: 'guess' },
  { type: 'unlock', to: 'cheer' },
  { type: 'cp', key: 'cheer' },
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

function askPoints(sub, CONFIG) {
  if (!sub) return 0;
  return CONFIG.ask.tasks.reduce((n, t) => n + (String(sub[t.key] || '').trim() ? t.pts : 0), 0);
}

function bingoPoints(tiles, CONFIG) {
  const filled = (i) => !!(tiles || {})[i];
  const n = Array.from({ length: CONFIG.bingo.size }).reduce((acc, _, i) => acc + (filled(i) ? 1 : 0), 0);
  let p = n;
  p += BINGO_LINES.filter((line) => line.every(filled)).length * CONFIG.bingo.linePts;
  if (n === CONFIG.bingo.size) p += CONFIG.bingo.fullPts;
  return p;
}

/* Closeness scoring — a wrong answer still pays if it is in the region.
   Unanswered by the committee means unmarked, not zero. */
function guessScore(guess, truth, CONFIG) {
  const g = Number(guess);
  const t = Number(truth);
  if (guess === '' || guess == null || truth === '' || truth == null) return 0;
  if (!isFinite(g) || !isFinite(t) || t <= 0) return 0;
  if (g === t) return CONFIG.guess.exactPts;
  const off = Math.abs(g - t) / t;
  if (off <= 0.10) return CONFIG.guess.nearPts;
  if (off <= 0.25) return CONFIG.guess.closePts;
  return 0;
}

function guessPoints(sub, CONFIG) {
  if (!sub) return 0;
  const truths = loadAnswers();
  return CONFIG.guess.questions.reduce((n, _, i) => n + guessScore((sub.answers || [])[i], truths[i], CONFIG), 0);
}

function scoreOf(run, CONFIG) {
  let p = 0;
  Object.keys(run.subs).forEach((k) => {
    const sub = run.subs[k];
    p += CONFIG.points.checkpoint;
    if (k === 'cp4') p += (sub.correct || 0) * CONFIG.points.quizPerAnswer;
    else if (k === 'ask') p += askPoints(sub, CONFIG);
    else if (k === 'bingo') p += sub.points || 0;
    else if (k === 'guess') p += guessPoints(sub, CONFIG);
  });
  Object.values(run.bonus || {}).forEach((v) => (p += v));
  return p;
}

/* ════════════════════════════════════════════════════════════
   Main Game Component
   ════════════════════════════════════════════════════════════ */

/* `me` is the signed-in member: { email, team, role, isAdmin }. */
export default function TreasureHunt({ onClose, teamId, me, config, preview = false }) {
  const CONFIG = useMemo(() => toRuntime(config ?? withDefaults(null)), [config]);
  const store = useMemo(() => makeStore(preview), [preview]);
  /* Preview only: which team the admin is playing as. */
  const [previewTeam, setPreviewTeam] = useState(teamId ?? 'team-ruby');
  const activeTeamId = preview ? previewTeam : teamId;
  const [view, setView] = useState('start'); // start | race | done | organizer
  const [S, setS] = useState(null);
  const [draft, setDraft] = useState({});
  const [tick, setTick] = useState(null);
  const [toast, setToast] = useState(null);
  const [, setOrgS] = useState(null); // for organizer bonus toggle
  /* Shared bingo card for the active team: { [tile]: shot }. Preview keeps
     its shots in memory and plays as the team's lead. */
  const [shots, setShots] = useState({});
  const [assignees, setAssignees] = useState({});
  const [allShots, setAllShots] = useState([]);
  const [busyTile, setBusyTile] = useState(null);
  const [coverTile, setCoverTile] = useState(null);
  const [bingoMissing, setBingoMissing] = useState(null);
  const [bingoChecking, setBingoChecking] = useState(false);
  /* Scores and times are for the committee only. */
  const canOrganise = preview || !!me?.isAdmin;
  const player = preview ? { email: '', team: activeTeamId, role: 'Team Lead', isAdmin: false } : me;

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
      const dataUrl = await compressImage(file);
      setDraft((d) => ({ ...d, photo: dataUrl }));
    }
  }, []);

  const save = useCallback((run) => {
    store.save(run.teamId, run);
  }, []);

  const currentTeam = S ? CONFIG.teams.find((t) => t.id === S.teamId) : null;
  const bingoCard = CONFIG.teams.find((t) => t.id === activeTeamId)?.bingo ?? [];

  /* Teammates fill tiles from their own phones — keep the card fresh
     while it can be seen. */
  /* Resolves to the fresh { [tile]: shot }, or null when offline. */
  const refreshShots = useCallback(async () => {
    if (preview || !activeTeamId) return null;
    try {
      const [card, rows] = await Promise.all([fetchCard(activeTeamId), listShots(activeTeamId)]);
      const next = Object.fromEntries(rows.map((r) => [r.tile, r]));
      setAssignees(card);
      setShots(next);
      return next;
    } catch { return null; /* offline — keep what is on screen */ }
  }, [preview, activeTeamId]);

  useEffect(() => {
    if (preview) { setShots({}); setAssignees(previewCard(activeTeamId)); return undefined; }
    if (view !== 'start' && view !== 'race') return undefined;
    refreshShots();
    const id = setInterval(() => { if (!document.hidden) refreshShots(); }, 20000);
    return () => clearInterval(id);
  }, [preview, view, refreshShots, activeTeamId]);

  useEffect(() => {
    if (preview || view !== 'organizer') return;
    listShots().then(setAllShots).catch(() => {});
  }, [preview, view]);

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {SLOTS.map((i) => (
            <StampSlot key={i} idx={i} done={doneStamps.has(i)} now={!doneStamps.has(i) && i === nowIdx} />
          ))}
        </div>
      </div>
    );
  };

  const renderStartScreen = () => {
    const team = CONFIG.teams.find((t) => t.id === activeTeamId);
    const existing = team ? store.load(team.id) : null;
    const underway = Boolean(existing?.startedAt);

    return (
      <div>
        <div className="card">
          <div className="eyebrow" style={{ color: 'var(--red)' }}>Your team</div>
          {team ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '8px 0 4px' }}>
                <span aria-hidden="true" style={{
                  width: 30, height: 30, borderRadius: '50%', border: '2px solid var(--ink)',
                  background: team.colour, flex: 'none',
                }} />
                <b className="display" style={{ fontSize: 24 }}>{team.name}</b>
              </div>
              <button
                className="btn block"
                style={{ marginTop: 14 }}
                onClick={() => {
                  if (underway) {
                    setS(existing);
                    setView(existing.finishedAt ? 'done' : 'race');
                    return;
                  }
                  const blank = blankState(team);
                  blank.startedAt = Date.now();
                  store.save(blank.teamId, blank);
                  setS(blank);
                  setDraft({});
                  setView('race');
                }}
                type="button"
              >
                {underway ? (existing.finishedAt ? 'See your stamps' : 'Carry on') : 'Start the hunt'}
              </button>
              <p className="note" style={{ margin: '12px 0 0' }}>
                {underway ? 'Pick up where your team left off.' : 'Keep this tab open while you play.'}
              </p>
            </>
          ) : (
            <>
              <h2 className="display" style={{ fontSize: 24, margin: '4px 0 8px' }}>No team yet</h2>
              <p style={{ margin: 0 }}>The committee hasn’t put you on a team. Ask them to assign you, then come back here.</p>
            </>
          )}
        </div>

        {canOrganise && (
          <div style={{ textAlign: 'center' }}>
            <button className="linky" onClick={() => setView('organizer')} type="button">
              Organiser view →
            </button>
          </div>
        )}
      </div>
    );
  };

  /* ── Admin preview controls ───────────────────────── */

  const previewJump = (target) => {
    const team = CONFIG.teams.find((t) => t.id === activeTeamId);
    if (!team) return;
    setDraft({});
    if (target === 'start') {
      store.remove(team.id);
      setS(null);
      setView('start');
      return;
    }
    if (target === 'organizer') { setView('organizer'); return; }
    const base = S && S.teamId === team.id ? S : { ...blankState(team), startedAt: Date.now() };
    if (target === 'done') {
      const next = { ...base, finishedAt: base.finishedAt ?? Date.now() };
      store.save(team.id, next);
      setS(next);
      setView('done');
      return;
    }
    const next = { ...base, stage: Number(target), finishedAt: null };
    store.save(team.id, next);
    setS(next);
    setView('race');
  };

  const currentJumpValue =
    view === 'race' && S ? String(S.stage) : view;

  const renderPreviewBar = () => (
    <div style={{
      background: 'var(--gold)', color: '#17232F', border: 'var(--line)', borderRadius: 10,
      padding: '10px 12px', margin: '0 0 12px', boxShadow: 'var(--hard-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <b className="display" style={{ fontSize: 16 }}>Preview</b>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>Unsaved edits included · nothing is saved</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 8 }}>
        <label style={{ display: 'block', minWidth: 0 }}>
          <span className="sr-only">Play as team</span>
          <select
            value={previewTeam}
            onChange={(e) => { setPreviewTeam(e.target.value); setS(null); setDraft({}); setView('start'); }}
            style={{ width: '100%', height: 36, borderRadius: 6, border: '2px solid #17232F', background: '#FFFFFF', color: '#17232F', fontSize: 13, padding: '0 6px' }}
          >
            {CONFIG.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'block', minWidth: 0 }}>
          <span className="sr-only">Jump to step</span>
          <select
            value={currentJumpValue}
            onChange={(e) => previewJump(e.target.value)}
            style={{ width: '100%', height: 36, borderRadius: 6, border: '2px solid #17232F', background: '#FFFFFF', color: '#17232F', fontSize: 13, padding: '0 6px' }}
          >
            <option value="start">Start screen</option>
            {FLOW.map((step, i) => (step.type === 'finish' ? null : (
              <option key={i} value={String(i)}>{flowLabel(step, CONFIG.cp)}</option>
            )))}
            <option value="done">Results</option>
            <option value="organizer">Organiser view</option>
          </select>
        </label>
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
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--th-label)', letterSpacing: '.1em' }}>
              {doneCount}/{CONFIG.stamps} STAMPS
            </div>
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
        <div className="eyebrow" style={{ color: 'var(--red)' }}>Checkpoint {n} of {CONFIG.stamps}</div>
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
        display: 'block', width: '100%', border: '3px dashed var(--th-dash)', borderRadius: 8,
        background: 'var(--th-parchment)', padding: '20px 14px', textAlign: 'center', cursor: 'pointer',
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
        {renderCpHead(CP_NUM.cp1, CONFIG.cp.cp1.title, CONFIG.cp.cp1.kana)}
        <div className="task">
          <Rich text={CONFIG.cp.cp1.body} />
        </div>
        <div style={{
          background: 'var(--ink)', padding: '10px 10px 34px', borderRadius: 6,
          position: 'relative', color: 'var(--card)', marginBottom: 14,
        }}>
          <div style={{ background: 'var(--sea)', borderRadius: 3, aspectRatio: '3/2', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            {t.pose.photo
              ? <img src={t.pose.photo} alt={`Pose for ${t.name} to copy`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#FFFCF4', padding: 16, textAlign: 'center' }}>Pose photo not added yet — ask the committee.</span>}
          </div>
          <div style={{
            position: 'absolute', left: 12, right: 12, bottom: 9,
            fontFamily: '"DM Mono", monospace', fontSize: 11, color: 'var(--th-label)',
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
            store.save(newS.teamId, newS);
            setS(newS);
            setDraft({});
            showToast('Stamp collected.');
          }}
          type="button"
        >
          Send photo
        </button>
      </div>
    );
  };

  const renderCp2a = () => {
    const t = currentTeam;
    if (!t) return null;
    const s = t.spot;
    return (
      <div className="card flag">
        {renderCpHead(CP_NUM.cp2a, CONFIG.cp.cp2a.title, CONFIG.cp.cp2a.kana)}
        <div className="task">
          <Rich text={CONFIG.cp.cp2a.body} />
        </div>
        <div style={{
          background: 'var(--ink)', padding: '10px 10px 34px', borderRadius: 6,
          position: 'relative', color: 'var(--card)', marginBottom: 14,
        }}>
          <div style={{
            background: 'var(--sea)', borderRadius: 3, aspectRatio: '3/2',
            display: 'grid', placeItems: 'center', overflow: 'hidden',
          }}>
            {s.photo ? <img src={s.photo} alt="The place to find" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" style={{ width: '78%', height: '78%' }}>
              <g stroke="currentColor" strokeWidth="6" fill="none" strokeLinejoin="round">
                <rect x="44" y="46" width="152" height="86" rx="10" />
                <path d="M92 46l12-16h32l12 16" />
                <circle cx="120" cy="90" r="26" />
              </g>
            </svg>}
          </div>
          <div style={{
            position: 'absolute', left: 12, right: 12, bottom: 9,
            fontFamily: '"DM Mono", monospace', fontSize: 11, color: 'var(--th-label)',
            display: 'flex', justifyContent: 'space-between', gap: 8,
          }}>
            <span>{s.hint}</span>
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
            store.save(newS.teamId, newS);
            setS(newS);
            setDraft({});
            showToast('Selfie in. Riddle unlocked.');
          }}
          type="button"
        >
          Send selfie
        </button>
        <div style={{
          textAlign: 'center', padding: '26px 16px', border: '3px dashed var(--th-dash)',
          borderRadius: 10, background: 'var(--th-parchment)', marginTop: 14,
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
      {renderCpHead(CP_NUM.cp2b, CONFIG.cp.cp2b.title, CONFIG.cp.cp2b.kana)}
      <div className="task">
        <Rich text={CONFIG.cp.cp2b.body} />
      </div>
      <CheckpointPhoto src={CONFIG.cp.cp2b.photo} />
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
          store.save(newS.teamId, newS);
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
      {renderCpHead(CP_NUM.cp3, CONFIG.cp.cp3.title, CONFIG.cp.cp3.kana)}
      <div className="task">
        <p><b>Budget: ¥{CONFIG.buy.budgetYen} for the whole team.</b> {CONFIG.buy.brief}</p>
        <Rich text={CONFIG.cp.cp3.body} />
      </div>
      <CheckpointPhoto src={CONFIG.cp.cp3.photo} />
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
          store.save(newS.teamId, newS);
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
        {renderCpHead(CP_NUM.cp4, CONFIG.cp.cp4.title, CONFIG.cp.cp4.kana)}
        <div className="task">
          <Rich text={CONFIG.cp.cp4.body} />
        </div>
        <CheckpointPhoto src={CONFIG.cp.cp4.photo} />
        {CONFIG.quiz.questions.map((q, i) => (
          <label key={i} className="f" style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 5 }}>{i + 1}. {q.q}</span>
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
              if (!q.accept?.length) return;
              if (q.accept.some((a) => norm(answers[i]).includes(norm(a)))) correct++;
            });
            const newS = { ...S };
            newS.subs = { ...(newS.subs || {}), cp4: { answers, photo: draft.photo, correct, at: Date.now() } };
            newS.stage = S.stage + 1;
            store.save(newS.teamId, newS);
            setS(newS);
            setDraft({});
            showToast('Stamp collected.');
          }}
          type="button"
        >
          Send answers
        </button>
      </div>
    );
  };

  /* ── CP6 — ask a stranger ─────────────────────────── */

  const renderAsk = () => {
    const done = CONFIG.ask.tasks.filter((t) => String(draft[t.key] || '').trim()).length;
    const photoTask = CONFIG.ask.tasks.find((t) => t.key === 'photo');
    return (
      <div className="card flag">
        {renderCpHead(CP_NUM.ask, CONFIG.cp.ask.title, CONFIG.cp.ask.kana)}
        <div className="task">
          <Rich text={CONFIG.cp.ask.body} />
        </div>
        <CheckpointPhoto src={CONFIG.cp.ask.photo} />
        {CONFIG.ask.tasks.filter((t) => t.key !== 'photo').map((t) => (
          <label key={t.key} className="f" style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontWeight: 700, fontSize: 14, marginBottom: 5 }}>
              {t.label}
            </span>
            <input
              type="text"
              placeholder={t.hint}
              value={draft[t.key] || ''}
              onChange={(e) => setDraft((d) => ({ ...d, [t.key]: e.target.value }))}
              style={{
                width: '100%', fontFamily: 'var(--body)', fontSize: 16, padding: '11px 12px',
                border: 'var(--line)', borderRadius: 7, background: 'var(--card)', color: 'var(--ink)',
              }}
            />
          </label>
        ))}
        {photoTask && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontWeight: 700, fontSize: 14, marginBottom: 5 }}>
              {photoTask.label}
            </div>
            {renderShot(draft.photo, 'Add the photo', photoTask.hint ? `${photoTask.hint} · optional` : 'Optional')}
          </>
        )}
        <button
          className="btn block"
          style={{ marginTop: 14 }}
          disabled={done === 0}
          onClick={() => {
            const newS = { ...S };
            newS.subs = {
              ...(newS.subs || {}),
              ask: { word: draft.word || '', rec: draft.rec || '', photo: draft.photo || null, at: Date.now() },
            };
            newS.stage = S.stage + 1;
            store.save(newS.teamId, newS);
            setS(newS);
            setDraft({});
            showToast('Stamp collected.');
          }}
          type="button"
        >
          Send it
        </button>
        <p className="note" style={{ margin: '12px 0 0' }}>
          {done === 0
            ? 'One of the three is enough to move on.'
            : `${done} of ${CONFIG.ask.tasks.length} done.`}
        </p>
      </div>
    );
  };

  /* ── Game 1 — photo bingo ────────────────────────────────
     One shared card per team. Each tile belongs to one member; the Team
     Lead can fill any tile, as backup for a member who can't upload.
     The first game of the hunt: fill the card, lock it, and the stamp
     rally opens. */

  const addBingoTile = async (i, file) => {
    setCoverTile(null);
    setBusyTile(i);
    try {
      if (preview) {
        const src = await compressImage(file, 420, 0.6);
        setShots((prev) => ({ ...prev, [i]: { tile: i, src, uploader_name: 'You', on_behalf: true } }));
      } else {
        await uploadShot(activeTeamId, i, file);
        await refreshShots();
      }
    } catch (e) {
      const msg = e?.message ?? '';
      showToast(/row-level|policy|unauthori[sz]ed|403/i.test(msg)
        ? 'This tile isn’t yours to snap.'
        : /fetch|network/i.test(msg) ? 'No signal — try again in a moment.' : "That photo didn't upload. Try another.");
    } finally {
      setBusyTile(null);
    }
  };

  const clearBingoTile = async (i) => {
    if (preview) {
      setShots((prev) => { const next = { ...prev }; delete next[i]; return next; });
      return;
    }
    try {
      await deleteShot(shots[i]);
      await refreshShots();
    } catch {
      showToast('Couldn’t clear that tile.');
    }
  };

  const bingoFileInput = (i, id) => (
    <input
      id={id}
      type="file"
      accept="image/*"
      capture="environment"
      style={{ display: 'none' }}
      onChange={(e) => { const f = e.target.files[0]; if (f) addBingoTile(i, f); e.target.value = ''; }}
    />
  );

  const renderBingoGrid = (locked) => {
    const lead = player?.role === 'Team Lead' && player?.team === activeTeamId;
    const cover = coverTile != null ? { ...bingoCard[coverTile], ...assignees[coverTile] } : null;
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {bingoCard.map((tile, i) => {
            const shot = shots[i];
            const assignee = assignees[i];
            const access = tileAccess(assignee, player, activeTeamId);
            const who = assignee?.name ?? '…';
            const mine = access === 'mine';
            const inner = (
              <>
                {shot?.src && <img src={shot.src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                <span style={{
                  position: 'relative', zIndex: 1, fontFamily: '"DM Mono", monospace',
                  fontSize: 9.5, lineHeight: 1.3, padding: 5,
                  color: shot ? '#fff' : 'var(--ink-soft)',
                  textShadow: shot ? '0 1px 4px rgba(0,0,0,.95)' : 'none',
                }}>{busyTile === i ? 'Uploading…' : tile.prompt}</span>
                <span style={{
                  position: 'absolute', left: 3, right: 3, bottom: 3, zIndex: 1,
                  fontFamily: '"DM Mono", monospace', fontSize: 9, fontWeight: 700, lineHeight: 1.2,
                  padding: '2px 4px', borderRadius: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  background: mine ? 'var(--gold)' : 'var(--card)', color: 'var(--ink)', border: '1px solid var(--ink)',
                }}>
                  📷 {mine ? 'You' : who}{shot?.on_behalf ? ` · by ${shot.uploader_name}` : ''}
                </span>
                {shot && !locked && access !== 'no' && (
                  <span
                    onClick={(e) => { e.preventDefault(); clearBingoTile(i); }}
                    style={{
                      position: 'absolute', top: 3, right: 3, zIndex: 2, background: 'var(--card)',
                      border: '2px solid var(--ink)', borderRadius: 5, width: 19, height: 19,
                      display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900, lineHeight: 1,
                    }}
                  >×</span>
                )}
              </>
            );
            const box = {
              position: 'relative', aspectRatio: 1, display: 'grid', placeItems: 'center',
              textAlign: 'center', overflow: 'hidden', borderRadius: 8, paddingBottom: 16,
              border: shot ? 'var(--line)' : mine ? '3px dashed var(--red)' : '3px dashed var(--th-dash)',
              background: shot ? 'var(--ink)' : 'var(--th-parchment)',
              opacity: !shot && access === 'no' && !locked ? 0.6 : 1,
            };
            if (locked || busyTile === i) return <div key={i} style={box}>{inner}</div>;
            if (access === 'no') {
              return (
                <button key={i} type="button" style={{ ...box, cursor: 'not-allowed', color: 'inherit', font: 'inherit' }}
                  onClick={() => showToast(assignee ? `This tile is ${assignee.name}’s to snap.` : 'Still loading who snaps this one.')}>
                  {inner}
                </button>
              );
            }
            if (access === 'cover') {
              return (
                <button key={i} type="button" style={{ ...box, cursor: 'pointer', color: 'inherit', font: 'inherit' }}
                  onClick={() => setCoverTile(coverTile === i ? null : i)}>
                  {inner}
                </button>
              );
            }
            return (
              <label key={i} style={{ ...box, cursor: 'pointer' }}>
                {inner}
                {bingoFileInput(i)}
              </label>
            );
          })}
        </div>

        {cover && !locked && (
          <div style={{
            marginTop: 10, padding: '10px 12px', border: 'var(--line)', borderRadius: 8,
            background: 'var(--th-parchment)',
          }}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>
              <b>“{cover.prompt}”</b> is {cover.name || 'a teammate'}’s tile. Only upload it for them if they have a technical
              problem — a dead phone, no signal, the upload won’t go through.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label className="mini" htmlFor={`bingo-cover-${coverTile}`} style={{ cursor: 'pointer' }}>
                {shots[coverTile] ? 'Replace' : 'Snap'} it for {cover.name || 'them'}
              </label>
              {bingoFileInput(coverTile, `bingo-cover-${coverTile}`)}
              <button className="mini" type="button" onClick={() => setCoverTile(null)}>Cancel</button>
            </div>
          </div>
        )}

        <p className="note" style={{ margin: '10px 0 0' }}>
          {lead
            ? 'Each tile has a name on it — that person snaps it on their own phone. As Team Lead you can upload any tile, but only when its owner has a technical issue uploading.'
            : 'Each tile has a name on it — only that person can snap it. Yours are marked 📷 You. Can’t upload? Ask your Team Lead to do it for you.'}
        </p>
      </>
    );
  };

  const renderBingo = () => {
    const tiles = shots;
    const filled = bingoCard.reduce((n, _, i) => n + (tiles[i] ? 1 : 0), 0);
    const locked = !!S?.subs?.bingo;
    /* The warning shrinks as the missing photos land. */
    const stillMissing = (bingoMissing ?? []).filter((i) => !tiles[i]);

    return (
      <div className="card flag">
        {renderCpHead(CP_NUM.bingo, CONFIG.cp.bingo.title, CONFIG.cp.bingo.kana)}
        <div className="task">
          <p style={{ margin: 0 }}>The first game. Nine prompts, one photo each, each snapped by the teammate named on it. Fill all nine to move on.</p>
        </div>
        <CheckpointPhoto src={CONFIG.cp.bingo.photo} />
        {renderBingoGrid(locked)}
        {stillMissing.length > 0 && (
          <div role="alert" style={{
            marginTop: 14, padding: '10px 12px', borderRadius: 8,
            border: '2px solid var(--red)', background: 'var(--th-parchment)', fontSize: 13,
          }}>
            <b>All nine photos are needed before you can move on.</b> Still missing {stillMissing.length}:
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {stillMissing.map((i) => (
                <li key={i}>{i + 1}. {bingoCard[i]?.prompt} — {assignees[i]?.name ?? 'teammate'}</li>
              ))}
            </ul>
          </div>
        )}
        <button
          className="btn block"
          style={{ marginTop: 14, opacity: filled === bingoCard.length ? 1 : 0.75 }}
          disabled={bingoChecking}
          onClick={async () => {
            /* Teammates upload from their own phones — check the latest
               card, not just what this screen last loaded. */
            setBingoChecking(true);
            const fresh = (await refreshShots()) ?? tiles;
            setBingoChecking(false);
            const missing = bingoCard.map((_, i) => i).filter((i) => !fresh[i]);
            if (missing.length) {
              setBingoMissing(missing);
              showToast(`${missing.length} photo${missing.length > 1 ? 's' : ''} still missing.`);
              return;
            }
            setBingoMissing(null);
            const newS = { ...S };
            newS.subs = { ...(newS.subs || {}), bingo: { tiles: bingoCard.length, points: bingoPoints(fresh, CONFIG), at: Date.now() } };
            newS.stage = S.stage + 1;
            store.save(newS.teamId, newS);
            setS(newS);
            showToast('Stamp collected.');
          }}
          type="button"
        >
          {bingoChecking ? 'Checking…' : `Next · ${filled}/9`}
        </button>
        <p className="note" style={{ margin: '12px 0 0' }}>Next opens once all nine tiles have a photo.</p>
        {CONFIG.helpNote && <p className="note" style={{ marginTop: 12 }}>{CONFIG.helpNote}</p>}
      </div>
    );
  };

  /* ── CP7 — closest guess ──────────────────────────── */

  const renderGuess = () => {
    const answers = draft.answers || [];
    const filledAll = CONFIG.guess.questions.every((_, i) => String(answers[i] ?? '').trim() !== '');
    return (
      <div className="card flag">
        {renderCpHead(CP_NUM.guess, CONFIG.cp.guess.title, CONFIG.cp.guess.kana)}
        <div className="task">
          <p style={{ margin: 0 }}>
            Nothing to look up — just call it. You don’t have to be exact; being close still counts.
          </p>
        </div>
        <CheckpointPhoto src={CONFIG.cp.guess.photo} />
        {CONFIG.guess.questions.map((q, i) => (
          <label key={i} className="f" style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 5 }}>{i + 1}. {q}</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="Your number"
              value={answers[i] ?? ''}
              onChange={(e) => {
                const next = [...answers];
                next[i] = e.target.value;
                setDraft((d) => ({ ...d, answers: next }));
              }}
              style={{
                width: '100%', fontFamily: 'var(--body)', fontSize: 16, padding: '11px 12px',
                border: 'var(--line)', borderRadius: 7, background: 'var(--card)', color: 'var(--ink)',
              }}
            />
          </label>
        ))}
        <button
          className="btn block"
          disabled={!filledAll}
          onClick={() => {
            const newS = { ...S };
            newS.subs = { ...(newS.subs || {}), guess: { answers, at: Date.now() } };
            newS.stage = S.stage + 1;
            store.save(newS.teamId, newS);
            setS(newS);
            setDraft({});
            showToast('Numbers in. Stamp collected.');
          }}
          type="button"
        >
          Send the numbers
        </button>
        <p className="note" style={{ margin: '12px 0 0' }}>The committee marks these at the finish, so the board can still move.</p>
      </div>
    );
  };

  const renderCheer = () => {
    const v = draft.video;
    return (
      <div className="card flag">
        {renderCpHead(CP_NUM.cheer, CONFIG.cp.cheer.title, CONFIG.cp.cheer.kana)}
        <div className="task">
          <Rich text={CONFIG.cp.cheer.body} lead={`${CONFIG.video.seconds} seconds. One take.`} />
        </div>
        <CheckpointPhoto src={CONFIG.cp.cheer.photo} />
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
              {v.seconds > CONFIG.video.maxSeconds && <span style={{ color: 'var(--red)' }}> · over {CONFIG.video.maxSeconds}s</span>}
            </p>
          </div>
        ) : (
          <label style={{
            display: 'block', width: '100%', border: '3px dashed var(--th-dash)', borderRadius: 8,
            background: 'var(--th-parchment)', padding: '20px 14px', textAlign: 'center', cursor: 'pointer',
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
            newS.subs = { ...(newS.subs || {}), cheer: { name: v.name, seconds: v.seconds, at: Date.now() } };
            newS.finishedAt = Date.now();
            newS.stage = S.stage + 1;
            store.save(newS.teamId, newS);
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
    const copy = CONFIG.unlocks[to] ?? { h: 'Next checkpoint', p: '' };
    return (
      <div style={{
        background: 'var(--ink)', color: 'var(--card)', borderRadius: 10,
        padding: 20, boxShadow: 'var(--hard)', border: 'var(--line)', marginBottom: 16,
      }}>
        <div className="eyebrow" style={{ color: 'var(--gold)' }}>Stamp collected</div>
        <h2 className="display" style={{ fontSize: 29, margin: '6px 0 10px', textTransform: 'uppercase', lineHeight: 0.95 }}>
          {copy.h}
        </h2>
        <p style={{ color: 'var(--th-body-alt)' }}>{copy.p}</p>
        <button
          className="btn block sea"
          onClick={() => {
            const newS = { ...S };
            newS.stage = S.stage + 1;
            store.save(newS.teamId, newS);
            setS(newS);
          }}
          type="button"
        >
          Open it
        </button>
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
          store.save(newS.teamId, newS);
          setS(newS);
          setView('done');
        }
      }, 100);
      return <p className="note" style={{ textAlign: 'center', padding: 20 }}>Finishing...</p>;
    }
    const renderers = {
      cp1: renderCp1, cp2a: renderCp2a, cp2b: renderCp2b, cp3: renderCp3, cp4: renderCp4,
      ask: renderAsk, bingo: renderBingo, guess: renderGuess, cheer: renderCheer,
    };
    const fn = renderers[st.key];
    return fn ? fn() : null;
  };

  const renderDoneScreen = () => {
    const rows = [
      ['1', 'Photo bingo', 'bingo'],
      ['2', 'Pose photo', 'cp1'],
      ['3', 'Selfie + riddle', 'cp2b'],
      ['4', 'Buy &amp; try', 'cp3'],
      ['5', 'Observation quiz', 'cp4'],
      ['6', 'Ask a stranger', 'ask'],
      ['7', 'Closest guess', 'guess'],
      ['8', 'Team cheer', 'cheer'],
    ];
    const doneStamps = new Set(
      Object.keys(S.subs || {}).map((k) => (k === 'cp2a' ? null : CP_INDEX[k])).filter((v) => v != null)
    );
    return (
      <div>
        {renderStampRally()}
        <div className="hero" style={{ padding: '10px 0' }}>
          <div className="big" style={{ fontSize: 'clamp(40px, 13vw, 62px)' }}>All eight<em>stamped</em></div>
          <div className="rule" />
        </div>
        <div className="card">
          <div className="eyebrow" style={{ color: 'var(--red)' }}>{esc(S.teamName)}</div>
          <h2 className="display" style={{ fontSize: 22, margin: '4px 0 12px' }}>Hunt complete</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rows.map((r, i) => (
              <li key={i} style={{
                display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0',
                borderBottom: '1px dashed var(--th-rule)', fontSize: 14,
              }}>
                <span style={{ fontFamily: 'var(--body)', fontWeight: 900, color: 'var(--red)', width: 22 }}>{r[0]}</span>
                <span dangerouslySetInnerHTML={{ __html: r[1] }} />
                <span style={{ marginLeft: 'auto', fontFamily: '"DM Mono", monospace', fontSize: 12 }}>{S.subs?.[r[2]] ? '✓' : '—'}</span>
              </li>
            ))}
          </ul>
          <p className="note" style={{ margin: '12px 0 0' }}>The committee tallies the results at the finish point.</p>
        </div>
        <div style={{
          background: 'var(--ink)', color: 'var(--card)', borderRadius: 10,
          padding: 20, boxShadow: 'var(--hard)', border: 'var(--line)', marginBottom: 16,
        }}>
          <div className="eyebrow" style={{ color: 'var(--gold)' }}>Last thing</div>
          <h2 className="display" style={{ fontSize: 29, margin: '6px 0 10px', textTransform: 'uppercase', lineHeight: 0.95 }}>
            Walk it in
          </h2>
          <p style={{ color: 'var(--th-body-alt)' }}>{CONFIG.finishPoint}</p>
        </div>
        {canOrganise && (
          <div style={{ textAlign: 'center' }}>
            <button className="linky" onClick={() => setView('organizer')} type="button">Organiser view →</button>
          </div>
        )}
      </div>
    );
  };

  const renderOrganizer = () => {
    const allRuns = CONFIG.teams
      .map((t) => store.load(t.id))
      .filter(Boolean)
      .sort((a, b) => scoreOf(b, CONFIG) - scoreOf(a, CONFIG));

    const bonuses = [
      ['photo', 'Best pose photo', 5],
      ['item', 'Most interesting buy', 5],
      ['video', 'Best cheer video', 10],
      ['first', 'First to finish', 5],
    ];

    const handleBonus = (teamId, key, val) => {
      const run = store.load(teamId);
      if (!run) return;
      run.bonus = run.bonus || {};
      if (run.bonus[key]) delete run.bonus[key];
      else run.bonus[key] = val;
      store.save(teamId, run);
      // force re-render
      setOrgS((o) => ({ ...(o || {}), _tick: Date.now() }));
    };

    const handleReset = (teamId) => {
      store.remove(teamId);
      setOrgS((o) => ({ ...(o || {}), _tick: Date.now() }));
    };

    return (
      <div>
        <div className="hero" style={{ padding: '10px 0' }}>
          <div className="big" style={{ fontSize: 'clamp(36px, 12vw, 54px)' }}>Organiser</div>
          <div className="rule" />
        </div>
        {allRuns.length === 0 ? (
          <div className="card">
            <p style={{ margin: 0 }}>No teams have started yet. Once a team taps <b>Start the hunt</b>, they show up here.</p>
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
                      Object.keys(run.subs || {}).map((k) => (k === 'cp2a' ? null : CP_INDEX[k])).filter((v) => v != null)
                    );
                    const left = run.startedAt
                      ? Math.max(0, Math.round(((run.startedAt + CONFIG.raceMinutes * 60000) - (run.finishedAt || Date.now())) / 1000))
                      : 0;
                    return (
                      <tr key={i}>
                        <td style={{ padding: '8px 4px', borderBottom: '1px dashed var(--th-rule)', verticalAlign: 'middle' }}>
                          <b style={{ fontFamily: 'var(--body)', fontSize: 13 }}>{run.teamName}</b>
                          <br /><span className="note">{run.members || '—'}</span>
                        </td>
                        <td style={{ padding: '8px 4px', borderBottom: '1px dashed var(--th-rule)', verticalAlign: 'middle' }}>
                          {SLOTS.map((si) => (
                            <span key={si} style={{
                              display: 'inline-block', width: 11, height: 11, borderRadius: '50%',
                              border: '2px solid var(--ink)', marginRight: 3,
                              background: done.has(si) ? 'var(--red)' : 'var(--th-slot)',
                            }} />
                          ))}
                        </td>
                        <td style={{ padding: '8px 4px', borderBottom: '1px dashed var(--th-rule)', verticalAlign: 'middle', fontFamily: '"DM Mono", monospace', fontSize: 11, color: 'var(--ink-soft)' }}>
                          {run.finishedAt ? 'DONE' : mmss(left)}
                        </td>
                        <td style={{ padding: '8px 4px', borderBottom: '1px dashed var(--th-rule)', verticalAlign: 'middle', textAlign: 'right' }}>
                          <b className="display" style={{ fontSize: 20 }}>{scoreOf(run, CONFIG)}</b>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Closest-guess answer key */}
            <div className="card">
              <div className="eyebrow" style={{ color: 'var(--red)', marginBottom: 8 }}>Closest guess — true answers</div>
              {CONFIG.guess.questions.map((q, i) => (
                <label key={i} className="f" style={{ display: 'block', marginBottom: 10 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 5 }}>{i + 1}. {q}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="Leave blank to leave unmarked"
                    value={loadAnswers()[i] ?? ''}
                    onChange={(e) => {
                      saveAnswers({ ...loadAnswers(), [i]: e.target.value });
                      setOrgS((o) => ({ ...(o || {}), _tick: Date.now() }));
                    }}
                    style={{
                      width: '100%', fontFamily: 'var(--body)', fontSize: 16, padding: '9px 12px',
                      border: 'var(--line)', borderRadius: 7, background: 'var(--card)', color: 'var(--ink)',
                    }}
                  />
                </label>
              ))}
              <p className="note" style={{ margin: 0 }}>Every team's score updates the moment you type. Blank means nobody scores that one.</p>
            </div>

            {/* Team panels */}
            {allRuns.map((run, i) => {
              const s = run.subs || {};
              const imgs = [s.cp1?.photo, s.cp2a?.photo, s.cp3?.photo, s.cp4?.photo, s.ask?.photo].filter(Boolean);
              const bingoShots = allShots.filter((b) => b.team === run.teamId && b.src).sort((a, b) => a.tile - b.tile);
              return (
                <div key={i} className="card">
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <b className="display" style={{ fontSize: 20 }}>{esc(run.teamName)}</b>
                    <span className="note" style={{ marginLeft: 'auto' }}>{Object.keys(s).filter((k) => k !== 'cp2a').length}/{CONFIG.stamps}</span>
                  </div>
                  {imgs.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8, marginTop: 10 }}>
                      {imgs.map((img, ii) => <img key={ii} src={img} alt="" style={{ width: '100%', aspectRatio: 1, objectFit: 'cover', border: 'var(--line)', borderRadius: 6 }} />)}
                    </div>
                  )}
                  {s.cp2b && <p className="note" style={{ marginTop: 12 }}>RIDDLE — {esc(s.cp2b.answer).slice(0, 220)}</p>}
                  {s.cp3 && <p className="note">BOUGHT — {esc(s.cp3.item)} · ¥{esc(s.cp3.price || '?')}</p>}
                  {s.cp4 && <p className="note">QUIZ — {s.cp4.answers.map((a, ai) => `${ai + 1}. ${esc(a)}`).join(' · ')} <span className="tag" style={{
                    background: s.cp4.correct ? 'rgba(143,190,126,.3)' : 'var(--th-slot)',
                    color: s.cp4.correct ? '#2f6b1f' : 'var(--ink-soft)',
                  }}>{s.cp4.correct} auto-marked</span></p>}
                  {s.ask && (
                    <p className="note">
                      STRANGER — word: {esc(s.ask.word || '—')} · rec: {esc(s.ask.rec || '—')} · photo: {s.ask.photo ? 'yes' : 'no'}
                      <span className="tag">+{askPoints(s.ask, CONFIG)}</span>
                    </p>
                  )}
                  {s.bingo && (
                    <div>
                      <p className="note">BINGO — {s.bingo.tiles}/9 <span className="tag">+{s.bingo.points}</span></p>
                      {bingoShots.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 5 }}>
                          {bingoShots.map((b) => (
                            <img key={b.tile} src={b.src} alt="" title={`Tile ${b.tile + 1} · ${b.uploader_name}${b.on_behalf ? ' (on behalf)' : ''}`}
                              style={{ width: '100%', aspectRatio: 1, objectFit: 'cover', border: 'var(--line)', borderRadius: 5 }} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {s.guess && (
                    <p className="note">
                      GUESSES — {(s.guess.answers || []).map((a, gi) => `${gi + 1}. ${esc(a)}`).join(' · ')}
                      <span className="tag">+{guessPoints(s.guess, CONFIG)}</span>
                    </p>
                  )}
                  {s.cheer && <p className="note">VIDEO — {esc(s.cheer.name)} · {s.cheer.seconds}s (held on the team's phone)</p>}
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
    <div className="relative min-h-[300px]">
      {/* Close button */}
      <div className="sticky top-0 z-70 flex justify-end py-1.5">
        <button
          onClick={onClose}
          type="button"
          className="px-3 py-1.5 border-2 border-ink rounded-lg font-mono text-[9px] font-bold cursor-pointer bg-ink dark:bg-flame text-card border-red transition-all duration-100 hover:opacity-90"
        >
          {preview ? '← Back to editor' : '← Back to Day 4'}
        </button>
      </div>

      {preview && renderPreviewBar()}
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