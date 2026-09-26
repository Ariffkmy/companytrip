import { Fragment, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { toRuntime, withDefaults } from '../lib/huntConfig';
import { tileAccess, fetchCard, previewCard, listShots, uploadShot, deleteShot } from '../lib/bingo';
import confetti from '../lib/confetti';
import HuntMapLoader from './HuntMapLoader';

/* ═══════════════════════════════════════════════════
   Atami Treasure Hunt — Embedded Stamp Rally Game
   ═══════════════════════════════════════════════════ */


const KANJI =['壱', '弐', '参', '肆', '伍', '陸', '漆', '捌'];

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
/* **stars** anywhere in a line become bold. */
const bold = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
  /^\*\*[^*]+\*\*$/.test(chunk) ? <b key={j}>{chunk.slice(2, -2)}</b> : chunk
);

function Rich({ text, lead }) {
  const blocks = String(text ?? '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  if (lead) blocks[0] = `**${lead}** ${blocks[0] ?? ''}`.trim();
  return blocks.map((block, i) => {
    /* Lines starting "- " are bullets, and a block may mix them with
       prose — typically a heading sitting directly above its list. So
       group the block into runs and render each in kind, rather than
       forcing the whole block to be one or the other.

       Prose lines are joined with a space, which is how a paragraph's
       soft line breaks have always collapsed. */
    const runs = [];
    block.split('\n').map((l) => l.trim()).filter(Boolean).forEach((line) => {
      const bullet = line.startsWith('- ');
      const last = runs[runs.length - 1];
      if (last && last.bullet === bullet) last.lines.push(line);
      else runs.push({ bullet, lines: [line] });
    });

    return (
      <Fragment key={i}>
        {runs.map((run, j) => (run.bullet ? (
          <ul key={j} style={{ margin: '0 0 10px', paddingLeft: 20 }}>
            {run.lines.map((l, k) => (
              <li key={k} style={{ marginBottom: 4 }}>{bold(l.slice(2))}</li>
            ))}
          </ul>
        ) : (
          <p key={j}>{bold(run.lines.join(' '))}</p>
        )))}
      </Fragment>
    );
  });
}

/* Optional admin-supplied photo shown under a game's instructions. */
function CheckpointPhoto({ src }) {
  if (!src) return null;
  return (
    <img src={src} alt="" style={{
      display: 'block', width: '100%', maxHeight: 360, objectFit: 'cover',
      border: 'var(--line)', borderRadius: 8, marginBottom: 14,
    }} />
  );
}

/* ── The seven games ────────────────────────────────
   Teams choose what to play and in what order, and may skip anything —
   the numbering below is only how the games are listed and stamped, not
   a sequence. Nothing here gates anything else. */
const GAMES = [
  { key: 'bingo', short: 'Photo bingo' },
  { key: 'cp1', short: 'Pose photo' },
  { key: 'cp2', short: 'Selfie + riddle' },
  { key: 'cp3', short: 'Buy & try' },
  { key: 'cp4', short: 'Observation quiz' },
  { key: 'ask', short: 'Ask a stranger' },
  { key: 'guess', short: 'General knowledge' },
];

const SLOTS = GAMES.map((_, i) => i);

/* Which rally slot a saved submission fills. cp2 is a two-parter — the
   selfie opens the riddle, and the riddle is what earns the stamp — so
   cp2a deliberately has no slot of its own. */
const SLOT_OF = { bingo: 0, cp1: 1, cp2b: 2, cp3: 3, cp4: 4, ask: 5, guess: 6 };

/* The number printed on each game's header. cp2a and cp2b share one. */
const STAMP_NO = { bingo: 1, cp1: 2, cp2a: 3, cp2b: 3, cp3: 4, cp4: 5, ask: 6, guess: 7 };

/* A game counts as collected once its stamping submission is in. */
const DONE_SUB = { bingo: 'bingo', cp1: 'cp1', cp2: 'cp2b', cp3: 'cp3', cp4: 'cp4', ask: 'ask', guess: 'guess' };

/* Title for a game in the hub and the preview menu. cp2 is titled by
   its first screen. */
const gameTitle = (key, cp) => cp[key === 'cp2' ? 'cp2a' : key]?.title ?? key;

function blankState(team) {
  return {
    teamId: team.id,
    teamName: team.name,
    members: '',
    startedAt: null,
    finishedAt: null,
    /* Which game is on screen; null means the team is at the hub
       choosing one. Replaces the old linear stage pointer. */
    open: null,
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

/* A random question the team hasn't seen this round, with its four
   answers shuffled. Once the whole bank has been seen, it starts over. */
function drawTrivia(bank, seen = []) {
  const unseen = bank.map((_, i) => i).filter((i) => !seen.includes(i));
  const pool = unseen.length ? unseen : bank.map((_, i) => i);
  const i = pool[Math.floor(Math.random() * pool.length)];
  const t = bank[i];
  const options = [t.a, ...t.decoys];
  for (let j = options.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [options[j], options[k]] = [options[k], options[j]];
  }
  return { current: { i, q: t.q, a: t.a, options, picked: null }, seen: unseen.length ? [...seen, i] : [i] };
}

function scoreOf(run, CONFIG) {
  let p = 0;
  Object.keys(run.subs).forEach((k) => {
    const sub = run.subs[k];
    p += CONFIG.points.checkpoint;
    if (k === 'cp4') p += (sub.correct || 0) * CONFIG.points.quizPerAnswer;
    else if (k === 'ask') p += askPoints(sub, CONFIG);
    else if (k === 'bingo') p += sub.points || 0;
  });
  Object.values(run.bonus || {}).forEach((v) => (p += v));
  return p;
}

/* ════════════════════════════════════════════════════════════
   Main Game Component
   ════════════════════════════════════════════════════════════ */

/* `me` is the signed-in member: { email, team, role, isAdmin }. */
/* `isOpen` is the committee's switch. It gates starting a run, not
   playing one: a team already out there keeps its progress if the
   switch is thrown, because losing a half-finished submission in a
   backstreet is worse than letting them finish. Defaults true so the
   admin preview plays regardless. */
export default function TreasureHunt({ onClose, teamId, me, config, isOpen = true, preview = false }) {
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
  const [mapOpen, setMapOpen] = useState(false);
  const closeMap = useCallback(() => setMapOpen(false), []);
  const [rulesOpen, setRulesOpen] = useState(false);
  /* Escape closes it, as it does the map — and the page behind stops
     scrolling, so a long set of rules doesn't drag the hub with it. */
  useEffect(() => {
    if (!rulesOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setRulesOpen(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [rulesOpen]);
  /* Scores and times are for the committee only. */
  const canOrganise = preview || !!me?.isAdmin;
  const player = preview ? { email: '', team: activeTeamId, role: 'Team Lead', isAdmin: false } : me;

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const dataUrl = await compressImage(file);
    setDraft((d) => ({ ...d, photo: dataUrl }));
  }, []);

  const save = useCallback((run) => {
    store.save(run.teamId, run);
  }, []);

  /* ── Clock ──────────────────────────────────────────
     A team ends its own run with the Finish button whenever it likes —
     half the games unplayed is a legitimate way to finish. If the race
     time runs out first, the run closes itself so the committee's
     board doesn't show teams still playing after time. */
  const deadline = S?.startedAt ? S.startedAt + CONFIG.raceMinutes * 60000 : null;
  const secondsLeft = deadline === null ? null : Math.max(0, Math.round((deadline - (tick ?? Date.now())) / 1000));

  useEffect(() => {
    if (view !== 'race' || !S?.startedAt || S?.finishedAt) return undefined;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [view, S?.startedAt, S?.finishedAt]);

  const finishRun = useCallback((run) => {
    if (!run) return;
    const next = { ...run, open: null, finishedAt: run.finishedAt ?? Date.now() };
    store.save(next.teamId, next);
    setS(next);
    setDraft({});
    setView('done');
  }, [store]);

  useEffect(() => {
    if (view !== 'race' || !S?.startedAt || S.finishedAt || secondsLeft === null) return;
    if (secondsLeft <= 0) finishRun(S);
  }, [view, S, secondsLeft, finishRun]);

  /* Deal the first general knowledge question when the team opens it.
     The question and any answer picked are saved with the run, so a
     reload can't be used to dodge a question. */
  const onTrivia = S?.open === 'guess';
  useEffect(() => {
    if (!onTrivia || S.trivia?.current || !CONFIG.trivia.bank.length) return;
    const next = { ...S, trivia: { streak: 0, best: 0, answered: 0, ...drawTrivia(CONFIG.trivia.bank, S.trivia?.seen) } };
    store.save(next.teamId, next);
    setS(next);
  }, [onTrivia, S, CONFIG, store]);

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

  const doneSlots = () => new Set(
    Object.keys(S?.subs || {}).map((k) => SLOT_OF[k]).filter((v) => v != null)
  );

  const openGame = (key) => {
    setDraft({});
    const next = { ...S, open: key };
    store.save(next.teamId, next);
    setS(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const backToHub = () => {
    setDraft({});
    const next = { ...S, open: null };
    store.save(next.teamId, next);
    setS(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderStampRally = () => {
    const doneStamps = doneSlots();
    const nowIdx = S.open ? SLOT_OF[DONE_SUB[S.open]] ?? -1 : -1;

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

  /* ── How it works ───────────────────────────────────
     The counts and the clock are printed from the live config, so they
     cannot drift from the game actually being played; the prose under
     them is the committee's to edit. */
  const renderRules = () => {
    if (!rulesOpen) return null;
    const close = () => setRulesOpen(false);
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="How the hunt works"
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 95, overflowY: 'auto',
          background: 'rgba(10,10,12,.55)', padding: '24px 14px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        }}
      >
        <div
          className="card"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: 540, width: '100%', margin: 0 }}
        >
          <div className="eyebrow" style={{ color: 'var(--red)' }}>About</div>
          <h2 className="display" style={{ fontSize: 25, margin: '4px 0 2px' }}>How it works</h2>
          <p className="note" style={{ margin: '0 0 12px' }}>
            {CONFIG.stamps} games · any order · {CONFIG.raceMinutes} minutes
          </p>
          <div className="task">
            <Rich text={CONFIG.rules} />
          </div>
          <p style={{ margin: '12px 0 0' }}>
            <b>Finish:</b> {CONFIG.finishPoint}
          </p>
          {CONFIG.helpNote && <p className="note" style={{ marginTop: 10 }}>{CONFIG.helpNote}</p>}
          <button className="btn block" style={{ marginTop: 16 }} type="button" onClick={close} autoFocus>
            Got it
          </button>
        </div>
      </div>
    );
  };

  const rulesButton = (style) => (
    <button
      type="button"
      onClick={() => setRulesOpen(true)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 999, border: 'var(--line)',
        background: 'var(--card)', color: 'var(--ink)',
        font: '700 12px/1.2 var(--body)', cursor: 'pointer', ...style,
      }}
    >
      ？ How it works
    </button>
  );

  /* ── Hub ────────────────────────────────────────────
     The list of games, all of them open from the moment the hunt
     starts. Nothing is locked behind anything else, so a team can open
     number 5 first and come back to number 2 later — or never. */
  const renderHub = () => {
    const done = doneSlots();
    const left = GAMES.length - done.size;
    return (
      <div>
        <div className="card">
          <div className="eyebrow" style={{ color: 'var(--red)' }}>Pick any one</div>
          <h2 className="display" style={{ fontSize: 22, margin: '4px 0 6px' }}>
            {left === 0 ? 'Every stamp collected' : `${left} still to play`}
          </h2>
          <p style={{ margin: '0 0 10px' }}>
            Play them in whatever order suits where you are. Skip anything you don’t fancy — an
            unplayed game just scores nothing.
          </p>
          {rulesButton()}
          <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0' }}>
            {GAMES.map((g, i) => {
              const isDone = done.has(i);
              const started = g.key === 'cp2' && !isDone && S.subs?.cp2a;
              return (
                <li key={g.key} style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => openGame(g.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                      padding: '11px 13px', borderRadius: 9, border: 'var(--line)', cursor: 'pointer',
                      background: isDone ? 'var(--th-parchment)' : 'var(--card)',
                      boxShadow: isDone ? 'none' : 'var(--hard-sm)',
                    }}
                  >
                    <span aria-hidden="true" style={{
                      flex: 'none', width: 32, height: 32, borderRadius: '50%',
                      display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 15,
                      background: isDone ? 'var(--red)' : 'var(--ink)',
                      color: isDone ? '#fff' : 'var(--gold)',
                    }}>{isDone ? '✓' : KANJI[i]}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <b style={{ display: 'block', fontSize: 15, lineHeight: 1.25 }}>
                        {gameTitle(g.key, CONFIG.cp)}
                      </b>
                      <span className="note">
                        {isDone ? 'Stamp collected' : started ? 'Selfie in — riddle waiting' : g.short}
                      </span>
                    </span>
                    <span aria-hidden="true" style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
                      {isDone ? 'Review' : 'Open'} →
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {CONFIG.helpNote && <p className="note" style={{ marginTop: 12 }}>{CONFIG.helpNote}</p>}
        </div>

        <div style={{
          background: 'var(--ink)', color: 'var(--card)', borderRadius: 10,
          padding: 20, boxShadow: 'var(--hard)', border: 'var(--line)', marginBottom: 16,
        }}>
          <div className="eyebrow" style={{ color: 'var(--gold)' }}>When you’re ready</div>
          <h2 className="display" style={{ fontSize: 26, margin: '6px 0 10px', textTransform: 'uppercase', lineHeight: 0.95 }}>
            Walk it in
          </h2>
          <p style={{ color: 'var(--th-body-alt)', marginTop: 0 }}>{CONFIG.finishPoint}</p>
          <button className="btn block sea" type="button" onClick={() => finishRun(S)}>
            Finish the hunt{left > 0 ? ` · ${left} unplayed` : ''}
          </button>
        </div>
      </div>
    );
  };

  const renderStartScreen = () => {
    const team = CONFIG.teams.find((t) => t.id === activeTeamId);
    const existing = team ? store.load(team.id) : null;
    const underway = Boolean(existing?.startedAt);
    /* Shut, and this team has not started: nothing to carry on with. */
    const shut = !isOpen && !preview && !underway;

    return (
      <div>
        {shut && (
          <div className="card flag">
            <div className="eyebrow" style={{ color: 'var(--red)' }}>Not yet</div>
            <h2 className="display" style={{ fontSize: 24, margin: '4px 0 8px' }}>The hunt hasn’t started</h2>
            <p style={{ margin: 0 }}>
              The committee opens it at the briefing. Come back to this screen then — you don’t need to
              do anything now.
            </p>
            {CONFIG.helpNote && <p className="note" style={{ marginTop: 12 }}>{CONFIG.helpNote}</p>}
          </div>
        )}
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
                style={{ marginTop: 14, ...(shut ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
                disabled={shut}
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
                {shut ? 'Waiting for the committee' : underway ? (existing.finishedAt ? 'See your stamps' : 'Carry on') : 'Start the hunt'}
              </button>
              <div style={{ marginTop: 12 }}>{rulesButton()}</div>
              <p className="note" style={{ margin: '12px 0 0' }}>
                {shut ? 'This opens when the committee starts the game.'
                  : underway ? 'Pick up where your team left off.' : 'Keep this tab open while you play.'}
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
    const next = { ...base, open: target === 'hub' ? null : target, finishedAt: null };
    store.save(team.id, next);
    setS(next);
    setView('race');
  };

  const currentJumpValue =
    view === 'race' && S ? (S.open ?? 'hub') : view;

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
            <option value="hub">Hub · pick a game</option>
            {GAMES.map((g, i) => (
              <option key={g.key} value={g.key}>{i + 1}. {gameTitle(g.key, CONFIG.cp)}</option>
            ))}
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
          {view === 'race' && secondsLeft !== null && (
            <div style={{ textAlign: 'right', flex: 'none' }} aria-live="off">
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 18, lineHeight: 1,
                color: secondsLeft <= 300 ? 'var(--gold)' : 'var(--card)',
              }}>{mmss(secondsLeft)}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--th-label)', letterSpacing: '.1em' }}>
                LEFT
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* "Stamp", not "Area": areas are the outlined patches on the map that
     a team may roam, and no game is tied to one. */
  const renderStop = (stop, style) => (String(stop ?? '').trim() ? (
    <button type="button" onClick={() => setMapOpen(true)} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6,
      padding: '4px 10px', borderRadius: 999, border: '2px solid currentColor',
      background: 'transparent', color: 'inherit', font: '700 12px/1.2 var(--body)', cursor: 'pointer', ...style,
    }}>
      📍 {stop} <span style={{ opacity: 0.7, fontWeight: 500 }}>· map</span>
    </button>
  ) : null);

  /* Every game carries its own way out: leaving one half-done and
     picking another is normal play, not an escape hatch. */
  const renderCpHead = (n, title, kana, stop) => (
    <>
      <button
        type="button"
        onClick={backToHub}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
          padding: '5px 11px', borderRadius: 999, border: 'var(--line)',
          background: 'var(--card)', color: 'var(--ink)',
          font: '700 12px/1.2 var(--body)', cursor: 'pointer',
        }}
      >
        ← All games
      </button>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{
          flex: 'none', width: 42, height: 42, borderRadius: '50%',
          background: 'var(--ink)', color: 'var(--gold)',
          display: 'grid', placeItems: 'center', fontFamily: 'var(--body)',
          fontWeight: 900, fontSize: 19,
        }}>{KANJI[n - 1]}</div>
        <div>
          <div className="eyebrow" style={{ color: 'var(--red)' }}>Stamp {n} of {CONFIG.stamps}</div>
          <h2 className="display" style={{ fontSize: 25, margin: '2px 0 1px' }}>{title}</h2>
          <div className="kana">{kana}</div>
          {renderStop(stop, { color: 'var(--sea)' })}
        </div>
      </div>
    </>
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

  /* The dark mount a reference photo sits in, with a caption bar across
     the bottom. Stamp 2 shows two of these — where to go, then what to
     do there — and stamp 3 shows one. */
  const renderPlate = ({ src, alt, caption, tag, missing }) => (
    <div style={{
      background: 'var(--ink)', padding: '10px 10px 34px', borderRadius: 6,
      position: 'relative', color: 'var(--card)', marginBottom: 14,
    }}>
      <div style={{ background: 'var(--sea)', borderRadius: 3, aspectRatio: '3/2', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {src
          ? <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : missing}
      </div>
      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 9,
        fontFamily: '"DM Mono", monospace', fontSize: 11, color: 'var(--th-label)',
        display: 'flex', justifyContent: 'space-between', gap: 8,
      }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{caption}</span>
        <b style={{ color: 'var(--gold)', fontWeight: 500, flex: 'none' }}>{tag}</b>
      </div>
    </div>
  );

  const missingPhoto = (what) => (
    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#FFFCF4', padding: 16, textAlign: 'center' }}>
      {what} photo not added yet — ask the committee.
    </span>
  );

  /* Two photos, in the order you act on them: the place tells you where
     to stand, the pose tells you what to do once you are there. */
  const renderCp1 = () => {
    const t = currentTeam;
    if (!t) return null;
    return (
      <div className="card flag">
        {renderCpHead(STAMP_NO.cp1, CONFIG.cp.cp1.title, CONFIG.cp.cp1.kana, CONFIG.cp.cp1.stop)}
        <div className="task">
          <Rich text={CONFIG.cp.cp1.body} />
        </div>
        {renderPlate({
          src: t.pose.place,
          alt: `The place ${t.name} has to go to`,
          caption: t.pose.placeHint || 'Go to this place',
          tag: 'WHERE',
          missing: missingPhoto('Place'),
        })}
        {renderPlate({
          src: t.pose.photo,
          alt: `The pose for ${t.name} to copy`,
          caption: `Copy this pose — ${esc(t.name)}`,
          tag: 'POSE',
          missing: missingPhoto('Pose'),
        })}
        {renderShot(draft.photo, 'Add your group photo', 'At the place, in the pose · one photo')}
        <button
          className="btn block"
          style={{ marginTop: 14 }}
          disabled={!draft.photo}
          onClick={() => {
            const newS = { ...S };
            newS.subs = { ...(newS.subs || {}), cp1: { photo: draft.photo, at: Date.now() } };
            newS.open = null;
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
        {renderCpHead(STAMP_NO.cp2a, CONFIG.cp.cp2a.title, CONFIG.cp.cp2a.kana, CONFIG.cp.cp2a.stop)}
        <div className="task">
          <Rich text={CONFIG.cp.cp2a.body} />
        </div>
        {renderPlate({
          src: s.photo,
          alt: 'The place to find',
          caption: s.hint,
          tag: 'WHERE',
          missing: (
            <svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" style={{ width: '78%', height: '78%' }}>
              <g stroke="currentColor" strokeWidth="6" fill="none" strokeLinejoin="round">
                <rect x="44" y="46" width="152" height="86" rx="10" />
                <path d="M92 46l12-16h32l12 16" />
                <circle cx="120" cy="90" r="26" />
              </g>
            </svg>
          ),
        })}
        {renderShot(draft.photo, 'Add your selfie', 'Everyone in frame, landmark behind you')}
        <button
          className="btn block"
          style={{ marginTop: 14 }}
          disabled={!draft.photo}
          onClick={() => {
            const newS = { ...S };
            newS.subs = { ...(newS.subs || {}), cp2a: { photo: draft.photo, at: Date.now() } };
            /* Stays open on purpose: the selfie reveals the riddle, which
               is the half that earns the stamp. */
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

  /* Every configured riddle needs an answer before the stamp. */
  const renderCp2b = () => {
    const riddles = CONFIG.cp.cp2b.riddles;
    const answers = draft.riddleAnswers || [];
    const answered = riddles.filter((_, i) => String(answers[i] || '').trim()).length;
    const many = riddles.length > 1;
    return (
      <div className="card flag">
        {renderCpHead(STAMP_NO.cp2b, CONFIG.cp.cp2b.title, CONFIG.cp.cp2b.kana, CONFIG.cp.cp2b.stop)}
        {String(CONFIG.cp.cp2b.body || '').trim() && (
          <div className="task">
            <Rich text={CONFIG.cp.cp2b.body} />
          </div>
        )}
        <CheckpointPhoto src={CONFIG.cp.cp2b.photo} />
        {riddles.map((riddle, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div className="task">
              {many && <div className="eyebrow" style={{ color: 'var(--red)', marginBottom: 6 }}>Riddle {i + 1} of {riddles.length}</div>}
              <Rich text={riddle} />
            </div>
            <label className="f" style={{ display: 'block' }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 5 }}>
                {many ? `Your answer to riddle ${i + 1}` : 'Your answer'}
              </span>
              <textarea
                placeholder="Write the answer your team agreed on."
                value={answers[i] || ''}
                onChange={(e) => setDraft((d) => {
                  const next = [...(d.riddleAnswers || [])];
                  next[i] = e.target.value;
                  return { ...d, riddleAnswers: next };
                })}
                style={{
                  width: '100%', fontFamily: 'var(--body)', fontSize: 16, padding: '11px 12px',
                  border: 'var(--line)', borderRadius: 7, background: 'var(--card)', color: 'var(--ink)',
                  minHeight: 90, resize: 'vertical', lineHeight: 1.5,
                }}
              />
            </label>
          </div>
        ))}
        <button
          className="btn block"
          disabled={answered < riddles.length}
          onClick={() => {
            const list = riddles.map((_, i) => String(answers[i] || '').trim());
            const newS = { ...S };
            newS.subs = { ...(newS.subs || {}), cp2b: { answers: list, answer: list.join('\n\n'), at: Date.now() } };
            newS.open = null;
            store.save(newS.teamId, newS);
            setS(newS);
            setDraft({});
            showToast(`${many ? 'Answers' : 'Answer'} sent. Stamp ${STAMP_NO.cp2b} collected.`);
          }}
          type="button"
        >
          {many ? `Send answers · ${answered}/${riddles.length}` : 'Send answer'}
        </button>
        {many && <p className="note" style={{ margin: '12px 0 0' }}>Answer all {riddles.length} riddles to collect the stamp.</p>}
      </div>
    );
  };

  const renderCp3 = () => (
    <div className="card flag">
      {renderCpHead(STAMP_NO.cp3, CONFIG.cp.cp3.title, CONFIG.cp.cp3.kana, CONFIG.cp.cp3.stop)}
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
          newS.open = null;
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
        {renderCpHead(STAMP_NO.cp4, CONFIG.cp.cp4.title, CONFIG.cp.cp4.kana, CONFIG.cp.cp4.stop)}
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
        {renderShot(draft.photo, 'Add a team photo', 'Proof you walked the stretch and made it')}
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
            newS.open = null;
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
        {renderCpHead(STAMP_NO.ask, CONFIG.cp.ask.title, CONFIG.cp.ask.kana, CONFIG.cp.ask.stop)}
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
            newS.open = null;
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
            ? 'One of the three is enough for the stamp.'
            : `${done} of ${CONFIG.ask.tasks.length} done.`}
        </p>
      </div>
    );
  };

  /* ── Game 1 — photo bingo ────────────────────────────────
     One shared card per team. Each tile belongs to one member; the Team
     Lead can fill any tile, as backup for a member who can't upload.
     All nine tiles are still needed for this stamp — that is this
     game's own rule, not a gate on the rest of the hunt, which a team
     can go and play at any time. */

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
        {renderCpHead(STAMP_NO.bingo, CONFIG.cp.bingo.title, CONFIG.cp.bingo.kana, CONFIG.cp.bingo.stop)}
        <div className="task">
          <p style={{ margin: 0 }}>Nine prompts, one photo each, each snapped by the teammate named on it. All nine earn the stamp — leave it part-filled and come back whenever you like.</p>
        </div>
        <CheckpointPhoto src={CONFIG.cp.bingo.photo} />
        {renderBingoGrid(locked)}
        {stillMissing.length > 0 && (
          <div role="alert" style={{
            marginTop: 14, padding: '10px 12px', borderRadius: 8,
            border: '2px solid var(--red)', background: 'var(--th-parchment)', fontSize: 13,
          }}>
            <b>All nine photos are needed for this stamp.</b> Still missing {stillMissing.length}:
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
            newS.open = null;
            store.save(newS.teamId, newS);
            setS(newS);
            showToast('Stamp collected.');
          }}
          type="button"
        >
          {bingoChecking ? 'Checking…' : `Collect the stamp · ${filled}/9`}
        </button>
        <p className="note" style={{ margin: '12px 0 0' }}>The stamp lands once all nine tiles have a photo.</p>
      </div>
    );
  };

  /* ── Stamp 7 — general knowledge streak ─────────────
     Multiple choice from the bank. A right answer adds to the streak, a
     wrong one resets it; reaching the target collects the stamp. */

  const renderTrivia = () => {
    const target = CONFIG.trivia.streak;
    const run = S.trivia;
    const cur = run?.current;
    const commit = (trivia) => {
      const next = { ...S, trivia };
      store.save(next.teamId, next);
      setS(next);
    };

    const pick = (opt) => {
      if (!cur || cur.picked != null) return;
      const right = opt === cur.a;
      const streak = right ? run.streak + 1 : 0;
      commit({ ...run, current: { ...cur, picked: opt }, streak, best: Math.max(run.best, streak), answered: run.answered + 1 });
      if (right) confetti(streak >= target ? { count: 220, duration: 2600 } : undefined);
    };

    const next = () => commit({ ...run, ...drawTrivia(CONFIG.trivia.bank, run.seen) });

    const collect = () => {
      const newS = { ...S };
      newS.subs = { ...(newS.subs || {}), guess: { streak: target, answered: run.answered, best: run.best, at: Date.now() } };
      newS.open = null;
      store.save(newS.teamId, newS);
      setS(newS);
      showToast('Stamp collected.');
    };

    const answered = cur?.picked != null;
    const right = answered && cur.picked === cur.a;
    const won = answered && right && run.streak >= target;
    const streak = run?.streak ?? 0;

    return (
      <div className="card flag">
        {renderCpHead(STAMP_NO.guess, CONFIG.cp.guess.title, CONFIG.cp.guess.kana, CONFIG.cp.guess.stop)}
        <div className="task">
          <p style={{ margin: 0 }}>
            <b>Get {target} questions right in a row</b> to collect this stamp. Get one wrong and your streak goes back to zero.
          </p>
          <Rich text={CONFIG.cp.guess.body} />
        </div>
        <CheckpointPhoto src={CONFIG.cp.guess.photo} />

        {/* Streak widget */}
        <div aria-live="polite" style={{
          border: 'var(--line)', borderRadius: 10, padding: '12px 14px', marginBottom: 14,
          background: streak ? 'var(--th-parchment)' : 'var(--card)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 22, lineHeight: 1, filter: streak ? 'none' : 'grayscale(1)', opacity: streak ? 1 : 0.5 }} aria-hidden="true">🔥</span>
            <b style={{ fontFamily: 'var(--display)', fontWeight: 400, fontSize: 30, lineHeight: 1 }}>{streak}</b>
            <span style={{ fontSize: 14, color: 'var(--ink-soft)' }}>/ {target} in a row</span>
            <span className="note" style={{ marginLeft: 'auto', textAlign: 'right' }}>
              Best {run?.best ?? 0} · {run?.answered ?? 0} answered
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${target}, 1fr)`, gap: 4, marginTop: 10 }} aria-hidden="true">
            {Array.from({ length: target }, (_, i) => (
              <span key={i} style={{
                height: 8, borderRadius: 4,
                background: i < streak ? 'var(--red)' : 'var(--th-slot)',
                transition: 'background .25s',
              }} />
            ))}
          </div>
        </div>

        {!cur ? (
          <p className="note">Dealing a question…</p>
        ) : (
          <>
            <p style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.35, margin: '0 0 12px' }}>{cur.q}</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {cur.options.map((opt) => {
                const isAnswer = opt === cur.a;
                const isPicked = opt === cur.picked;
                const bg = !answered ? 'var(--card)'
                  : isAnswer ? 'var(--sea)'
                  : isPicked ? 'var(--red)'
                  : 'var(--card)';
                const fg = answered && (isAnswer || isPicked) ? '#fff' : 'var(--ink)';
                return (
                  <button key={opt} type="button" onClick={() => pick(opt)} disabled={answered}
                    aria-pressed={isPicked}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                      minHeight: 50, padding: '10px 14px', borderRadius: 8, border: 'var(--line)',
                      background: bg, color: fg, font: '600 15px/1.3 var(--body)',
                      cursor: answered ? 'default' : 'pointer',
                      opacity: answered && !isAnswer && !isPicked ? 0.55 : 1,
                      boxShadow: answered ? 'none' : 'var(--hard-sm)',
                    }}>
                    <span style={{ flex: 1 }}>{opt}</span>
                    {answered && isAnswer && <span aria-label="Correct answer">✓</span>}
                    {answered && isPicked && !isAnswer && <span aria-label="Your answer, wrong">✕</span>}
                  </button>
                );
              })}
            </div>

            {answered && (
              <div role="status" style={{ marginTop: 14 }}>
                <p style={{ margin: '0 0 10px', fontWeight: 700, color: right ? 'var(--sea)' : 'var(--red)' }}>
                  {won ? `${target} in a row — you did it!`
                    : right ? `Correct! ${target - run.streak} more to go.`
                    : `Not quite — it was ${cur.a}. Streak reset to 0.`}
                </p>
                {won ? (
                  <button className="btn block" type="button" onClick={collect}>Collect the stamp</button>
                ) : (
                  <button className="btn block" type="button" onClick={next}>{right ? 'Next question' : 'Start again'}</button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  /* Whichever game the team has open, or the hub if none. The only
     gate left is inside game 3, where the selfie reveals the riddle. */
  const renderStage = () => {
    if (!S) return null;
    if (!S.open) return renderHub();
    const renderers = {
      cp1: renderCp1, cp3: renderCp3, cp4: renderCp4,
      ask: renderAsk, bingo: renderBingo, guess: renderTrivia,
      cp2: () => (S.subs?.cp2a ? renderCp2b() : renderCp2a()),
    };
    const fn = renderers[S.open];
    return fn ? fn() : renderHub();
  };

  const renderDoneScreen = () => {
    const done = doneSlots();
    const ranOut = S.startedAt && S.finishedAt >= S.startedAt + CONFIG.raceMinutes * 60000 - 1500;
    return (
      <div>
        {renderStampRally()}
        <div className="hero" style={{ padding: '10px 0' }}>
          <div className="big" style={{ fontSize: 'clamp(40px, 13vw, 62px)' }}>
            {done.size}<em>of {CONFIG.stamps} stamped</em>
          </div>
          <div className="rule" />
        </div>
        <div className="card">
          <div className="eyebrow" style={{ color: 'var(--red)' }}>{esc(S.teamName)}</div>
          <h2 className="display" style={{ fontSize: 22, margin: '4px 0 12px' }}>
            {ranOut ? 'Time’s up' : 'Hunt complete'}
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {GAMES.map((g, i) => (
              <li key={g.key} style={{
                display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0',
                borderBottom: '1px dashed var(--th-rule)', fontSize: 14,
              }}>
                <span style={{ fontFamily: 'var(--body)', fontWeight: 900, color: 'var(--red)', width: 22 }}>{i + 1}</span>
                <span>{g.short}</span>
                <span style={{ marginLeft: 'auto', fontFamily: '"DM Mono", monospace', fontSize: 12 }}>
                  {done.has(i) ? '✓' : 'skipped'}
                </span>
              </li>
            ))}
          </ul>
          <p className="note" style={{ margin: '12px 0 0' }}>The committee tallies the results at the finish point.</p>
        </div>
        {/* Finishing is the team's own call, so leave a way back in for
            anyone who tapped it early and still has time on the clock. */}
        {!ranOut && secondsLeft > 0 && (
          <div className="card">
            <p style={{ margin: '0 0 10px' }}>
              Still {mmss(secondsLeft)} on the clock. Finished by mistake?
            </p>
            <button
              className="btn block sea"
              type="button"
              onClick={() => {
                const next = { ...S, finishedAt: null, open: null };
                store.save(next.teamId, next);
                setS(next);
                setView('race');
              }}
            >
              Keep playing
            </button>
          </div>
        )}
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
                      Object.keys(run.subs || {}).map((k) => SLOT_OF[k]).filter((v) => v != null)
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
                  {s.cp2b && (s.cp2b.answers ?? [s.cp2b.answer]).map((a, ai, all) => (
                    <p key={ai} className="note" style={{ marginTop: ai ? 4 : 12 }}>
                      RIDDLE{all.length > 1 ? ` ${ai + 1}` : ''} — {esc(a).slice(0, 220)}
                    </p>
                  ))}
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
                      {s.guess.streak
                        ? `GENERAL KNOWLEDGE — ${s.guess.streak} in a row after ${s.guess.answered} questions`
                        : 'GENERAL KNOWLEDGE — done (old closest-guess answers)'}
                    </p>
                  )}
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
      <div className="sticky top-0 z-70 flex justify-between gap-2 py-1.5">
        <button
          onClick={() => setMapOpen(true)}
          type="button"
          className="px-3 py-1.5 border-2 border-ink rounded-lg font-mono text-[9px] font-bold cursor-pointer bg-card text-ink transition-all duration-100 hover:opacity-90"
        >
          🗺️ Area map
        </button>
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

      {mapOpen && <HuntMapLoader map={CONFIG.map} onClose={closeMap} />}

      {renderRules()}

      {/* Toast */}
      {toast && (
        <div className="toast">{toast}</div>
      )}
    </div>
  );
}