/* ═══════════════════════════════════════════════════
   Find the boss — the group's thread and the bosses' inbox
   ═══════════════════════════════════════════════════

   BossThread: inside game 7, a group asks the bosses yes/no questions
   and sees the answers arrive live. Any member of the group can ask
   (not only the leader), one question at a time: the next waits until
   the last is answered, so the bosses aren't buried. A group gets
   QUESTION_LIMIT questions per spot; when the bosses move, more.

   BossInbox: full screen, for the bosses on standby. Every group's
   unanswered questions, oldest first, each with a big Yes and No.
   It keeps the screen on and beeps when a question comes in. */

import { useEffect, useMemo, useRef, useState } from 'react';
import groupRoster from '../data/groupRoster';
import huntGroups, { huntGroupOf } from '../data/huntGroups';
import {
  QUESTION_LIMIT, QUESTION_MAX, ping, questionsUsed, unlockSound, useBossMoves, useBossQuestions, useWakeLock,
} from '../lib/bossChat';
import { CHALLENGES, CHALLENGE_INFO, usePitchRatings } from '../lib/pitchRatings';
import { usePitchVideos } from '../lib/pitchVideos';

const ROSTER_SHORT = new Map(groupRoster.flatMap((t) => t.members)
  .filter((m) => m.full).map((m) => [m.full.trim().toUpperCase(), m.name]));

/* "LEE HOE JIN" is Aidan to everyone; anyone not on the roster (the
   bosses) by their first name. */
export function shortName(full) {
  const f = String(full ?? '').trim();
  if (!f) return 'Someone';
  const known = ROSTER_SHORT.get(f.toUpperCase());
  if (known) return known;
  const first = f.split(/\s+/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

const clock = (iso) => {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
};

const ago = (iso, now) => {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : clock(iso);
};

function LiveDot({ status }) {
  const live = status === 'live';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: '700 10px/1 var(--mono, monospace)', letterSpacing: '.08em', textTransform: 'uppercase', color: live ? 'var(--sea)' : 'var(--ink-soft)' }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: live ? 'var(--sea)' : 'var(--gold)' }} />
      {live ? 'Live' : status === 'offline' ? 'Reconnecting…' : 'Connecting…'}
    </span>
  );
}

function AnswerPill({ answer, big }) {
  const yes = answer === 'yes';
  return (
    <span style={{
      display: 'inline-block', padding: big ? '4px 14px' : '2px 10px', borderRadius: 999,
      border: '2px solid var(--ink)', background: yes ? 'var(--sea)' : 'var(--red)', color: '#fff',
      font: `800 ${big ? 15 : 12}px/1.3 var(--body)`, letterSpacing: '.06em',
    }}>{yes ? 'YES' : 'NO'}</span>
  );
}

