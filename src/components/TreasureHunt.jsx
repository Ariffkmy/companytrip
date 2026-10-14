import { Fragment, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  toRuntime, withDefaults, fetchClockReset, restartClock,
  DEFAULT_STOP_MESSAGE, HUNT_STOPPED_EVENT, fetchStop, resumeGame, stopGame,
  clearLocalRuns, fetchHuntReset, resetHunt,
} from '../lib/huntConfig';
import { cachedColleagueAnswers, fetchColleagueAnswers } from '../lib/colleagueQuiz';
import { huntGroupOf } from '../data/huntGroups';
import { listShots, uploadShot, deleteShot } from '../lib/bingo';
import { DEVICE_FULL_MESSAGE, PHOTO_PRESETS, STORAGE_FULL_MESSAGE, compressPhotoToDataUrl, photoErrorMessage } from '../lib/photos';
import confetti from '../lib/confetti';
import HuntMapLoader from './HuntMapLoader';
import { BossThread } from './BossChat';
import { framedImgStyle } from './FramedPhoto';
import {
  AWARDS, SCORED_GAMES, completedAt, cp4Verdicts, fetchResultsPublished, fetchRun, photoPathsOf, pushRun, runSummary,
  saveJudging, setResultsPublished, signPhotos,
} from '../lib/huntScores';
import { GroupDetails, GroupDot, PointsTable, QaList, TD, TH, clockTime, linkBtn, useGroupJump, useHuntBoard } from './HuntResults';

/* ═══════════════════════════════════════════════════
   Atami Treasure Hunt — Embedded Stamp Rally Game
   ═══════════════════════════════════════════════════ */


/* ── Helper functions ──────────────────────────────── */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]/g, '');

/* Downscale to a JPEG data URL (src/lib/photos.js). Preview bingo tiles
   pass the smaller preview preset. */
const compressImage = (file, preset = PHOTO_PRESETS.game) => compressPhotoToDataUrl(file, preset);

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
          ✓
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
  { key: 'cp2', short: 'Selfie + Atami quiz' },
  { key: 'cp3', short: 'Buy & try' },
  { key: 'cp4', short: 'Observation quiz' },
  { key: 'guess', short: 'Know your colleagues' },
  { key: 'boss', short: 'Find the boss' },
];

const SLOTS = GAMES.map((_, i) => i);

/* Which rally slot a saved submission fills. cp2 is a two-parter — the
   selfie opens the Atami quiz, and the quiz is what earns the stamp — so
   cp2a deliberately has no slot of its own. */
const SLOT_OF = { bingo: 0, cp1: 1, cp2b: 2, cp3: 3, cp4: 4, guess: 5, boss: 6 };

/* The number printed on each game's header. cp2a and cp2b share one. */
const STAMP_NO = { bingo: 1, cp1: 2, cp2a: 3, cp2b: 3, cp3: 4, cp4: 5, guess: 6, boss: 7 };

/* A game counts as collected once its stamping submission is in. */
const DONE_SUB = { bingo: 'bingo', cp1: 'cp1', cp2: 'cp2b', cp3: 'cp3', cp4: 'cp4', guess: 'guess', boss: 'boss' };

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

function bingoPoints(tiles, size, CONFIG) {
  const filled = (i) => !!(tiles || {})[i];
  const n = Array.from({ length: size }).reduce((acc, _, i) => acc + (filled(i) ? 1 : 0), 0);
  return n * CONFIG.bingo.tilePts + (size && n === size ? CONFIG.bingo.fullPts : 0);
}

const shuffled = (list) => {
  const a = [...list];
  for (let j = a.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [a[j], a[k]] = [a[k], a[j]];
  }
  return a;
};

/* Rows a group can be asked (public.colleague_answers): answered, with
   at least one wrong option, and about a member of its rival group
   (A ↔ B, C ↔ D). A round is every one of them. */
function colleaguePool(rows, teamId) {
  const rival = huntGroupOf(teamId)?.rival;
  return rows.filter((r) => String(r.answer ?? '').trim() && r.wrong?.length && rival && r.team === rival);
}

/* A random row the team hasn't seen this round, with the stored wrong
   options shuffled in. `seen` holds row ids. Once every row has been
   seen, it starts over. */
function drawColleague(rows, teamId, seen = []) {
  const all = colleaguePool(rows, teamId);
  if (!all.length) return { current: null, seen };
  const unseen = all.filter((r) => !seen.includes(r.id));
  const pool = unseen.length ? unseen : all;
  const r = pool[Math.floor(Math.random() * pool.length)];
  const a = r.answer.trim();
  return {
    current: { id: r.id, who: r.person, team: r.team, q: r.question, a, options: shuffled([a, ...r.wrong]), picked: null },
    seen: unseen.length ? [...seen, r.id] : [r.id],
  };
}

/* A round of the Atami quiz: `perRound` questions, ones the team hasn't
   been dealt yet first, then a top-up from the rest. `seen` holds the
   question texts dealt in earlier rounds; it starts over once every
   question has been seen. */
function drawAtami(rules, seen = []) {
  const all = rules.questions;
  let used = seen.filter((q) => all.some((x) => x.q === q));
  if (used.length >= all.length) used = [];
  const fresh = shuffled(all.filter((x) => !used.includes(x.q)));
  const round = [...fresh, ...shuffled(all.filter((x) => used.includes(x.q)))].slice(0, rules.perRound)
    .map(({ q, options, a, why }) => ({ q, options: [...options], a, why }));
  return { round, picks: [], i: 0, seen: [...new Set([...used, ...round.map((x) => x.q)])] };
}

/* Seconds left on an Atami question, as a draining bar. The deadline is
   stored in the run, so leaving the screen doesn't stop the clock;
   `onExpire` fires once when it runs out (straight away if it already
   has). */