/* ── A group's thread, inside the game ─────────────── */
export function BossThread({ team, canAsk = true, readOnly = false, offNote = null }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const listRef = useRef(null);
  const { items, status, loaded, error, ask } = useBossQuestions({
    team,
    enabled: Boolean(team),
    onEvent: (kind) => { if (kind === 'answered' && !readOnly) ping(); },
  });

  const [movedNote, setMovedNote] = useState(false);
  const { moves, lastMoveAt, ready: limitOn } = useBossMoves({
    enabled: Boolean(team),
    onMove: () => { if (!readOnly) { ping(); setMovedNote(true); } },
  });

  const pending = items.some((q) => !q.answer);
  const left = limitOn ? Math.max(0, QUESTION_LIMIT - questionsUsed(items, team, lastMoveAt)) : QUESTION_LIMIT;
  const usedUp = limitOn && left === 0;
  const allowAsk = canAsk && !readOnly;
  const lastAnswer = items[items.length - 1]?.answer;

  /* Questions and the bosses' moves, in the order they happened. Moves
     before this group's first question aren't news to it. */
  const firstAt = items.length ? new Date(items[0].created_at).getTime() : Infinity;
  const timeline = [
    ...items.map((q) => ({ kind: 'q', at: new Date(q.created_at).getTime(), q })),
    ...moves.filter((m) => new Date(m.created_at).getTime() > firstAt)
      .map((m) => ({ kind: 'move', at: new Date(m.created_at).getTime(), m })),
  ].sort((a, b) => a.at - b.at);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, lastAnswer]);

  const send = async (e) => {
    e.preventDefault();
    if (sending || !text.trim() || pending || usedUp) return;
    unlockSound();
    setSending(true);
    setSendError('');
    try {
      await ask(text);
      setText('');
      setMovedNote(false);
    } catch (err) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{readOnly ? 'Their questions to the bosses' : 'Ask the bosses (Yes / No)'}</div>
        {!readOnly && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {allowAsk && limitOn && (
              <span aria-live="polite" style={{
                padding: '2px 9px', borderRadius: 999, border: 'var(--line)', fontSize: 12, fontWeight: 800,
                background: movedNote ? 'var(--gold)' : 'var(--card)', color: 'var(--ink)',
              }}>
                {movedNote ? '🚶 New questions! ' : ''}{left}/{QUESTION_LIMIT} left
              </span>
            )}
            <LiveDot status={status} />
          </span>
        )}
      </div>

      <div ref={listRef} style={{
        maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10,
        padding: 10, border: 'var(--line)', borderRadius: 8, background: 'var(--th-parchment)',
      }}>
        {!loaded && <p className="note" style={{ margin: 0 }}>Loading…</p>}
        {loaded && error && <p style={{ margin: 0, color: 'var(--red)', fontSize: 14 }}>{error}</p>}
        {loaded && !error && !items.length && (
          <p className="note" style={{ margin: 0 }}>
            {readOnly ? 'They didn’t ask the bosses anything.' : 'Try “Are you near the water?”'}
          </p>
        )}
        {timeline.map((e) => (e.kind === 'move' ? (
          <div key={`m-${e.m.id}`} style={{
            textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)',
            borderTop: '1px dashed var(--th-rule)', paddingTop: 6,
          }}>
            🚶 The bosses moved · {clock(e.m.created_at)}
          </div>
        ) : (({ q }) => (
          <div key={q.id}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{
                maxWidth: '85%', padding: '8px 11px', borderRadius: '12px 12px 3px 12px',
                background: 'var(--card)', border: '2px solid var(--ink)', fontSize: 15, overflowWrap: 'anywhere',
              }}>{q.question}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>
              {shortName(q.asker_name)} · {clock(q.created_at)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              {q.answer ? (
                <>
                  <AnswerPill answer={q.answer} />
                  <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                    {q.answer_name ? shortName(q.answer_name) : 'Boss'}{q.answered_at ? ` · ${clock(q.answered_at)}` : ''}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--ink-soft)' }}>
                  {readOnly ? 'Not answered' : 'Waiting for the bosses…'}
                </span>
              )}
            </div>
          </div>
        ))(e)))}
      </div>

      {allowAsk && (
        <form onSubmit={send} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <label htmlFor={`boss-q-${team}`} className="sr-only">Your question</label>
          <input
            id={`boss-q-${team}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={QUESTION_MAX}
            disabled={pending || usedUp || Boolean(error)}
            placeholder={pending ? 'Waiting for their answer…' : usedUp ? 'Wait for the bosses to move' : 'Ask a yes or no question'}
            enterKeyHint="send"
            style={{
              flex: 1, minWidth: 0, height: 46, padding: '0 12px', borderRadius: 8, border: '2px solid var(--ink)',
              background: 'var(--card)', color: 'var(--ink)', font: '400 16px var(--body)',
            }}
          />
          <button className="btn" type="submit" disabled={sending || pending || usedUp || !text.trim() || Boolean(error)}>
            {sending ? '…' : 'Send'}
          </button>
        </form>
      )}
      {allowAsk && usedUp && (
        <p className="note" style={{ margin: '8px 0 0' }}>
          No questions left — you get {QUESTION_LIMIT} more when the bosses move.
        </p>
      )}
      {!allowAsk && !readOnly && offNote && <p className="note" style={{ margin: '8px 0 0' }}>{offNote}</p>}
      {sendError && <p style={{ margin: '8px 0 0', color: 'var(--red)', fontSize: 14 }}>{sendError}</p>}
    </div>
  );
}

/* ── Atami Video Challenge: rating the videos ────────
   Each group sends two videos: the Buy it, try it pitch and the Atami
   Geographic documentary. The boss picks the video, the group and a
   mark; the group's phone collects the stamp once both are rated. */
function PitchRating() {
  const { ratings, ready, loaded, rate } = usePitchRatings();
  const pv = usePitchVideos();
  const [challenge, setChallenge] = useState('pitch');
  const [team, setTeam] = useState(null);
  const info = CHALLENGE_INFO[challenge];
  const videosOf = (t, c) => pv.videos.filter((v) => v.team === t && (v.challenge ?? 'pitch') === c);
  const teamVideos = team ? videosOf(team, challenge) : [];
  const [mark, setMark] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const pick = (on) => ({
    minHeight: 46, borderRadius: 8, border: '2px solid var(--ink)', cursor: 'pointer',
    font: '800 17px/1 var(--body)',
    background: on ? 'var(--red)' : 'var(--card)', color: on ? '#fff' : 'var(--ink)',
  });

  const give = async () => {
    if (!team || !mark || busy) return;
    setBusy(true);
    setNote('');
    try {
      await rate(team, challenge, mark);
      setNote(`Sent — ${huntGroupOf(team)?.name ?? team}, ${info.name}: ${mark}/10.`);
      setTeam(null);
      setMark(null);
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card mt-4">
      <b>Atami Video Challenge</b>
      <p className="text-sm text-gray-500 mt-1">Every group sends two videos. Pick the video and the group, watch it, then rate it.</p>
      {loaded && !ready ? (
        <p className="note" style={{ margin: '10px 0 0' }}>Not switched on yet — groups rate on their leader’s phone instead.</p>
      ) : (
        <>
          <div role="tablist" aria-label="Which video" className="grid grid-cols-2 gap-2 mt-3">
            {CHALLENGES.map((c) => (
              <button key={c} type="button" role="tab" aria-selected={challenge === c}
                onClick={() => { setChallenge(c); setMark(null); setNote(''); }} style={pick(challenge === c)}>
                {CHALLENGE_INFO[c].emoji} {CHALLENGE_INFO[c].name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {huntGroups.map((g) => (
              <button key={g.id} type="button" aria-pressed={team === g.id} onClick={() => setTeam(g.id)} style={pick(team === g.id)}>
                <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: g.colour, border: '1px solid #fff' }} />
                {g.name}
              </button>
            ))}
          </div>
          {team && pv.ready && (
            <div className="mt-3">
              {teamVideos.length ? teamVideos.map((v) => (
                <div key={v.id} className="mb-2">
                  {v.src && (
                    <video src={v.src} poster={v.thumb ?? undefined} controls playsInline preload="none"
                      style={{ display: 'block', width: '100%', maxHeight: 320, borderRadius: 8, border: '2px solid var(--ink)', background: '#000' }} />
                  )}
                  <span className="text-[11px] text-gray-500">🎥 {shortName(v.uploader_name)} · {clock(v.created_at)}</span>
                </div>
              )) : (
                <p className="note" style={{ margin: 0 }}>🎥 No {info.video} from {huntGroupOf(team)?.name ?? team} yet. Their stamp waits for one.</p>
              )}
            </div>
          )}
          <div role="radiogroup" aria-label="Rating from 1 to 10" className="grid grid-cols-5 gap-2 mt-3">
            {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={mark === n} onClick={() => setMark(n)} style={pick(mark === n)}>
                {n}
              </button>
            ))}
          </div>
          <button type="button" className="btn block mt-3" disabled={!team || !mark || busy} onClick={give}>
            {busy ? 'Sending…' : team && mark ? `Give ${huntGroupOf(team)?.name ?? team}’s ${info.video} ${mark}/10` : 'Pick a group and a rating'}
          </button>
          {note && <p className="note" style={{ margin: '8px 0 0' }} aria-live="polite">{note}</p>}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {huntGroups.map((g) => {
              const r = ratings[g.id]?.[challenge];
              return (
                <span key={g.id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border-2 border-ink text-[12px] font-bold"
                  style={{ opacity: r ? 1 : 0.5 }}>
                  <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: g.colour }} />
                  {g.name}: {r ? `${r.rating}/10${r.rater_name ? ` · ${shortName(r.rater_name)}` : ''}` : 'not rated'}
                  {pv.ready && videosOf(g.id, challenge).length ? ' · 🎥' : ''}
                </span>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ── The bosses' inbox ─────────────────────────────── */
export function BossInbox({ onClose }) {
  const [standby, setStandby] = useState(false);
  const [busy, setBusy] = useState(null);
  const [actError, setActError] = useState('');
  const [filter, setFilter] = useState('all');
  const [fresh, setFresh] = useState(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  const wakeSupported = useWakeLock(standby);
  const [moveConfirm, setMoveConfirm] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveNote, setMoveNote] = useState('');
  const { lastMoveAt, moves, ready: limitOn, markMoved } = useBossMoves();

  const { items, status, loaded, error, answer } = useBossQuestions({
    onEvent: (kind, row) => {
      if (kind !== 'asked') return;
      ping();
      setFresh((s) => new Set(s).add(row.id));
      setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(row.id); return n; }), 4000);
    },
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const waiting = useMemo(() => items.filter((q) => !q.answer), [items]);
  const answered = useMemo(() => items.filter((q) => q.answer && (filter === 'all' || q.team === filter)).reverse(), [items, filter]);

  useEffect(() => {
    const before = document.title;
    document.title = waiting.length ? `(${waiting.length}) Boss inbox` : 'Boss inbox';
    return () => { document.title = before; };
  }, [waiting.length]);

  const reply = async (id, value) => {
    unlockSound();
    setBusy(id);
    setActError('');
    try { await answer(id, value); } catch (err) { setActError(err.message); } finally { setBusy(null); }
  };

  const startStandby = () => { unlockSound(); setStandby(true); };

  const moveNow = async () => {
    if (!moveConfirm) { setMoveConfirm(true); return; }
    setMoveConfirm(false);
    setMoving(true);
    setMoveNote('');
    try {
      await markMoved();
      setMoveNote(`Done — every group has ${QUESTION_LIMIT} new questions. Answer them about your new spot.`);
    } catch (err) {
      setMoveNote(err.message);
    } finally {
      setMoving(false);
    }
  };
  const lastMove = moves[moves.length - 1];

  const chip = (team) => {
    const g = huntGroupOf(team);
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold text-white border-2 border-ink" style={{ background: g?.colour ?? 'var(--ink)' }}>
        {g?.name ?? team}
      </span>
    );
  };

  return (
    <main className="max-w-[640px] mx-auto px-4 pb-16 min-h-dvh">
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 py-2 bg-paper">
        <button type="button" onClick={onClose}
          className="px-3 py-1.5 border-2 border-ink rounded-lg font-mono text-[9px] font-bold cursor-pointer bg-ink dark:bg-flame text-card">
          ← Back
        </button>
        <LiveDot status={status} />
      </div>

      <h1 className="display text-4xl leading-none mt-4">Boss <span className="text-red">inbox</span></h1>
      <p className="text-sm text-gray-500 mt-2">
        Find the boss: groups ask where you are. Answer only <b>Yes</b> or <b>No</b>.
      </p>

      <details className="card mt-4" open={!items.length}>
        <summary className="cursor-pointer font-bold">How to play — for management</summary>
        <ol className="mt-2 pl-5 list-decimal space-y-1.5 text-[15px] leading-snug">
          <li>Go to your hiding spot in the hunt area and stay there. Tap <b>Start standby</b> below so you hear every question.</li>
          <li>Groups send questions to find you. Answer only <b>Yes</b> or <b>No</b>, and answer truthfully. No hints, in the app or in person.</li>
          <li>Each group gets only <b>{QUESTION_LIMIT} questions</b> while you stay in one spot. After that they have to search with what they know.</li>
          <li>Want to move somewhere else? Answer any waiting questions first, then tap <b>We’re moving</b>. Every group gets {QUESTION_LIMIT} new questions — answer those about your new spot.</li>
          <li>When a group finds you, pose with the whole group for one funny photo. Their leader sends it from their phone to earn the stamp.</li>
          <li><b>Atami Video Challenge:</b> every group sends two videos — <b>Buy it, try it</b> (they try to sell you something they bought) and <b>Atami Geographic</b> (a nature documentary about an Atami animal of their choice). Rate each from <b>1 to 10</b> on this page, in <b>Atami Video Challenge</b> at the bottom.</li>
          <li>Keep the app open on this page. Sound on, phone charged.</li>
        </ol>
      </details>

      <div className="card mt-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <b>Moving to a new spot?</b>
          <span className="text-[12px] text-gray-500">
            {!limitOn ? 'Question limit not switched on yet' : lastMove ? `Last moved ${clock(lastMove.created_at)}${lastMove.mover_name ? ` · ${shortName(lastMove.mover_name)}` : ''}` : 'Not moved yet'}
          </span>
        </div>
        <button type="button" className="btn block mt-3" disabled={moving} onClick={moveNow} onBlur={() => setMoveConfirm(false)}
          style={moveConfirm ? { background: 'var(--gold)', color: 'var(--ink)' } : undefined}>
          {moving ? 'Telling the groups…' : moveConfirm ? `Tap again — every group gets ${QUESTION_LIMIT} new questions` : '🚶 We’re moving'}
        </button>
        {moveNote && <p className="note" style={{ margin: '8px 0 0' }}>{moveNote}</p>}
        {limitOn && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {huntGroups.map((g) => {
              const left = Math.max(0, QUESTION_LIMIT - questionsUsed(items, g.id, lastMoveAt));
              return (
                <span key={g.id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border-2 border-ink text-[12px] font-bold"
                  style={{ opacity: left ? 1 : 0.5 }}>
                  <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: g.colour }} />
                  {g.name}: {left} of {QUESTION_LIMIT} left
                </span>
              );
            })}
          </div>
        )}
      </div>

      {!standby ? (
        <button type="button" onClick={startStandby} className="btn block mt-4">
          Start standby · sound on, screen stays awake
        </button>
      ) : (
        <p className="note mt-3">
          On standby: you’ll hear a beep for each new question.
          {wakeSupported ? ' The screen stays on while this page is open.' : ' Keep the screen on — this phone can’t hold it awake.'}
        </p>
      )}

      {error && <p className="text-sm text-red mt-4">{error}</p>}
      {actError && <p className="text-sm text-red mt-4" aria-live="polite">{actError}</p>}

      <h2 className="font-mono text-[11px] tracking-[.18em] uppercase text-gray-500 mt-7 mb-2">
        Waiting for you {waiting.length ? `· ${waiting.length}` : ''}
      </h2>
      {!loaded && <p className="note">Loading…</p>}
      {loaded && !waiting.length && !error && (
        <div className="card"><p className="note" style={{ margin: 0 }}>No questions waiting. New ones appear here by themselves.</p></div>
      )}
      <div className="space-y-3">
        {waiting.map((q) => (
          <div key={q.id} className="card" style={fresh.has(q.id) ? { outline: '3px solid var(--gold)', outlineOffset: 2 } : undefined}>
            <div className="flex items-center justify-between gap-2">
              {chip(q.team)}
              <span className="text-[11px] text-gray-500">{shortName(q.asker_name)} · {ago(q.created_at, now)}</span>
            </div>
            <p className="text-xl font-semibold leading-snug mt-2.5 [overflow-wrap:anywhere]">{q.question}</p>
            <div className="grid grid-cols-2 gap-3 mt-3.5">
              <button type="button" className="btn sea" disabled={busy === q.id} onClick={() => reply(q.id, 'yes')}
                style={{ height: 56, fontSize: 20, justifyContent: 'center' }}>Yes</button>
              <button type="button" className="btn" disabled={busy === q.id} onClick={() => reply(q.id, 'no')}
                style={{ height: 56, fontSize: 20, justifyContent: 'center' }}>No</button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="font-mono text-[11px] tracking-[.18em] uppercase text-gray-500 mt-8 mb-2">Answered</h2>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {[{ id: 'all', name: 'All' }, ...huntGroups].map((g) => (
          <button key={g.id} type="button" onClick={() => setFilter(g.id)} aria-pressed={filter === g.id}
            className={`px-3 h-8 rounded-full border-2 text-xs font-semibold cursor-pointer ${filter === g.id ? 'border-ink bg-ink text-card' : 'border-gray-300 text-gray-500'}`}>
            {g.name}
          </button>
        ))}
      </div>
      {!answered.length && <p className="note">Nothing answered yet.</p>}
      <ul className="space-y-2">
        {answered.map((q) => (
          <li key={q.id} className="flex items-start gap-3 py-2 border-b border-gray-200">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">{chip(q.team)}<span className="text-[11px] text-gray-500">{clock(q.created_at)}</span></div>
              <p className="text-sm mt-1 [overflow-wrap:anywhere]">{q.question}</p>
            </div>
            {/* Tapping the other answer corrects a slip. */}
            <div className="flex gap-1 shrink-0" role="group" aria-label="Change answer">
              {['yes', 'no'].map((v) => (
                <button key={v} type="button" disabled={busy === q.id || q.answer === v} onClick={() => reply(q.id, v)}
                  aria-pressed={q.answer === v}
                  className="cursor-pointer disabled:cursor-default" style={{ opacity: q.answer === v ? 1 : 0.35, background: 'none', border: 0, padding: 0 }}>
                  <AnswerPill answer={v} />
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <PitchRating />
    </main>
  );
}

/* ── Home: the way into the inbox ──────────────────── */
export function BossInboxCard({ onOpen }) {
  const { items, error } = useBossQuestions();
  const waiting = items.filter((q) => !q.answer).length;
  return (
    <section className="card mt-5">
      <div className="eyebrow" style={{ color: 'var(--red)' }}>Find the boss</div>
      <h2 className="display text-2xl leading-tight mt-1">Boss inbox</h2>
      <p className="text-sm text-gray-500 mt-1.5">
        {error || (waiting ? `${waiting} question${waiting === 1 ? '' : 's'} waiting for a Yes or No.` : 'Groups’ yes/no questions to you arrive here live.')}
      </p>
      <p className="text-sm text-gray-500 mt-1.5">
        Also rate each group’s two <b>Atami Video Challenge</b> videos from 1 to 10 here — their stamp lands once both are rated.
      </p>
      <button type="button" onClick={onOpen} className="btn block mt-3">Open inbox</button>
    </section>
  );
}