function Countdown({ deadline, total, onExpire }) {
  const [now, setNow] = useState(() => Date.now());
  const fire = useRef(onExpire);
  fire.current = onExpire;
  useEffect(() => {
    let done = false;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (!done && t >= deadline) { done = true; fire.current(); }
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [deadline]);
  const left = Math.max(0, deadline - now);
  const secs = Math.ceil(left / 1000);
  const urgent = secs <= 3;
  return (
    <div role="timer" aria-label={`${secs} seconds left`} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px' }}>
      <div style={{ flex: 1, height: 10, borderRadius: 999, border: 'var(--line)', background: 'var(--card)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${(left / (total * 1000)) * 100}%`,
          background: urgent ? 'var(--red)' : 'var(--sea)', transition: 'width 100ms linear',
        }} />
      </div>
      <span style={{ font: '700 16px/1 "DM Mono", monospace', minWidth: 30, textAlign: 'right', color: urgent ? 'var(--red)' : 'var(--ink)' }}>
        {secs}s
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Organiser view — lives on the Admin page, not in the game.
   Every group's run comes from hunt_scores, where its leader's phone
   copies it as they play (src/lib/huntScores.js); a group that hasn't
   synced falls back to a run played on this device, if there is one.
   Points are worked out from the live config, so they always match
   what the rules say. The board, points table and group details are
   shared with the members' results on Home (./HuntResults).
   ════════════════════════════════════════════════════════════ */
export function HuntOrganiser({ config }) {
  const store = useMemo(() => makeStore(false), []);
  const loadLocal = useCallback((id) => store.load(id), [store]);
  const {
    CONFIG, remote, judging, setJudging, resetAt, setResetAt, loadedAt, refresh,
    rows, ranked, autoFirst, firstTeam,
  } = useHuntBoard(config, { loadLocal });
  const { sel, setSel, target, jump } = useGroupJump();
  const [judgeError, setJudgeError] = useState('');

  /* One restart for every team. */
  const [confirming, setConfirming] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [clockError, setClockError] = useState('');

  /* Back to "not started yet" for the real game. */
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetNote, setResetNote] = useState(null);

  /* Stopping the game for everyone, with the committee's message. */
  const [stop, setStop] = useState({ stoppedAt: 0, message: '' });
  const [stopText, setStopText] = useState(DEFAULT_STOP_MESSAGE);
  const [stopConfirm, setStopConfirm] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [stopNote, setStopNote] = useState(null);
  useEffect(() => {
    fetchStop().then((st) => { setStop(st); if (st.message) setStopText(st.message); });
  }, []);

  /* Publishing the results to every member's Home. */
  const [published, setPublished] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  useEffect(() => { fetchResultsPublished().then(setPublished); }, []);
  const togglePublished = async () => {
    setPublishing(true);
    setPublishError('');
    try {
      setPublished(await setResultsPublished(!published));
    } catch (e) {
      setPublishError(e?.message || 'Could not change that. Try again.');
    } finally {
      setPublishing(false);
    }
  };

  const handleRestart = async () => {
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    setRestarting(true);
    setClockError('');
    try {
      setResetAt(await restartClock());
      setStop((st) => ({ ...st, stoppedAt: 0 }));
    } catch (e) {
      setClockError(e?.message || 'Could not restart the clock.');
    } finally {
      setRestarting(false);
    }
  };

  const handleReset = async () => {
    if (!resetConfirm) { setResetConfirm(true); return; }
    setResetConfirm(false);
    setResetting(true);
    setResetNote(null);
    try {
      const r = await resetHunt();
      clearLocalRuns();
      setResetAt(0);
      setStop((st) => ({ ...st, stoppedAt: 0 }));
      setStopNote(null);
      setPublished(false);
      setResetNote({
        ok: r.filesFailed === 0,
        text: `Reset. Cleared ${r.scores} synced runs, ${r.bingo} bingo shots, ${r.boss} boss questions, `
          + `${r.checkins} check-ins and ${r.files} photos`
          + `${r.filesFailed ? ` (${r.filesFailed} photos couldn’t be deleted)` : ''}. `
          + 'Every game’s setup is kept. The hunt is closed — open it at the briefing from Admin → Treasure hunt.',
      });
      refresh();
    } catch (e) {
      setResetNote({ ok: false, text: /reset_hunt|reset_at|schema cache|function/i.test(e?.message ?? '')
        ? 'Run 20261020000000_hunt_reset.sql in Supabase first.'
        : e?.message || 'Could not reset. Try again.' });
    } finally {
      setResetting(false);
    }
  };

  const handleStop = async () => {
    if (!stopConfirm) { setStopConfirm(true); return; }
    setStopConfirm(false);
    setStopping(true);
    setStopNote(null);
    try {
      const { stoppedAt, announced } = await stopGame(stopText);
      setStop({ stoppedAt, message: stopText.trim() || DEFAULT_STOP_MESSAGE });
      setStopNote(announced
        ? { ok: true, text: 'Stopped. Everyone has the message, and each group’s score is recorded as its phone hears.' }
        : { ok: false, text: 'Stopped, but the popup didn’t send — run 20261017000000_announcements.sql, or send it from Admin → Announce.' });
      refresh();
    } catch (e) {
      setStopNote({ ok: false, text: /stopped_at|stop_message|schema cache/i.test(e?.message ?? '')
        ? 'Run 20261018000000_hunt_stop.sql in Supabase first.'
        : e?.message || 'Could not stop the game. Try again.' });
    } finally {
      setStopping(false);
    }
  };

  const handleResume = async () => {
    setStopping(true);
    setStopNote(null);
    try {
      await resumeGame();
      setStop((st) => ({ ...st, stoppedAt: 0 }));
      setStopNote({ ok: true, text: 'Resumed. Groups with time left can tap “Keep playing”.' });
    } catch (e) {
      setStopNote({ ok: false, text: e?.message || 'Could not resume. Try again.' });
    } finally {
      setStopping(false);
    }
  };

  /* Saved straight away; the board re-scores as soon as it changes. */
  const judge = async (next) => {
    setJudging(next);
    setJudgeError('');
    try {
      setJudging(await saveJudging(next));
    } catch (e) {
      setJudgeError(e?.message || 'Could not save that. Try again.');
      refresh();
    }
  };

  const judgedEach = Number(CONFIG.points?.judged ?? 5) || 0;
  const firstPts = Number(CONFIG.points?.first ?? 15) || 0;

  const renderPublish = () => (
    <div className="card" style={published ? { borderColor: 'var(--red)' } : {}}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px' }}>
          <div className="eyebrow" style={{ color: 'var(--red)' }}>
            {published == null ? 'Results' : published ? 'Results published' : 'Results not published'}
          </div>
          <p className="note" style={{ margin: '4px 0 0' }}>
            {published
              ? 'Every member sees the standings, points by game, and every group’s answers and photos on Home.'
              : 'Only admins can see these results. Publish to show them to every member on Home — standings, points, answers and photos for all groups.'}
          </p>
        </div>
        <button
          className={published ? 'mini' : 'btn'}
          type="button"
          disabled={publishing || published == null}
          onClick={togglePublished}
        >
          {publishing ? 'Saving…' : published ? 'Unpublish' : 'Publish results'}
        </button>
      </div>
      {publishError && <p className="note" style={{ color: 'var(--red)', margin: '10px 0 0' }}>{publishError}</p>}
    </div>
  );

  const renderClock = () => (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p className="note" style={{ margin: 0, flex: '1 1 220px' }}>
          Starts the hunt again from the beginning for every team, with a fresh {CONFIG.raceMinutes} minutes.
          Stamps, answers and points go back to zero on every phone; nothing is deleted.
          {resetAt > 0 && ` Last restarted ${clockTime(resetAt)}.`}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="mini"
            type="button"
            style={confirming ? { background: 'var(--gold)' } : {}}
            disabled={restarting}
            onClick={handleRestart}
          >
            {restarting ? 'Restarting…' : confirming ? 'Tap again to confirm' : 'Restart the clock'}
          </button>
          <button
            className="mini"
            type="button"
            style={resetConfirm ? { background: 'var(--red)', color: '#fff' } : {}}
            disabled={resetting}
            onClick={handleReset}
            onBlur={() => setResetConfirm(false)}
          >
            {resetting ? 'Resetting…' : resetConfirm ? 'Tap again to reset everything' : 'Reset for the real game'}
          </button>
        </div>
      </div>
      {clockError && <p className="note" style={{ color: 'var(--red)', margin: '10px 0 0' }}>{clockError}</p>}
      <p className="note" style={{ margin: '10px 0 0' }}>
        <b>Reset for the real game</b> clears every rehearsal: scores, bingo shots and game photos, boss chat,
        check-ins, judging, a stop and published results, and closes the hunt. Every phone goes back to the
        start screen. Games, questions, answers, reference photos and points stay as configured.
      </p>
      {resetNote && (
        <p className="note" style={{ color: resetNote.ok ? 'var(--sea)' : 'var(--red)', margin: '8px 0 0' }}>{resetNote.text}</p>
      )}

      <div style={{ borderTop: '1px dashed var(--th-rule)', marginTop: 14, paddingTop: 14 }}>
        <div className="eyebrow" style={{ color: 'var(--red)' }}>
          {stop.stoppedAt ? `Game stopped ${clockTime(stop.stoppedAt)}` : 'Stop the game'}
        </div>
        <p className="note" style={{ margin: '4px 0 8px' }}>
          Ends the hunt for every group right now. Each group’s run closes at this moment and its score
          is recorded — anything sent in after doesn’t count. Everyone gets this message as a popup:
        </p>
        <label htmlFor="stop-msg" className="sr-only">Game over message</label>
        <textarea id="stop-msg" value={stopText} maxLength={500} rows={3}
          onChange={(e) => { setStopText(e.target.value); setStopConfirm(false); }}
          style={{
            width: '100%', padding: '9px 11px', borderRadius: 8, border: '2px solid var(--ink)',
            background: 'var(--card)', color: 'var(--ink)', font: '400 15px/1.4 var(--body)', resize: 'vertical',
          }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn" type="button" onClick={handleStop}
            disabled={stopping || stop.stoppedAt > 0 || !stopText.trim()}
            style={{ background: stopConfirm ? 'var(--gold)' : 'var(--red)' }}>
            {stopping && !stop.stoppedAt ? 'Stopping…' : stopConfirm ? 'Tap again to stop the game' : '■ Stop the game now'}
          </button>
          {stop.stoppedAt > 0 && (
            <button className="mini" type="button" onClick={handleResume} disabled={stopping}>Resume the game</button>
          )}
        </div>
        {stopNote && (
          <p className="note" style={{ color: stopNote.ok ? 'var(--sea)' : 'var(--red)', margin: '10px 0 0' }}>{stopNote.text}</p>
        )}
      </div>
    </div>
  );

  /* ── Ranking ───────────────────────────────────────── */
  const renderBoard = () => (
    <div className="card flag">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div className="eyebrow" style={{ color: 'var(--red)', flex: 1 }}>Scoreboard</div>
        <button className="mini" type="button" onClick={refresh}>Refresh</button>
      </div>
      {remote === null && (
        <p className="note" style={{ color: 'var(--red)', margin: '0 0 10px' }}>
          Can’t reach the shared scoreboard, so only runs played on this device show. If the
          hunt_scores migration hasn’t been run yet, run it in Supabase.
        </p>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={TH}>#</th>
              <th style={TH}>Group</th>
              <th style={TH}>Stamps</th>
              <th style={TH}>Time</th>
              <th style={{ ...TH, textAlign: 'right' }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map(({ team, leader, run, stale, fromPhone, score }, i) => {
              const done = new Set(SCORED_GAMES.map((g, si) => (score?.games[g.key] != null ? si : null)).filter((v) => v != null));
              const left = run?.startedAt
                ? Math.max(0, Math.round(((run.startedAt + CONFIG.raceMinutes * 60000) - (run.finishedAt || Date.now())) / 1000))
                : 0;
              return (
                <tr key={team.id}>
                  <td style={{ ...TD, fontFamily: 'var(--display)', fontSize: 18 }}>{run ? i + 1 : '–'}</td>
                  <td style={TD}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <GroupDot colour={team.colour} />
                      <button type="button" onClick={() => jump(team.id)} aria-label={`See ${team.name}’s answers and photos`}
                        style={{ ...linkBtn, fontWeight: 700, fontSize: 13, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                        {team.name}
                      </button>
                    </span>
                    <br /><span className="note">
                      {leader ? `Leader ${leader}` : '—'}
                      {stale ? ' · before the restart' : fromPhone ? ' · this device only' : ''}
                    </span>
                  </td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                    {SLOTS.map((si) => (
                      <span key={si} style={{
                        display: 'inline-block', width: 11, height: 11, borderRadius: '50%',
                        border: '2px solid var(--ink)', marginRight: 3,
                        background: done.has(si) ? 'var(--red)' : 'var(--th-slot)',
                      }} />
                    ))}
                  </td>
                  <td style={{ ...TD, fontFamily: '"DM Mono", monospace', fontSize: 11, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                    {!run ? 'NOT STARTED' : run.finishedAt ? `DONE ${clockTime(run.finishedAt)}` : mmss(left)}
                  </td>
                  <td style={{ ...TD, textAlign: 'right' }}>
                    <b className="display" style={{ fontSize: 20 }}>{score ? score.total : '–'}</b>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {loadedAt > 0 && (
        <p className="note" style={{ margin: '10px 0 0' }}>
          Updates every 15 seconds · last {new Date(loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
      )}
    </div>
  );

  /* ── Judged at the finish ──────────────────────────── */
  const renderAwards = () => {
    const completed = rows.map((r) => ({ ...r, at: completedAt(r.run) }))
      .filter((r) => r.at != null && Number.isFinite(r.at)).sort((a, b) => a.at - b.at);
    const pill = (on) => ({
      padding: '5px 10px', borderRadius: 999, border: '2px solid var(--ink)', cursor: 'pointer',
      font: '700 12px/1.2 var(--body)', background: on ? 'var(--red)' : 'var(--card)', color: on ? '#fff' : 'var(--ink)',
    });
    return (
      <div className="card">
        <div className="eyebrow" style={{ color: 'var(--red)', marginBottom: 4 }}>Judged awards · {judgedEach} pts each</div>
        <p className="note" style={{ margin: '0 0 10px' }}>Tap the winning group. Tap it again to take the award back.</p>
        {AWARDS.map((a) => {
          const winner = judging.awards?.[a.key] ?? null;
          return (
            <div key={a.key} style={{ padding: '8px 0', borderBottom: '1px dashed var(--th-rule)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{a.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {rows.map(({ team }) => (
                  <button key={team.id} type="button" aria-pressed={winner === team.id} style={pill(winner === team.id)}
                    onClick={() => judge({
                      ...judging,
                      awards: { ...(judging.awards ?? {}), [a.key]: winner === team.id ? null : team.id },
                    })}>
                    {team.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {/* First to complete: worked out from when each group collected
            its seventh game. A pick here overrides it. */}
        <div style={{ padding: '12px 0 0' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>First team to complete · {firstPts} pts</div>
          <p className="note" style={{ margin: '0 0 6px' }}>
            {completed.length
              ? `All 7 games: ${completed.map((r) => `${r.team.name} ${clockTime(r.at)}`).join(' · ')}.`
              : 'No group has completed all 7 games yet.'}
            {judging.first ? ' Set by hand.' : autoFirst ? ' Given automatically.' : ''}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button type="button" aria-pressed={!judging.first} style={pill(!judging.first)}
              onClick={() => judge({ ...judging, first: null })}>
              Automatic{autoFirst ? ` (${CONFIG.teams.find((t) => t.id === autoFirst)?.name ?? autoFirst})` : ''}
            </button>
            {rows.map(({ team }) => (
              <button key={team.id} type="button" aria-pressed={judging.first === team.id} style={pill(judging.first === team.id)}
                onClick={() => judge({ ...judging, first: judging.first === team.id ? null : team.id })}>
                {team.name}
              </button>
            ))}
          </div>
        </div>
        {judgeError && <p className="note" style={{ color: 'var(--red)', margin: '10px 0 0' }}>{judgeError}</p>}
      </div>
    );
  };

  /* ── Look around you: typed answers, marked here ───── */
  const renderMarking = () => {
    const sent = rows.filter((r) => Array.isArray(r.run?.subs?.cp4?.answers));
    const questions = CONFIG.quiz.questions;
    const mark = (teamId, i, value) => {
      const mine = { ...(judging.cp4?.[teamId] ?? {}) };
      if (value === null) delete mine[i]; else mine[i] = value;
      judge({ ...judging, cp4: { ...(judging.cp4 ?? {}), [teamId]: mine } });
    };
    const btn = (on, colour) => ({
      width: 34, height: 30, borderRadius: 7, border: '2px solid var(--ink)', cursor: 'pointer', flex: 'none',
      font: '700 14px/1 var(--body)', background: on ? colour : 'var(--card)', color: on ? '#fff' : 'var(--ink)',
    });
    return (
      <div className="card">
        <div className="eyebrow" style={{ color: 'var(--red)', marginBottom: 4 }}>
          Mark {gameTitle('cp4', CONFIG.cp)} · {CONFIG.points.quizPerAnswer} pts a right answer
        </div>
        <p className="note" style={{ margin: '0 0 10px' }}>
          Answers that match the accepted list are marked for you; mark the rest. Tap ✓ or ✗ again to undo.
        </p>
        {sent.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>No group has sent its answers yet.</p>
        ) : sent.map(({ team, run }) => {
          const verdicts = cp4Verdicts(run.subs.cp4, questions, judging.cp4?.[team.id]);
          const open = verdicts.filter((v) => v.mark === null).length;
          return (
            <details key={team.id} open style={{ padding: '8px 0', borderBottom: '1px dashed var(--th-rule)' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                <GroupDot colour={team.colour} /> {team.name} · {verdicts.filter((v) => v.mark === true).length}/{questions.length} right
                {open > 0 && <span style={{ color: 'var(--red)' }}> · {open} to mark</span>}
              </summary>
              {questions.map((q, i) => {
                const v = verdicts[i];
                const set = judging.cp4?.[team.id]?.[i];
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="note" style={{ margin: 0 }}>{i + 1}. {q.q}</div>
                      <div style={{ fontWeight: 700, fontSize: 14, overflowWrap: 'anywhere' }}>
                        {String(run.subs.cp4.answers[i] ?? '').trim() || '—'}
                        {v.auto && <span className="note" style={{ fontWeight: 400 }}> · auto</span>}
                      </div>
                    </div>
                    <button type="button" aria-label={`Right: ${team.name} question ${i + 1}`} aria-pressed={v.mark === true}
                      style={btn(v.mark === true, 'var(--sea)')} onClick={() => mark(team.id, i, set === true ? null : true)}>✓</button>
                    <button type="button" aria-label={`Wrong: ${team.name} question ${i + 1}`} aria-pressed={v.mark === false}
                      style={btn(v.mark === false, 'var(--red)')} onClick={() => mark(team.id, i, set === false ? null : false)}>✗</button>
                  </div>
                );
              })}
            </details>
          );
        })}
        {judgeError && <p className="note" style={{ color: 'var(--red)', margin: '10px 0 0' }}>{judgeError}</p>}
      </div>
    );
  };

  return (
    <div>
      <div className="hero" style={{ padding: '10px 0' }}>
        <div className="big" style={{ fontSize: 'clamp(36px, 12vw, 54px)' }}>Organiser</div>
        <div className="rule" />
      </div>
      {renderPublish()}
      {renderClock()}
      {remote === undefined ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Loading the scoreboard…</p></div>
      ) : (
        <>
          {renderBoard()}
          <PointsTable CONFIG={CONFIG} rows={rows} onPick={jump} />
          {renderAwards()}
          {renderMarking()}
          <GroupDetails CONFIG={CONFIG} rows={rows} judging={judging} resetAt={resetAt} firstTeam={firstTeam}
            title="Every group’s answers and photos" sel={sel} onSel={setSel} target={target} />
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Main Game Component
   ════════════════════════════════════════════════════════════ */

/* `isOpen` is the committee's switch. It gates starting a run, not
   playing one: a team already out there keeps its progress if the
   switch is thrown, because losing a half-finished submission in a
   backstreet is worse than letting them finish. Defaults true so the
   admin preview plays regardless.

   Read only: `viewTeamId` opens a group's game page from the published
   results (at `viewGame`, if given). Publishing shows the results; it
   does not end the game. So the group's own leader, tapping their own
   group, gets their live page back, and everyone else looks without
   touching: nothing is saved, synced or uploaded from a read-only page. */
export default function TreasureHunt({
  onClose, teamId, config, isOpen = true, preview = false, huntLeader = null,
  viewTeamId = null, viewGame = null,
}) {
  const CONFIG = useMemo(() => toRuntime(config ?? withDefaults(null)), [config]);
  const ownLivePage = viewTeamId != null && viewTeamId === teamId && huntLeader !== false;
  const readOnly = !preview && viewTeamId != null && !ownLivePage;
  /* Set once showToast exists: says so when the phone is too full to
     keep the run (its photos are most of it). */
  const onDeviceFull = useRef(null);
  const store = useMemo(() => {
    const s = makeStore(preview);
    /* Reads the phone's copy; never writes it. */
    if (readOnly) return { load: s.load, save: () => true, remove: () => {} };
    return {
      ...s,
      save: (id, state) => {
        const ok = s.save(id, state);
        if (!ok) onDeviceFull.current?.();
        return ok;
      },
    };
  }, [preview, readOnly]);
  /* Preview only: which team the admin is playing as. */
  const [previewTeam, setPreviewTeam] = useState(teamId ?? 'group-a');
  const activeTeamId = preview ? previewTeam : (viewTeamId ?? teamId);
  const ownTeam = activeTeamId === teamId;
  /* Only the group's hunt leader runs its games
     (20261012000000_hunt_leader.sql). The hunt leader is a different
     person from the trip Team Lead: the Team Lead plays like anyone
     else. `huntLeader === false` means the flag is set and this member
     is not the leader; null means the flag is not set up yet, so
     nothing is locked. Admins and the editor's preview never lock out. */
  const canPlay = preview || huntLeader !== false;
  const leaderName = huntGroupOf(activeTeamId)?.leader ?? null;
  /* Tells the leader it's them who runs the games. */
  const leaderBadge = (style) => (huntLeader === true && !preview && ownTeam ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, flex: 'none',
      padding: '2px 9px', borderRadius: 999, border: '2px solid var(--ink)',
      background: 'var(--red)', color: '#fff', font: '700 11px/1.3 var(--body)',
      letterSpacing: '.02em', whiteSpace: 'nowrap', ...style,
    }}>★ Group leader</span>
  ) : null);
  const [view, setView] = useState('start'); // start | race | done
  const [S, setS] = useState(null);
  const [draft, setDraft] = useState({});
  const [tick, setTick] = useState(null);
  const [toast, setToast] = useState(null);
  /* Shared bingo card for the active team: { [tile]: shot }. Preview keeps
     its shots in memory. */
  const [shots, setShots] = useState({});
  /* When the committee last restarted the hunt (epoch ms, 0 = never).
     Bingo shots from before it don't count any more. */
  const [huntResetAt, setHuntResetAt] = useState(0);
  const [busyTile, setBusyTile] = useState(null);
  /* The bingo tile opened full-size: its photo to find, and the team's shot. */
  const [openTile, setOpenTile] = useState(null);
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
  useEffect(() => {
    if (openTile == null) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpenTile(null); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [openTile]);
  const showToast = useCallback((msg, ms = 2600) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), ms);
  }, []);
  onDeviceFull.current = () => showToast(DEVICE_FULL_MESSAGE, 6000);

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
    if (readOnly || view !== 'race' || !S?.startedAt || S.finishedAt || secondsLeft === null) return;
    if (secondsLeft <= 0) finishRun(S);
  }, [readOnly, view, S, secondsLeft, finishRun]);

  /* Deal the first colleague question when the team opens it.
     The question and any answer picked are saved with the run, so a
     reload can't be used to dodge a question. */
  const onTrivia = S?.open === 'guess';
  /* The questions and answers, from the database each time the game is
     opened; this phone's last copy until then, or with no signal. */
  const [colleague, setColleague] = useState(() => cachedColleagueAnswers());
  useEffect(() => {
    if (!onTrivia) return undefined;
    let live = true;
    fetchColleagueAnswers().then((rows) => { if (live) setColleague(rows); });
    return () => { live = false; };
  }, [onTrivia]);
  useEffect(() => {
    if (!onTrivia || readOnly) return;
    /* A question left over from the general knowledge game that this stamp
       used to be (no row id) is thrown away, along with its old streak. */
    const leftover = S.trivia?.current && S.trivia.current.id == null;
    if (!leftover && (S.trivia?.current || !colleaguePool(colleague, S.teamId).length)) return;
    const seen = leftover ? [] : S.trivia?.seen;
    const next = { ...S, trivia: { results: leftover ? [] : (S.trivia?.results ?? []), ...drawColleague(colleague, S.teamId, seen) } };
    store.save(next.teamId, next);
    setS(next);
  }, [onTrivia, readOnly, S, colleague, store]);

  const currentTeam = S ? CONFIG.teams.find((t) => t.id === S.teamId) : null;
  const bingoCard = CONFIG.teams.find((t) => t.id === activeTeamId)?.bingo ?? [];

  /* Teammates fill tiles from their own phones — keep the card fresh
     while it can be seen. */
  /* Resolves to the fresh { [tile]: shot }, or null when offline. */
  const refreshShots = useCallback(async () => {
    if (preview || !activeTeamId) return null;
    try {
      const rows = await listShots(activeTeamId);
      const current = rows.filter((r) => !huntResetAt || new Date(r.created_at).getTime() > huntResetAt);
      const next = Object.fromEntries(current.map((r) => [r.tile, r]));
      setShots(next);
      return next;
    } catch { return null; /* offline — keep what is on screen */ }
  }, [preview, activeTeamId, huntResetAt]);

  useEffect(() => {
    if (preview) { setShots({}); return undefined; }
    if (view !== 'start' && view !== 'race') return undefined;
    refreshShots();
    const id = setInterval(() => { if (!document.hidden) refreshShots(); }, 20000);
    return () => clearInterval(id);
  }, [preview, view, refreshShots, activeTeamId]);

  /* How to play: a popup, so the game page itself stays clean. It opens
     by itself the first time a game is opened on this phone, and the
     "How to play" button brings it back. */
  const [howToKey, setHowToKey] = useState(null);
  const gameKey = S?.open === 'cp2' ? (S.subs?.cp2a ? 'cp2b' : 'cp2a') : S?.open ?? null;
  useEffect(() => {
    if (!gameKey || readOnly || view !== 'race') return;
    const seenKey = `olc-howto:${gameKey}`;
    try {
      if (localStorage.getItem(seenKey)) return;
      localStorage.setItem(seenKey, '1');
    } catch (e) { /* silent */ }
    setHowToKey(gameKey);
  }, [gameKey, readOnly, view]);

  /* ── Committee clock restart ─────────────────────────
     The committee can give every team a fresh race clock from Admin →
     Organiser. Every team starts the hunt again from the beginning: no
     stamps, answers or points, timed from when this phone hears about it
     so a skewed laptop clock can't eat into it. Nothing is deleted —
     bingo photos taken before the restart stay in storage, they just
     no longer fill the card (see `shots` below). */
  const checkClockReset = useCallback(async () => {
    if (preview || !activeTeamId) return;
    /* Reset for the real game: a rehearsal's run is thrown away and the
       team is back on the start screen, waiting for the briefing. */
    const wiped = await fetchHuntReset();
    const old = store.load(activeTeamId);
    if (wiped && old?.startedAt && old.startedAt < wiped) {
      clearLocalRuns(activeTeamId);
      setTick(null);
      setDraft({});
      setOpenTile(null);
      setBingoMissing(null);
      setS(null);
      setView('start');
      setHuntResetAt(0);
      showToast('The committee reset the hunt — it starts fresh at the briefing.', 5000);
      return;
    }
    const at = await fetchClockReset();
    setHuntResetAt(at);
    const run = store.load(activeTeamId);
    if (!at || !run?.startedAt || at <= run.startedAt || at === run.clockReset) return;
    /* The old run is kept beside the new one (its photos still show in
       the album). If the phone is too full to keep both, the restart
       waits rather than lose it. */
    if (!store.save(`${run.teamId}@${at}`, run)) return;
    const next = {
      ...blankState({ id: run.teamId, name: run.teamName }),
      members: run.members, startedAt: Date.now(), clockReset: at,
    };
    store.save(next.teamId, next);
    setTick(null);
    setDraft({});
    setOpenTile(null);
    setBingoMissing(null);
    setS((cur) => (cur ? next : cur));
    setView((v) => (v === 'done' ? 'race' : v));
    showToast('The committee restarted the hunt — start again from the beginning');
  }, [preview, activeTeamId, store, showToast]);

  useEffect(() => {
    if (preview || readOnly) return undefined;
    checkClockReset();
    const id = setInterval(() => { if (!document.hidden) checkClockReset(); }, 20000);
    return () => clearInterval(id);
  }, [preview, readOnly, checkClockReset]);

  /* ── Read only ───────────────────────────────────────
     The group's run as it stands: this phone's own copy for the
     member's own group (it has the photos), otherwise what the leader's
     phone synced. Straight to the games list — or the game asked for. */
  const [signed, setSigned] = useState({});
  const [roState, setRoState] = useState(readOnly ? 'loading' : null); // loading · ready · none
  useEffect(() => {
    if (!readOnly || !activeTeamId) return undefined;
    let live = true;
    (async () => {
      const at = await fetchClockReset();
      const local = ownTeam ? store.load(activeTeamId) : null;
      const mine = local?.startedAt && (!at || local.startedAt >= at) ? local : null;
      const run = mine ?? await fetchRun(activeTeamId);
      if (!live) return;
      /* Nothing synced: still show the group's pages — its games, places,
         poses and questions — just with nothing sent in. */
      const team = CONFIG.teams.find((t) => t.id === activeTeamId) ?? { id: activeTeamId, name: activeTeamId };
      setHuntResetAt(at);
      setS({ ...(run?.startedAt ? run : blankState(team)), open: viewGame ?? null });
      setRoState('ready');
      setView('race');
    })();
    return () => { live = false; };
  }, [readOnly, activeTeamId, ownTeam, viewGame, store, CONFIG]);

  /* Synced photos are storage paths; sign them to show. */
  const photoKey = readOnly ? photoPathsOf(S).join('|') : '';
  useEffect(() => {
    if (!photoKey) return undefined;
    let live = true;
    signPhotos(photoKey.split('|')).then((u) => { if (live) setSigned(u); });
    return () => { live = false; };
  }, [photoKey]);
  const srcOf = (p) => (typeof p === 'string' ? p : p?.path ? signed[p.path] ?? null : null);

  /* ── Scoreboard sync ─────────────────────────────────
     Copies the run (without photos) to hunt_scores so Admin → Organiser
     sees every group. Shortly after each change, and again every 30 s
     until it lands — Atami's signal comes and goes. Only the leader's
     phone plays, so only it writes; RLS refuses anyone else anyway. */
  const syncedRef = useRef('');
  /* Said once per visit: it retries every 30 s, and once is enough. */
  const warnedFullRef = useRef(false);
  const onStorageFull = useCallback(() => {
    if (warnedFullRef.current) return;
    warnedFullRef.current = true;
    showToast(`Your answers and points are saved, but the photos can’t upload yet. ${STORAGE_FULL_MESSAGE}`, 8000);
  }, [showToast]);
  useEffect(() => {
    if (preview || readOnly || !canPlay || !S?.teamId || !S.startedAt) return undefined;
    const body = JSON.stringify(runSummary(S));
    if (body === syncedRef.current) return undefined;
    const run = S;
    const push = async () => {
      if (syncedRef.current === body) return;
      if (await pushRun(run, { onStorageFull })) syncedRef.current = body;
    };
    const t = setTimeout(push, 1500);
    const id = setInterval(() => { if (!document.hidden) push(); }, 30000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [preview, readOnly, canPlay, S, onStorageFull]);

  /* ── Committee stop ──────────────────────────────────
     Admin → Organiser → Stop the game. The run closes at the moment the
     committee pressed it, wherever this phone was: anything sent in
     after that doesn't count. Then the score syncs at once. Heard from
     the game-over popup straight away (HUNT_STOPPED_EVENT), and checked
     every 20 s and on coming back to the app in case that was missed. */
  const [stoppedAt, setStoppedAt] = useState(0);
  const [stopMessage, setStopMessage] = useState('');
  const checkStop = useCallback(async () => {
    if (preview) return;
    const { stoppedAt: at, message } = await fetchStop();
    setStoppedAt(at);
    setStopMessage(message);
    if (readOnly || !at || !activeTeamId) return;
    const run = store.load(activeTeamId);
    if (!run?.startedAt || at <= run.startedAt || (run.finishedAt && run.finishedAt <= at)) return;
    const subs = Object.fromEntries(Object.entries(run.subs || {}).filter(([, v]) => !(v?.at > at)));
    const next = { ...run, subs, open: null, finishedAt: at, stoppedAt: at };
    store.save(next.teamId, next);
    setS((cur) => (cur ? next : cur));
    setDraft({});
    setOpenTile(null);
    setView((v) => (v === 'race' ? 'done' : v));
    if (canPlay) pushRun(next, { onStorageFull });
  }, [preview, readOnly, activeTeamId, store, canPlay, onStorageFull]);

  useEffect(() => {
    if (preview) return undefined;
    checkStop();
    const id = setInterval(() => { if (!document.hidden) checkStop(); }, 20000);
    const onVisible = () => { if (document.visibilityState === 'visible') checkStop(); };
    window.addEventListener(HUNT_STOPPED_EVENT, checkStop);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener(HUNT_STOPPED_EVENT, checkStop);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [preview, checkStop]);

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
        <div style={{ padding: '0 4px 10px' }}>
          <b style={{ fontFamily: 'var(--display)', fontSize: 15, letterSpacing: '.06em' }}>Stamp rally</b>
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
          position: 'fixed', inset: 0, zIndex: 95,
          background: 'rgba(10,10,12,.55)', padding: '24px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* The card stays put; only the rules between the title and the
            button scroll, so "Got it" is always in reach. */}
        <div
          className="card"
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: 540, width: '100%', margin: 0, maxHeight: '100%',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          <div className="eyebrow" style={{ color: 'var(--red)' }}>About</div>
          <h2 className="display" style={{ fontSize: 25, margin: '4px 0 2px' }}>How it works</h2>
          <p className="note" style={{ margin: '0 0 12px' }}>
            {CONFIG.stamps} games · any order · {CONFIG.raceMinutes} minutes
          </p>
          <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            <div className="task">
              <Rich text={CONFIG.rules} />
            </div>
            <p style={{ margin: '12px 0 0' }}>
              <b>Finish:</b> {CONFIG.finishPoint}
            </p>
            {CONFIG.helpNote && <p className="note" style={{ marginTop: 10 }}>{CONFIG.helpNote}</p>}
          </div>
          <button className="btn block" style={{ marginTop: 16, flex: 'none' }} type="button" onClick={close} autoFocus>
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
          <div className="eyebrow" style={{ color: 'var(--red)' }}>{readOnly ? `Read only · ${huntGroupOf(activeTeamId)?.name ?? 'this group'}` : 'Pick any one'}</div>
          <h2 className="display" style={{ fontSize: 22, margin: '4px 0 6px' }}>
            {readOnly ? `${done.size} of ${CONFIG.stamps} stamps collected`
              : left === 0 ? 'Every stamp collected' : `${left} still to play`}
          </h2>
          <p style={{ margin: '0 0 10px' }}>
            {readOnly
              ? `Open any game to see what ${esc(S.teamName)} sent in — the photos and the answers. Nothing can be changed any more.`
              : 'Play them in whatever order suits where you are. Skip anything you don’t fancy — an unplayed game just scores nothing.'}
          </p>
          {huntGroupOf(activeTeamId)?.members?.length > 0 && (
            <p className="note" style={{ margin: '0 0 10px' }}>
              {huntGroupOf(activeTeamId).name}:{' '}
              {huntGroupOf(activeTeamId).members
                .map((m) => (m === huntGroupOf(activeTeamId).leader ? `${m} ★` : m))
                .join(', ')}
            </p>
          )}
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
                    }}>{isDone ? '✓' : i + 1}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <b style={{ display: 'block', fontSize: 15, lineHeight: 1.25 }}>
                        {gameTitle(g.key, CONFIG.cp)}
                      </b>
                      <span className="note">
                        {isDone ? 'Stamp collected'
                          : started ? (readOnly ? 'Selfie in — quiz not passed' : 'Selfie in — quiz waiting')
                          : readOnly ? 'Not played' : g.short}
                      </span>
                    </span>
                    <span aria-hidden="true" style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
                      {isDone || readOnly ? 'View' : 'Open'} →
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {CONFIG.helpNote && !readOnly && <p className="note" style={{ marginTop: 12 }}>{CONFIG.helpNote}</p>}
        </div>

        {!readOnly && <div style={{
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
        </div>}
      </div>
    );
  };

  const renderStartScreen = () => {
    const team = CONFIG.teams.find((t) => t.id === activeTeamId);
    const existing = team ? store.load(team.id) : null;
    const underway = Boolean(existing?.startedAt);
    /* Shut, and this team has not started: nothing to carry on with. */
    const over = stoppedAt > 0 && !preview;
    const shut = (!isOpen || over) && !preview && !underway;

    return (
      <div>
        {shut && (
          <div className="card flag">
            <div className="eyebrow" style={{ color: 'var(--red)' }}>{over ? 'Game over' : 'Not yet'}</div>
            <h2 className="display" style={{ fontSize: 24, margin: '4px 0 8px' }}>
              {over ? 'The hunt is over' : 'The hunt hasn’t started'}
            </h2>
            <p style={{ margin: 0 }}>
              {over ? (stopMessage || DEFAULT_STOP_MESSAGE)
                : 'The committee opens it at the briefing. Come back to this screen then — you don’t need to do anything now.'}
            </p>
            {CONFIG.helpNote && <p className="note" style={{ marginTop: 12 }}>{CONFIG.helpNote}</p>}
          </div>
        )}
        {/* Until the committee opens it, that card is all there is. */}
        {!shut && <div className="card">
          <div className="eyebrow" style={{ color: 'var(--red)' }}>Your team</div>
          {team ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '8px 0 4px' }}>
                <span aria-hidden="true" style={{
                  width: 30, height: 30, borderRadius: '50%', border: '2px solid var(--ink)',
                  background: team.colour, flex: 'none',
                }} />
                <b className="display" style={{ fontSize: 24 }}>{team.name}</b>
                {leaderBadge()}
              </div>
              <button
                className="btn block"
                style={{ marginTop: 14, ...(shut || !canPlay ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
                disabled={shut || !canPlay}
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
                {!canPlay ? 'Only your group leader plays'
                  : shut ? 'Waiting for the committee'
                  : underway ? (existing.finishedAt ? 'See your stamps' : 'Carry on') : 'Start the hunt'}
              </button>
              <div style={{ marginTop: 12 }}>{rulesButton()}</div>
              <p className="note" style={{ margin: '12px 0 0' }}>
                {!canPlay ? `Only your group leader${leaderName ? ` (${leaderName})` : ''} runs the games for ${team.name}. You can still take photo bingo shots and ask the bosses below.`
                  : shut ? 'This opens when the committee starts the game.'
                  : underway ? 'Pick up where your team left off.' : 'Keep this tab open while you play.'}
              </p>
            </>
          ) : (
            <>
              <h2 className="display" style={{ fontSize: 24, margin: '4px 0 8px' }}>Not in a group</h2>
              <p style={{ margin: 0 }}>You’re not in a hunt group. If you should be, ask the committee to add you, then come back here.</p>
            </>
          )}
        </div>}
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
          </select>
        </label>
      </div>
    </div>
  );

  const renderHeader = () => {
    if ((view !== 'race' && view !== 'done') || !S) return null;
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--th-label)', letterSpacing: '.1em' }}>
                {doneCount}/{CONFIG.stamps} STAMPS
              </span>
              {leaderBadge({ border: 'none', fontSize: 10, padding: '1px 7px' })}
            </div>
          </div>
          {readOnly && (
            <span style={{
              flex: 'none', padding: '3px 9px', borderRadius: 999, border: '2px solid var(--gold)',
              color: 'var(--gold)', font: '700 10px/1.3 var(--mono)', letterSpacing: '.1em',
            }}>READ ONLY</span>
          )}
          {view === 'race' && !readOnly && secondsLeft !== null && (
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

  /* The way out of a game is the "Main menu" button in the sticky bar:
     leaving one half-done and picking another is normal play. */
  const renderCpHead = (n, title, stop) => (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{
          flex: 'none', width: 42, height: 42, borderRadius: '50%',
          background: 'var(--ink)', color: 'var(--gold)',
          display: 'grid', placeItems: 'center', fontFamily: 'var(--body)',
          fontWeight: 900, fontSize: 19,
        }}>{n}</div>
        <div>
          <div className="eyebrow" style={{ color: 'var(--red)' }}>Stamp {n} of {CONFIG.stamps}</div>
          <h2 className="display" style={{ fontSize: 25, margin: '2px 0 1px' }}>{title}</h2>
          {renderStop(stop, { color: 'var(--sea)' })}
        </div>
      </div>
      {renderLeaderNote(n)}
    </>
  );

  /* Who does what: every game is sent in from the leader's phone
     (20261012000000_hunt_leader.sql), so each one says so. Not on the
     read-only pages, where nobody is playing. */
  const LEADER_NOTE = {
    [STAMP_NO.cp1]: 'only the group leader takes and sends the pose photo.',
    [STAMP_NO.cp2a]: 'only the group leader sends the selfie and answers the questions.',
    [STAMP_NO.cp3]: 'only the group leader sends the item and everyone’s photos.',
    [STAMP_NO.cp4]: 'only the group leader types in the answers. Work them out together.',
    [STAMP_NO.guess]: 'only the group leader picks the answers. Decide together first.',
    [STAMP_NO.boss]: 'only the group leader sends the photo. Anyone in the group can ask the bosses.',
  };
  const renderLeaderNote = (n) => (readOnly || !LEADER_NOTE[n] ? null : (
    <p style={{
      margin: '0 0 12px', padding: '6px 10px', borderRadius: 7, background: 'var(--th-parchment)',
      border: '1px dashed var(--th-rule)', fontSize: 13, lineHeight: 1.4,
    }}>
      <b style={{ color: 'var(--red)' }}>★ Leader only</b> — {LEADER_NOTE[n]}
    </p>
  ));

  /* How to play: a few plain steps at the top of every game, so nobody
     has to work the rules out from the screen. Not on read-only pages. */
  const howTo = (key) => {
    const a = CONFIG.atami;
    return {
      bingo: [
        'Tap a tile to see its photo full-size.',
        'Find that spot and take a selfie of the whole team there.',
        'Anyone in the group can take any tile, from their own phone.',
        'When every tile has a photo, the leader taps “Collect the stamp”.',
      ],
      cp1: [
        'Go to the place in the WHERE photo.',
        'Copy the pose in the POSE photo — the whole team.',
        'Take one group photo and tap “Send photo”.',
      ],
      cp2a: [
        'Find the landmark in the WHERE photo.',
        'Take a selfie with everyone in it and the landmark behind you, then tap “Send selfie”.',
        'The Atami quiz opens next — passing it earns the stamp.',
      ],
      cp2b: [
        `Tap “Start” for ${a.perRound} questions${a.secs ? `, ${a.secs} seconds each` : ''}.`,
        'Tap the answer you think is right.',
        `Get ${a.passMark} right to pass. Miss it and you start again with new questions.`,
        'Then tap “Collect the stamp”.',
      ],
      cp3: [
        'Each member buys something — any amount.',
        'Type what you bought.',
        'Tap each person’s box to take their photo with it.',
        'When everyone has a photo, tap “Send it”.',
      ],
      cp4: [
        'Work the answers out together.',
        'Type one answer for each question.',
        'Tap “Send answers” — you only send once, so check them first.',
      ],
      guess: [
        'Read the name and the question about that colleague.',
        'Tap the answer you think is right. A wrong pick shows the right one.',
        'After the last question, tap “Collect the stamp”.',
      ],
      boss: [
        'Ask the bosses questions in the chat below — they only answer yes or no.',
        'Use the answers to work out where they are, and go find them.',
        'Take one funny-pose photo of the whole team with the bosses and tap “Send photo”.',
      ],
    }[key] ?? [];
  };
  const renderHowTo = (key) => (readOnly || !howTo(key).length ? null : (
    <button className="mini" type="button" onClick={() => setHowToKey(key)} style={{ margin: '0 0 12px' }}>
      ⓘ How to play
    </button>
  ));
  const renderHowToPopup = () => {
    const steps = howToKey ? howTo(howToKey) : [];
    if (!steps.length) return null;
    const close = () => setHowToKey(null);
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="howto-title" onClick={close} style={{
        position: 'fixed', inset: 0, zIndex: 96, background: 'rgba(10,10,12,.55)',
        padding: '24px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, width: '100%', margin: 0 }}>
          <div className="eyebrow" style={{ color: 'var(--red)' }}>How to play</div>
          <h2 id="howto-title" className="display" style={{ fontSize: 24, margin: '4px 0 10px' }}>
            {CONFIG.cp[howToKey]?.title ?? 'This game'}
          </h2>
          <ol style={{ margin: 0, paddingLeft: 22, fontSize: 15, lineHeight: 1.45 }}>
            {steps.map((t, i) => <li key={i} style={{ marginTop: 6 }}>{t}</li>)}
          </ol>
          <button className="btn block" type="button" onClick={close} autoFocus style={{ marginTop: 16 }}>Got it</button>
        </div>
      </div>
    );
  };

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
            if (f) handleFile(f, 'photo').catch((err) => showToast(photoErrorMessage(err)));
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
        {renderCpHead(STAMP_NO.cp1, CONFIG.cp.cp1.title, CONFIG.cp.cp1.stop)}
        {renderHowTo('cp1')}
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

  /* ── Stamp 7 — Find the boss ───────────────────────
     Tim and Ellice are somewhere in the field. Find them, and send one
     photo of the whole team pulling a funny pose with them. */
  const renderBoss = () => (
    <div className="card flag">
      {renderCpHead(STAMP_NO.boss, CONFIG.cp.boss.title, CONFIG.cp.boss.stop)}
      {renderHowTo('boss')}
      <div className="task">
        <Rich text={CONFIG.cp.boss.body} />
      </div>
      <BossThread team={activeTeamId} canAsk={!preview && isOpen}
        offNote={preview ? 'Preview: the live chat is off here.' : 'Opens when the hunt starts.'} />
      <CheckpointPhoto src={CONFIG.cp.boss.photo} />
      {renderShot(draft.photo, 'Add your photo with the bosses', 'Tim, Ellice and all of you · funny pose')}
      <button
        className="btn block"
        style={{ marginTop: 14 }}
        disabled={!draft.photo}
        onClick={() => {
          const newS = { ...S };
          newS.subs = { ...(newS.subs || {}), boss: { photo: draft.photo, at: Date.now() } };
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

  const renderCp2a = () => {
    const t = currentTeam;
    if (!t) return null;
    const s = t.spot;
    return (
      <div className="card flag">
        {renderCpHead(STAMP_NO.cp2a, CONFIG.cp.cp2a.title, CONFIG.cp.cp2a.stop)}
        {renderHowTo('cp2a')}
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
            /* Stays open on purpose: the selfie reveals the Atami quiz,
               which is the half that earns the stamp. */
            store.save(newS.teamId, newS);
            setS(newS);
            setDraft({});
            showToast('Selfie in. Atami quiz unlocked.');
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
          <b style={{ display: 'block', fontFamily: 'var(--display)', fontSize: 17, marginTop: 6 }}>Atami quiz sealed</b>
          <small style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: 'var(--ink-soft)' }}>Opens after the selfie</small>
        </div>
      </div>
    );
  };

  /* ── Stamp 3, part B — How Well Do You Know Atami? ──
     A round is a random deal of questions from the bank, answered one at
     a time. Each pick shows right or wrong and why. The stamp needs the
     pass mark; a round short of it is dealt again, fresh questions first.
     The round is kept in the run, so a team can leave and come back. */
  const renderCp2b = () => {
    const rules = CONFIG.atami;
    const run = S.atami;
    const round = run?.round ?? [];
    const picks = run?.picks ?? [];
    const i = run?.i ?? 0;
    const cur = round[i];
    const rightCount = picks.filter((p, k) => p === round[k]?.a).length;
    const collected = Boolean(S.subs?.cp2b);
    const commit = (atami) => {
      const next = { ...S, atami };
      store.save(next.teamId, next);
      setS(next);
    };
    /* Each question's clock starts when it comes on screen. */
    const deadline = () => (rules.secs ? Date.now() + rules.secs * 1000 : null);
    const deal = () => {
      commit({
        ...drawAtami(rules, run?.seen),
        attempt: (run?.attempt ?? 0) + 1,
        deadline: deadline(),
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    /* Out of time: the round is lost and starts again from question 1. */
    const expire = () => {
      if (picks[i] != null || run?.timedOut) return;
      commit({ ...run, timedOut: true });
    };
    const pick = (opt) => {
      if (!cur || picks[i] != null || collected || run?.timedOut) return;
      if (run?.deadline && Date.now() >= run.deadline) { expire(); return; }
      const next = [...picks];
      next[i] = opt;
      commit({ ...run, picks: next });
      if (opt === cur.a) confetti();
    };
    const answered = cur && picks[i] != null;
    const last = i >= round.length - 1;
    const roundOver = round.length > 0 && last && answered;
    const passed = rightCount >= rules.passMark;
    /* Even all right from here wouldn't reach the pass mark: no point
       playing on, so the round ends now and is dealt again. */
    const left = round.length - 1 - i;
    const outOfReach = answered && !passed && rightCount + left < rules.passMark;
    const collect = () => {
      const newS = { ...S };
      /* The passing round, question by question, for the results page. */
      const log = round.map((x, k) => ({ q: x.q, a: x.options[x.a], picked: x.options[picks[k]] ?? null }));
      newS.subs = { ...(newS.subs || {}), cp2b: { right: rightCount, answered: round.length, attempts: run.attempt ?? 1, log, at: Date.now() } };
      newS.open = null;
      store.save(newS.teamId, newS);
      setS(newS);
      confetti({ count: 220, duration: 2600 });
      showToast(`Stamp ${STAMP_NO.cp2b} collected.`);
    };

    return (
      <div className="card flag">
        {renderCpHead(STAMP_NO.cp2b, CONFIG.cp.cp2b.title, CONFIG.cp.cp2b.stop)}
        {renderHowTo('cp2b')}
        {round.length > 0 && !collected && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <span aria-live="polite" aria-label={`${rightCount} right, ${rules.passMark} needed`} style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 8,
              padding: '4px 11px', borderRadius: 999, border: 'var(--line)', background: 'var(--card)',
              font: '700 14px/1.2 "DM Mono", monospace', color: 'var(--ink)',
            }}>
              <span><span style={{ color: 'var(--sea)' }}>✓</span> {rightCount}/{rules.passMark} needed</span>
              <span style={{ color: 'var(--ink-soft)' }}>·</span>
              <span style={{ color: 'var(--red)' }}>{rightCount * rules.pts} pts</span>
            </span>
          </div>
        )}
        <CheckpointPhoto src={CONFIG.cp.cp2b.photo} />

        {collected ? (
          <p style={{ margin: 0, fontWeight: 700 }}>
            Stamp collected{S.subs.cp2b.right != null
              ? ` — ${S.subs.cp2b.right} of ${S.subs.cp2b.answered} right, ${S.subs.cp2b.right * rules.pts} points.`
              : '.'}
          </p>
        ) : !rules.questions.length ? (
          <p className="note">The committee hasn’t put the questions in yet. Check back soon.</p>
        ) : !cur ? (
          <>
            {String(CONFIG.cp.cp2b.body || '').trim() && (
              <div className="task"><Rich text={CONFIG.cp.cp2b.body} /></div>
            )}
            <button className="btn block" type="button" onClick={deal}>
              Start · {rules.perRound} questions
            </button>
          </>
        ) : run.timedOut ? (
          <div role="alert">
            <p className="display" style={{ fontSize: 26, margin: '6px 0 6px', color: 'var(--red)' }}>Time’s up!</p>
            <p style={{ margin: '0 0 4px' }}>
              Question {i + 1}: <b>{cur.q}</b>
            </p>
            <p className="note" style={{ margin: '0 0 12px' }}>
              It was <b>{cur.options[cur.a]}</b>. Back to the start — {rules.perRound} new questions, {rules.secs} seconds each.
            </p>
            <button className="btn block" type="button" onClick={deal}>Start again · {rules.perRound} new questions</button>
          </div>
        ) : (
          <>
            <div className="eyebrow" style={{ color: 'var(--red)', margin: '4px 0 6px' }}>
              Question {i + 1} of {round.length}
            </div>
            <p style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.35, margin: '0 0 12px' }}>{cur.q}</p>
            {run.deadline && !answered && (
              <Countdown key={`${run.attempt}-${i}`} deadline={run.deadline} total={rules.secs} onExpire={expire} />
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              {cur.options.map((opt, k) => {
                const isAnswer = k === cur.a;
                const isPicked = k === picks[i];
                const bg = !answered ? 'var(--card)' : isAnswer ? 'var(--sea)' : isPicked ? 'var(--red)' : 'var(--card)';
                const fg = answered && (isAnswer || isPicked) ? '#fff' : 'var(--ink)';
                return (
                  <button key={k} type="button" onClick={() => pick(k)} disabled={answered}
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
                <p style={{ margin: '0 0 4px', fontWeight: 700, color: picks[i] === cur.a ? 'var(--sea)' : 'var(--red)' }}>
                  {picks[i] === cur.a ? `Correct! +${rules.pts}` : `Not quite — it was ${cur.options[cur.a]}.`}
                </p>
                {cur.why && <p className="note" style={{ margin: '0 0 12px' }}>{cur.why}</p>}
                {outOfReach ? null : !roundOver ? (
                  <button className="btn block" type="button" onClick={() => commit({ ...run, i: i + 1, deadline: deadline() })}>Next question</button>
                ) : (
                  <>
                    <p style={{ margin: '0 0 10px', fontWeight: 700 }}>
                      {rightCount} of {round.length} right — you passed!
                    </p>
                    <button className="btn block" type="button" onClick={collect}>Collect the stamp</button>
                  </>
                )}
              </div>
            )}

            {outOfReach && (
              <div role="alertdialog" aria-modal="true" aria-labelledby="atami-out-title" style={{
                position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(10,10,12,.55)',
                padding: '24px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div className="card" style={{ maxWidth: 420, width: '100%', margin: 0, textAlign: 'center' }}>
                  <img src="/cat-scuba.webp" alt="" width={112} height={113} style={{
                    display: 'block', margin: '0 auto', width: 112, height: 113,
                    borderRadius: 14, border: 'var(--line)', background: '#000',
                  }} />
                  <h2 id="atami-out-title" className="display" style={{ fontSize: 25, margin: '10px 0 8px', color: 'var(--red)' }}>
                    Oops, can’t pass this time
                  </h2>
                  <p style={{ margin: '0 0 14px', lineHeight: 1.45 }}>
                    {left ? (
                      <>You got <b>{rightCount} correct</b>. Only <b>{left} question{left === 1 ? '' : 's'}</b> left.<br />
                        You need <b>{rules.passMark} correct</b> to pass. Let’s try again!</>
                    ) : (
                      <>You got <b>{rightCount} correct</b>.<br />
                        You need <b>{rules.passMark} correct</b> to pass. Let’s try again!</>
                    )}
                  </p>
                  <button className="btn block" type="button" onClick={deal} autoFocus>Start again</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  /* ── Stamp 4 — Buy it, try it ──────────────────────
     Any amount. Every member of the group has a photo taken with what
     they bought. The list starts as the group's line-up
     (src/data/huntGroups.js); line-ups change at the last minute, so the
     team can rename, remove and add people here. Everything is kept in
     the run as it goes, so leaving the screen loses nothing. */
  const renderCp3 = () => {
    const lineUp = () => (huntGroupOf(S.teamId)?.members ?? []).map((name) => ({ name, photo: null }));
    const blankBuy = () => ({ item: '', people: lineUp() });
    const buy = { ...blankBuy(), ...S.buy };
    const people = buy.people;
    /* From the latest run, not this render's: a photo lands after it has
       been compressed, by which time a name may have been changed. */
    const updateBuy = (fn) => setS((prev) => {
      const next = { ...prev, buy: fn({ ...blankBuy(), ...prev.buy }) };
      store.save(next.teamId, next);
      return next;
    });
    const setPerson = (k, patch) => updateBuy((b) => ({
      ...b, people: b.people.map((p, j) => (j === k ? { ...p, ...patch } : p)),
    }));
    const onPhoto = async (k, file) => {
      if (!file) return;
      try {
        setPerson(k, { photo: await compressImage(file) });
      } catch (e) {
        showToast(photoErrorMessage(e));
      }
    };
    const ready = people.filter((p) => p.name.trim() && p.photo).length;
    const canSend = Boolean(buy.item.trim()) && people.length > 0 && ready === people.length;
    const input = {
      width: '100%', fontFamily: 'var(--body)', fontSize: 16, padding: '11px 12px',
      border: 'var(--line)', borderRadius: 7, background: 'var(--card)', color: 'var(--ink)',
    };
    const tile = {
      position: 'relative', display: 'grid', placeItems: 'center', aspectRatio: 1,
      borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
    };

    return (
      <div className="card flag">
        {renderCpHead(STAMP_NO.cp3, CONFIG.cp.cp3.title, CONFIG.cp.cp3.stop)}
        {renderHowTo('cp3')}
        <div className="task">
          {CONFIG.buy.brief && <p><b>{CONFIG.buy.brief}</b></p>}
          <Rich text={CONFIG.cp.cp3.body} />
        </div>
        <CheckpointPhoto src={CONFIG.cp.cp3.photo} />

        <label className="f" style={{ display: 'block', marginBottom: 14 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 5 }}>What did you buy?</span>
          <input type="text" placeholder="e.g. ume soft serve" value={buy.item}
            onChange={(e) => { const item = e.target.value; updateBuy((b) => ({ ...b, item })); }}
            style={input} />
        </label>

        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
          Everyone’s photo with it · {ready}/{people.length}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10 }}>
          {people.map((p, k) => {
            const fileId = `buy-photo-${k}`;
            return (
              <div key={k} style={{ minWidth: 0 }}>
                <div style={{ position: 'relative' }}>
                  <label htmlFor={fileId} aria-label={p.photo ? `Retake ${p.name || 'this'} photo` : `Take ${p.name || 'this'} photo`}
                    style={{
                      ...tile,
                      border: p.photo ? 'var(--line)' : '3px dashed var(--th-dash)',
                      background: p.photo ? '#0E1720' : 'var(--th-parchment)',
                    }}>
                    {p.photo
                      ? <img src={p.photo} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 22 }}>📷</span>}
                    {p.photo && (
                      <span style={{
                        position: 'absolute', top: 4, left: 4, padding: '1px 6px', borderRadius: 999,
                        background: 'var(--sea)', color: '#fff', font: '700 11px/1.4 var(--body)',
                      }}>✓</span>
                    )}
                  </label>
                  <button type="button" aria-label={`Remove ${p.name || `member ${k + 1}`}`}
                    onClick={() => updateBuy((b) => ({ ...b, people: b.people.filter((_, j) => j !== k) }))}
                    style={{
                      position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 999,
                      border: 'var(--line)', background: 'var(--card)', color: 'var(--ink)',
                      font: '700 14px/1 var(--body)', cursor: 'pointer', display: 'grid', placeItems: 'center',
                    }}>×</button>
                </div>
                <input id={fileId} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={(e) => { onPhoto(k, e.target.files[0]); e.target.value = ''; }} />
                <input type="text" placeholder="Name" aria-label={`Member ${k + 1} name`} value={p.name}
                  onChange={(e) => { const name = e.target.value; setPerson(k, { name }); }}
                  style={{ ...input, marginTop: 5, padding: '7px 8px', fontSize: 15, fontWeight: 700, textAlign: 'center' }} />
              </div>
            );
          })}
          <button type="button" onClick={() => updateBuy((b) => ({ ...b, people: [...b.people, { name: '', photo: null }] }))}
            style={{
              ...tile, border: '3px dashed var(--th-dash)', background: 'transparent', color: 'var(--ink-soft)',
              font: '700 13px/1.3 var(--body)', padding: 6,
            }}>
            + Add a member
          </button>
        </div>

        <button
          className="btn block"
          style={{ marginTop: 14 }}
          disabled={!canSend}
          onClick={() => {
            const done = people.map((p) => ({ name: p.name.trim(), photo: p.photo }));
            const newS = { ...S };
            newS.subs = { ...(newS.subs || {}), cp3: { item: buy.item.trim(), people: done, photo: done[0].photo, at: Date.now() } };
            delete newS.buy;
            newS.open = null;
            store.save(newS.teamId, newS);
            setS(newS);
            showToast('Stamp collected.');
          }}
          type="button"
        >
          Send it
        </button>
        <p className="note" style={{ margin: '12px 0 0' }}>
          {canSend ? 'Most interesting find takes a bonus stamp at the finish.'
            : 'Tap each box to take that person’s photo. Someone not here? Remove them, or change the name.'}
        </p>
      </div>
    );
  };

  const renderCp4 = () => {
    const answers = draft.answers || [];
    return (
      <div className="card flag">
        {renderCpHead(STAMP_NO.cp4, CONFIG.cp.cp4.title, CONFIG.cp.cp4.stop)}
        {renderHowTo('cp4')}
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
        <button
          className="btn block"
          style={{ marginTop: 14 }}
          disabled={answers.filter(Boolean).length !== CONFIG.quiz.questions.length}
          onClick={() => {
            let correct = 0;
            CONFIG.quiz.questions.forEach((q, i) => {
              if (!q.accept?.length) return;
              if (q.accept.some((a) => norm(answers[i]).includes(norm(a)))) correct++;
            });
            const newS = { ...S };
            newS.subs = { ...(newS.subs || {}), cp4: { answers, correct, at: Date.now() } };
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

  /* ── Game 1 — photo bingo ────────────────────────────────
     Each tile is a photo the committee took around the area: the team
     has to find that spot and take a selfie of the whole team there.
     The tile shows the photo to find until the team's own
     one replaces it; tap it to see the original full-size next to theirs.
     One shared card per team, and anyone on the team can fill any tile.
     Every tile is still needed for this stamp — that is this
     game's own rule, not a gate on the rest of the hunt, which a team
     can go and play at any time. */

  const addBingoTile = async (i, file) => {
    setBusyTile(i);
    try {
      if (preview) {
        const src = await compressImage(file, PHOTO_PRESETS.preview);
        setShots((prev) => ({ ...prev, [i]: { tile: i, src, uploader_name: 'You' } }));
      } else {
        await uploadShot(activeTeamId, i, file, huntResetAt);
        await refreshShots();
      }
    } catch (e) {
      showToast(photoErrorMessage(e, { denied: 'Only your own team’s card can be filled in.' }));
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

  const renderBingoGrid = () => (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {bingoCard.map((tile, i) => {
            const shot = shots[i];
            const img = shot?.src ?? tile.photo;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setOpenTile(i)}
                aria-label={`Tile ${i + 1}${shot ? ', done' : ''}`}
                style={{
                  position: 'relative', aspectRatio: 1, display: 'grid', placeItems: 'center',
                  textAlign: 'center', overflow: 'hidden', borderRadius: 8, padding: '0 0 16px',
                  border: shot ? 'var(--line)' : '3px dashed var(--th-dash)',
                  background: img ? 'var(--ink)' : 'var(--th-parchment)',
                  cursor: 'pointer', color: 'inherit', font: 'inherit',
                }}
              >
                {img && <img src={img} alt="" style={shot?.src ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' } : framedImgStyle(tile.frame)} />}
                {!img && (
                  <span style={{
                    position: 'relative', zIndex: 1, fontFamily: '"DM Mono", monospace',
                    fontSize: 9.5, lineHeight: 1.3, padding: 5, color: 'var(--ink-soft)',
                  }}>{tile.prompt}</span>
                )}
                <span style={{
                  position: 'absolute', top: 3, left: 3, zIndex: 1,
                  fontFamily: '"DM Mono", monospace', fontSize: 9, fontWeight: 700, lineHeight: 1,
                  padding: '3px 5px', borderRadius: 4, border: '1px solid var(--ink)',
                  background: shot ? 'var(--gold)' : 'var(--card)', color: 'var(--ink)',
                }}>
                  {busyTile === i ? '…' : shot ? '✓' : 'FIND'}
                </span>
                {shot && (
                  <span style={{
                    position: 'absolute', left: 3, right: 3, bottom: 3, zIndex: 1,
                    fontFamily: '"DM Mono", monospace', fontSize: 9, fontWeight: 700, lineHeight: 1.2,
                    padding: '2px 4px', borderRadius: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--ink)',
                  }}>
                    📷 {shot.uploader_name}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="note" style={{ margin: '10px 0 0' }}>
          {readOnly ? 'Tap a tile to see the photo to find and the team’s shot, full-size.'
            : 'Tap a tile to see the photo full-size. Anyone on the team can snap any tile — a selfie of the whole team at the spot.'}
        </p>
      </>
  );

  /* One tile, full-size: the photo to find, the team's shot under it to
     compare, and the snap button. */
  const renderBingoTile = () => {
    if (openTile == null) return null;
    const i = openTile;
    const tile = bingoCard[i] ?? {};
    const shot = shots[i];
    const locked = !!S?.subs?.bingo;
    const busy = busyTile === i;
    const canSnap = !locked && !readOnly;
    const close = () => setOpenTile(null);
    const pic = {
      display: 'block', width: '100%', maxHeight: '42vh', objectFit: 'contain',
      background: 'var(--ink)', border: 'var(--line)', borderRadius: 8,
    };
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Bingo tile ${i + 1}`}
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 95,
          background: 'rgba(10,10,12,.55)', padding: '24px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div
          className="card"
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: 540, width: '100%', margin: 0, maxHeight: '100%',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          <div className="eyebrow" style={{ color: 'var(--red)' }}>Tile {i + 1} of {bingoCard.length}</div>
          <h2 className="display" style={{ fontSize: 25, margin: '4px 0 10px' }}>{shot ? 'Found it' : 'Find this'}</h2>
          <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            {/* Framed by the committee: the same crop as the grid tile, bigger. */}
            {tile.photo && tile.frame && (
              <div style={{
                position: 'relative', aspectRatio: 1, width: 'min(100%, 42vh)', margin: '0 auto',
                overflow: 'hidden', background: 'var(--ink)', border: 'var(--line)', borderRadius: 8,
              }}>
                <img src={tile.photo} alt="The photo to find" style={framedImgStyle(tile.frame)} />
              </div>
            )}
            {tile.photo && !tile.frame && <img src={tile.photo} alt="The photo to find" style={pic} />}
            {tile.prompt && <p style={{ margin: tile.photo ? '8px 0 0' : 0 }}>{tile.prompt}</p>}
            {shot?.src && (
              <>
                <div className="eyebrow" style={{ margin: '14px 0 6px' }}>
                  Your team’s shot{shot.uploader_name ? ` · by ${shot.uploader_name}` : ''}
                </div>
                <img src={shot.src} alt="Your team’s photo" style={pic} />
              </>
            )}
            <p className="note" style={{ margin: '12px 0 0' }}>
              {readOnly ? `Read only — ${huntGroupOf(activeTeamId)?.name ?? 'this group'}’s card.`
                : locked ? 'Stamp collected — this card is final.'
                : 'Find it, then take a selfie of the whole team at the spot.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flex: 'none', flexWrap: 'wrap' }}>
            {canSnap && (
              <label
                className="btn"
                htmlFor={`bingo-snap-${i}`}
                style={{ flex: '1 1 auto', justifyContent: 'center', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'Uploading…' : shot ? 'Retake' : '📷 Take the photo'}
              </label>
            )}
            {canSnap && !busy && bingoFileInput(i, `bingo-snap-${i}`)}
            {shot && canSnap && !busy && (
              <button className="mini" type="button" onClick={() => clearBingoTile(i)}>Clear</button>
            )}
            <button className="mini" type="button" onClick={close} autoFocus style={canSnap ? {} : { flex: '1 1 auto' }}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderBingo = () => {
    const tiles = shots;
    const filled = bingoCard.reduce((n, _, i) => n + (tiles[i] ? 1 : 0), 0);
    const locked = !!S?.subs?.bingo;
    /* The warning shrinks as the missing photos land. */
    const stillMissing = (bingoMissing ?? []).filter((i) => !tiles[i]);

    if (!bingoCard.length) {
      return (
        <div className="card flag">
          {renderCpHead(STAMP_NO.bingo, CONFIG.cp.bingo.title, CONFIG.cp.bingo.stop)}
          <p className="note" style={{ margin: 0 }}>The committee hasn’t put your team’s photos up yet. Check back soon.</p>
        </div>
      );
    }

    return (
      <div className="card flag">
        {renderCpHead(STAMP_NO.bingo, CONFIG.cp.bingo.title, CONFIG.cp.bingo.stop)}
        {renderHowTo('bingo')}
        <div className="task">
          <p style={{ margin: 0 }}>Every tile is a photo of something around the area. Find the spot and take a selfie of the whole team there. Anyone on the team can snap any tile. All {bingoCard.length} earn the stamp — leave it part-filled and come back whenever you like.</p>
        </div>
        <CheckpointPhoto src={CONFIG.cp.bingo.photo} />
        {renderBingoGrid()}
        {renderBingoTile()}
        {stillMissing.length > 0 && (
          <div role="alert" style={{
            marginTop: 14, padding: '10px 12px', borderRadius: 8,
            border: '2px solid var(--red)', background: 'var(--th-parchment)', fontSize: 13,
          }}>
            <b>All {bingoCard.length} photos are needed for this stamp.</b> Still missing {stillMissing.length}:
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {stillMissing.map((i) => (
                <li key={i}>Tile {i + 1}{bingoCard[i]?.prompt ? ` · ${bingoCard[i].prompt}` : ''}</li>
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
            newS.subs = { ...(newS.subs || {}), bingo: { tiles: bingoCard.length, points: bingoPoints(fresh, bingoCard.length, CONFIG), at: Date.now() } };
            newS.open = null;
            store.save(newS.teamId, newS);
            setS(newS);
            showToast('Stamp collected.');
          }}
          type="button"
        >
          {bingoChecking ? 'Checking…' : `Collect the stamp · ${filled}/${bingoCard.length}`}
        </button>
        <p className="note" style={{ margin: '12px 0 0' }}>The stamp lands once every tile has a photo.</p>
      </div>
    );
  };

  /* ── Stamp 6 — know your colleagues ─────────────────
     Multiple choice about people on the other teams, one question at a
     time and at the team's own pace. A round is a fixed number of
     questions; each right answer scores, a wrong one just shows the
     answer. The stamp lands after the last question. */

  const renderTrivia = () => {
    const total = colleaguePool(colleague, S.teamId).length;
    const run = S.trivia;
    const cur = run?.current;
    const results = run?.results ?? [];
    const rightCount = results.filter(Boolean).length;
    const collected = Boolean(S.subs?.guess);
    const commit = (trivia) => {
      const next = { ...S, trivia };
      store.save(next.teamId, next);
      setS(next);
    };

    const pick = (opt) => {
      if (!cur || cur.picked != null || collected) return;
      const right = opt === cur.a;
      commit({
        ...run,
        current: { ...cur, picked: opt },
        results: [...results, right],
        /* Each question as answered, for the results page. */
        log: [...(run.log ?? []), { who: cur.who, q: cur.q, a: cur.a, picked: opt }],
      });
      if (right) confetti();
    };

    const next = () => commit({ ...run, ...drawColleague(colleague, S.teamId, run.seen) });

    const collect = () => {
      const newS = { ...S };
      newS.subs = { ...(newS.subs || {}), guess: { right: rightCount, answered: results.length, log: run.log ?? [], at: Date.now() } };
      newS.open = null;
      store.save(newS.teamId, newS);
      setS(newS);
      confetti({ count: 220, duration: 2600 });
      showToast('Stamp collected.');
    };

    const answered = cur?.picked != null;
    const right = answered && cur.picked === cur.a;
    const finished = total > 0 && results.length >= total;

    return (
      <div className="card flag">
        {/* No title block here: just the score so far — right answers,
            and the points they have earned. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <span aria-live="polite" aria-label={`${rightCount} right out of ${total}, ${rightCount * CONFIG.trivia.pts} points`} style={{
            display: 'inline-flex', alignItems: 'baseline', gap: 8,
            padding: '4px 11px', borderRadius: 999, border: 'var(--line)', background: 'var(--card)',
            font: '700 14px/1.2 "DM Mono", monospace', color: 'var(--ink)',
          }}>
            <span><span style={{ color: 'var(--sea)' }}>✓</span> {rightCount}/{total}</span>
            <span style={{ color: 'var(--ink-soft)' }}>·</span>
            <span style={{ color: 'var(--red)' }}>{rightCount * CONFIG.trivia.pts} pts</span>
          </span>
        </div>
        {renderLeaderNote(STAMP_NO.guess)}
        {renderHowTo('guess')}
        <CheckpointPhoto src={CONFIG.cp.guess.photo} />

        {collected ? (
          <p style={{ margin: 0, fontWeight: 700 }}>
            Stamp collected — {S.subs.guess.right ?? rightCount} of {S.subs.guess.answered ?? total} right, {(S.subs.guess.right ?? rightCount) * CONFIG.trivia.pts} points.
          </p>
        ) : !cur ? (
          <p className="note">
            {colleaguePool(colleague, S.teamId).length
              ? 'Dealing a question…'
              : 'The committee hasn’t put the answers in yet. Check back soon.'}
          </p>
        ) : (
          <>
            {cur.who && (() => {
              const team = CONFIG.teams.find((t) => t.id === cur.team);
              return (
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: '6px 0 8px' }}>
                  <b className="display" style={{ fontSize: 26, lineHeight: 1 }}>{cur.who}</b>
                  {team && (
                    <span style={{
                      padding: '3px 10px', borderRadius: 999, border: 'var(--line)',
                      background: team.colour, color: '#fff', font: '700 12px/1.3 var(--body)',
                    }}>{team.name}</span>
                  )}
                </div>
              );
            })()}
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
                  {right ? `Correct! +${CONFIG.trivia.pts}` : `Not quite — it was ${cur.a}.`}
                  {finished && ` That’s the round: ${rightCount} of ${total} right.`}
                </p>
                {finished ? (
                  <button className="btn block" type="button" onClick={collect}>Collect the stamp</button>
                ) : (
                  <button className="btn block" type="button" onClick={next}>Next question</button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  /* ── Read only: one game as the group played it ─────
     The game's own page — its number, title, instructions and reference
     photos — with what the group sent in where the inputs were. */
  const renderReview = (key) => {
    const subs = S.subs ?? {};
    const t = currentTeam;
    const sub = subs[DONE_SUB[key]];
    const notPlayed = <p className="note" style={{ margin: '12px 0 0' }}>{esc(S.teamName)} didn’t play this one.</p>;
    const shot = (p, alt) => {
      if (!p) return null;
      const src = srcOf(p);
      return src ? (
        <img src={src} alt={alt} style={{
          display: 'block', width: '100%', maxHeight: 420, objectFit: 'contain',
          background: '#0E1720', border: 'var(--line)', borderRadius: 8,
        }} />
      ) : (
        <div style={{ padding: 24, textAlign: 'center', border: '3px dashed var(--th-dash)', borderRadius: 8 }}>
          <span className="note">{p?.path ? 'Loading the photo…' : 'Photo not uploaded'}</span>
        </div>
      );
    };
    const theirs = (label) => (
      <div className="eyebrow" style={{ color: 'var(--red)', margin: '16px 0 8px' }}>{label}</div>
    );
    const quizItems = (log) => (log ?? []).map((x) => ({ ...x, ok: x.picked === x.a }));
    const head = (n, cpKey) => renderCpHead(n, CONFIG.cp[cpKey].title, CONFIG.cp[cpKey].stop);
    const task = (cpKey) => (String(CONFIG.cp[cpKey].body || '').trim()
      ? <div className="task"><Rich text={CONFIG.cp[cpKey].body} /></div> : null);

    if (key === 'bingo') {
      return (
        <div className="card flag">
          {head(STAMP_NO.bingo, 'bingo')}
          {bingoCard.length ? renderBingoGrid() : <p className="note">No bingo card for this group.</p>}
          {renderBingoTile()}
          <p style={{ margin: '12px 0 0', fontWeight: 700 }}>
            {sub ? `Stamp collected — ${sub.points ?? 0} points.` : 'Stamp not collected.'}
          </p>
        </div>
      );
    }
    if (key === 'cp1') {
      return (
        <div className="card flag">
          {head(STAMP_NO.cp1, 'cp1')}
          {task('cp1')}
          {t && renderPlate({ src: t.pose.place, alt: 'The place', caption: t.pose.placeHint || 'Go to this place', tag: 'WHERE', missing: missingPhoto('Place') })}
          {t && renderPlate({ src: t.pose.photo, alt: 'The pose', caption: `Copy this pose — ${esc(t.name)}`, tag: 'POSE', missing: missingPhoto('Pose') })}
          {sub ? <>{theirs('Their photo')}{shot(sub.photo, `${S.teamName}’s pose photo`)}</> : notPlayed}
        </div>
      );
    }
    if (key === 'cp2') {
      const selfie = subs.cp2a;
      return (
        <div className="card flag">
          {head(STAMP_NO.cp2a, 'cp2a')}
          {task('cp2a')}
          {t && renderPlate({ src: t.spot.photo, alt: 'The place to find', caption: t.spot.hint, tag: 'WHERE', missing: missingPhoto('Place') })}
          {selfie ? <>{theirs('Their selfie')}{shot(selfie.photo, `${S.teamName}’s selfie`)}</> : notPlayed}
          {selfie && (
            <>
              {theirs(CONFIG.cp.cp2b.title)}
              {sub ? (
                <>
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {sub.right} of {sub.answered} right{sub.attempts > 1 ? ` · passed on try ${sub.attempts}` : ''} — {sub.right * CONFIG.atami.pts} points.
                  </p>
                  <QaList items={quizItems(sub.log)} />
                </>
              ) : <p className="note" style={{ margin: 0 }}>Quiz not passed.</p>}
            </>
          )}
        </div>
      );
    }
    if (key === 'cp3') {
      return (
        <div className="card flag">
          {head(STAMP_NO.cp3, 'cp3')}
          <div className="task">
            {CONFIG.buy.brief && <p><b>{CONFIG.buy.brief}</b></p>}
            <Rich text={CONFIG.cp.cp3.body} />
          </div>
          {sub ? (
            <>
              {theirs('What they bought')}
              <p className="display" style={{ fontSize: 22, margin: 0 }}>{sub.item || '—'}</p>
              {theirs('Everyone’s photo with it')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                {(sub.people ?? []).map((p, k) => (
                  <div key={k} style={{ minWidth: 0 }}>
                    {shot(p.photo, p.name)}
                    <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, marginTop: 5, overflowWrap: 'anywhere' }}>{p.name}</div>
                  </div>
                ))}
              </div>
            </>
          ) : notPlayed}
        </div>
      );
    }
    if (key === 'cp4') {
      return (
        <div className="card flag">
          {head(STAMP_NO.cp4, 'cp4')}
          {task('cp4')}
          {/* The questions show either way: they're the same for every group. */}
          {theirs(sub ? 'Their answers' : 'The questions')}
          {CONFIG.quiz.questions.map((q, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{i + 1}. {q.q}</div>
              <div style={{
                padding: '10px 12px', border: 'var(--line)', borderRadius: 7, background: 'var(--th-parchment)', fontSize: 16,
                color: sub?.answers?.[i] ? 'var(--ink)' : 'var(--ink-soft)',
              }}>{sub?.answers?.[i] || 'No answer'}</div>
            </div>
          ))}
          {!sub && notPlayed}
        </div>
      );
    }
    if (key === 'guess') {
      return (
        <div className="card flag">
          {head(STAMP_NO.guess, 'guess')}
          {task('guess')}
          {sub ? (
            <>
              <p style={{ margin: 0, fontWeight: 700 }}>
                {sub.right} of {sub.answered} right — {sub.right * CONFIG.trivia.pts} points.
              </p>
              <QaList items={quizItems(sub.log)} />
            </>
          ) : notPlayed}
        </div>
      );
    }
    if (key === 'boss') {
      return (
        <div className="card flag">
          {head(STAMP_NO.boss, 'boss')}
          {task('boss')}
          <BossThread team={activeTeamId} readOnly />
          {sub ? <>{theirs('Their photo with the bosses')}{shot(sub.photo, `${S.teamName} with the bosses`)}</> : notPlayed}
        </div>
      );
    }
    return renderHub();
  };

  /* Whichever game the team has open, or the hub if none. The only
     gate left is inside game 3, where the selfie reveals the Atami quiz. */
  const renderStage = () => {
    if (!S) return null;
    if (!S.open) return renderHub();
    if (readOnly) return renderReview(S.open);
    const renderers = {
      cp1: renderCp1, cp3: renderCp3, cp4: renderCp4,
      bingo: renderBingo, guess: renderTrivia, boss: renderBoss,
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
            {S.stoppedAt ? 'Game over' : ranOut ? 'Time’s up' : 'Hunt complete'}
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
          {S.stoppedAt > 0 && (
            <p style={{ margin: '12px 0 0', fontWeight: 700 }}>{stopMessage || DEFAULT_STOP_MESSAGE}</p>
          )}
          <p className="note" style={{ margin: '12px 0 0' }}>
            The committee tallies the results at the finish point.
            {ranOut && ' If the committee restarts the clock, the hunt starts again from the beginning on this screen by itself.'}
          </p>
        </div>
        {/* Finishing is the team's own call, so leave a way back in for
            anyone who tapped it early and still has time on the clock. */}
        {!ranOut && secondsLeft > 0 && !stoppedAt && (
          <div className="card">
            <p style={{ margin: '0 0 10px' }}>
              Still {mmss(secondsLeft)} on the clock. Finished by mistake?
            </p>
            <button
              className="btn block sea"
              type="button"
              onClick={() => {
                const next = { ...S, finishedAt: null, stoppedAt: null, open: null };
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
      </div>
    );
  };

  /* ── Main render ──────────────────────────────────── */

  return (
    <div className="relative min-h-[300px]">
      {/* Back on the left: from inside a game it goes to the games
          overview; from the overview or start screen it leaves the hunt. */}
      <div className="sticky top-0 z-70 flex justify-between gap-2 py-1.5">
        <button
          onClick={view === 'race' && S?.open ? backToHub : onClose}
          type="button"
          className="px-3 py-1.5 border-2 border-ink rounded-lg font-mono text-[9px] font-bold cursor-pointer bg-ink dark:bg-flame text-card border-red transition-all duration-100 hover:opacity-90"
        >
          {view === 'race' && S?.open ? '← Main menu' : preview ? '← Back to editor' : viewTeamId ? '← Back to results' : '← Back to Day 4'}
        </button>
        <button
          onClick={() => setMapOpen(true)}
          type="button"
          className="px-3 py-1.5 border-2 border-ink rounded-lg font-mono text-[9px] font-bold cursor-pointer bg-card text-ink transition-all duration-100 hover:opacity-90"
        >
          🗺️ Area map
        </button>
      </div>

      {preview && renderPreviewBar()}
      {renderHeader()}

      {readOnly && roState === 'loading' && (
        <div className="card"><p className="note" style={{ margin: 0 }}>Loading…</p></div>
      )}
      {view === 'start' && !readOnly && renderStartScreen()}
      {view === 'race' && S && (canPlay || readOnly ? (
        <div>
          {!S?.open && renderStampRally()}
          {renderStage()}
        </div>
      ) : (
        <div className="card flag">
          <div className="eyebrow" style={{ color: 'var(--red)' }}>Leader only</div>
          <h2 className="display" style={{ fontSize: 24, margin: '4px 0 8px' }}>Your group leader runs the hunt</h2>
          <p style={{ margin: 0 }}>
            Only the leader{leaderName ? ` (${leaderName})` : ''} can play and submit the games for {S?.teamName ?? 'your group'}.
            You can still take photo bingo shots and ask the bosses below.
          </p>
        </div>
      ))}
      {/* Only the leader runs the games, but anyone in the group can fill
          the photo bingo and ask the bosses in Find the boss. */}
      {!preview && !readOnly && !canPlay && teamId && view !== 'done' && isOpen && !stoppedAt && (
        <>
          {bingoCard.length > 0 && (
            <div className="card flag" style={{ marginTop: 14 }}>
              <div className="eyebrow" style={{ color: 'var(--red)' }}>Game {STAMP_NO.bingo} · {CONFIG.cp.bingo.title}</div>
              <p className="note" style={{ margin: '4px 0 10px' }}>Everyone can take bingo photos — not just the leader.</p>
              {renderHowTo('bingo')}
              {renderBingoGrid()}
              {renderBingoTile()}
            </div>
          )}
          <div className="card flag" style={{ marginTop: 14 }}>
            <div className="eyebrow" style={{ color: 'var(--red)' }}>Game {STAMP_NO.boss} · {CONFIG.cp.boss.title}</div>
            <BossThread team={teamId} canAsk={isOpen} offNote="Opens when the hunt starts." />
          </div>
        </>
      )}
      {view === 'done' && renderDoneScreen()}

      {mapOpen && <HuntMapLoader map={CONFIG.map} onClose={closeMap} />}

      {renderRules()}
      {renderHowToPopup()}

      {/* Toast */}
      {toast && (
        <div className="toast">{toast}</div>
      )}
    </div>
  );
}