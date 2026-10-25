/* ═══════════════════════════════════════════════════
   Treasure hunt results
   ═══════════════════════════════════════════════════

   The scoreboard, points by game, and everything each group sent in —
   answers and photos — read from hunt_scores (src/lib/huntScores.js).

   Two places use it: Admin → Organiser, always, and Home, for every
   member, once the committee publishes the results. Before that, RLS
   only lets admins and each group's leader read the runs. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchClockReset, toRuntime, withDefaults } from '../lib/huntConfig';
import {
  SCORED_GAMES, buildRows, cp4Verdicts, fetchJudging, fetchRuns, gameTitleOf, photoPathsOf, signPhotos,
} from '../lib/huntScores';
import { listShots } from '../lib/bingo';
import { supabase } from '../lib/supabase';

export const TH = {
  fontFamily: '"DM Mono", monospace', fontSize: 10, letterSpacing: '.08em',
  textTransform: 'uppercase', textAlign: 'left', padding: '6px 4px',
  borderBottom: 'var(--line)', fontWeight: 400, whiteSpace: 'nowrap',
};
export const TD = { padding: '8px 4px', borderBottom: '1px dashed var(--th-rule)', verticalAlign: 'middle' };
export const clockTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function GroupDot({ colour, size = 11 }) {
  return (
    <span aria-hidden="true" style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%', flex: 'none',
      border: '2px solid var(--ink)', background: colour, verticalAlign: 'middle',
    }} />
  );
}

/* Loads and polls everything the board needs. `loadLocal` is the
   organiser's fallback to runs played on its own device. `live` also
   reloads as soon as any group's row changes, over realtime. */
export function useHuntBoard(config, { loadLocal = null, every = 15000, live = false } = {}) {
  const CONFIG = useMemo(() => toRuntime(config ?? withDefaults(null)), [config]);
  /* undefined while loading; null when hunt_scores can't be read. */
  const [remote, setRemote] = useState(undefined);
  const [judging, setJudging] = useState({});
  const [resetAt, setResetAt] = useState(0);
  const [loadedAt, setLoadedAt] = useState(0);

  const refresh = useCallback(async () => {
    const [runs, j, at] = await Promise.all([fetchRuns(), fetchJudging(), fetchClockReset()]);
    setRemote(runs);
    setJudging(j);
    setResetAt(at);
    setLoadedAt(Date.now());
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => { if (!document.hidden) refresh(); }, every);
    return () => clearInterval(id);
  }, [refresh, every]);

  useEffect(() => {
    if (!live || !supabase) return undefined;
    const channel = supabase
      .channel(`hunt-board:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hunt_scores' }, () => refresh())
      .subscribe();
    /* Atami's signal drops the socket: catch up on the way back. */
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refresh);
      supabase.removeChannel(channel);
    };
  }, [live, refresh]);

  const board = buildRows(CONFIG, remote, judging, resetAt, loadLocal);
  return { CONFIG, remote, judging, setJudging, resetAt, setResetAt, loadedAt, refresh, ...board };
}

/* Tapping a group or a score on the boards opens that group in
   GroupDetails and scrolls to it — or to that one game. */
export function useGroupJump() {
  const [sel, setSel] = useState(null);
  const [target, setTarget] = useState(null);
  const jump = useCallback((teamId, game = null) => {
    setSel(teamId);
    setTarget({ game, n: Date.now() });
  }, []);
  return { sel, setSel, target, jump };
}

/* A bare button that looks like the text it wraps. */
export const linkBtn = {
  padding: 0, border: 0, background: 'none', color: 'inherit', font: 'inherit',
  cursor: 'pointer', textAlign: 'inherit',
};

/* ── Every game for every group ────────────────────── */
export function PointsTable({ CONFIG, rows, onPick }) {
  const cell = (v) => (v == null ? <span style={{ color: 'var(--ink-soft)' }}>–</span> : <b>{v}</b>);
  const pts = CONFIG.points ?? {};
  return (
    <div className="card">
      <div className="eyebrow" style={{ color: 'var(--red)', marginBottom: 8 }}>Points by game</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={TH}>Game</th>
              {rows.map(({ team }) => {
                const label = <><GroupDot colour={team.colour} size={9} /> {team.name.replace(/^Group\s+/i, '')}</>;
                return (
                  <th key={team.id} style={{ ...TH, textAlign: 'center' }}>
                    {onPick ? (
                      <button type="button" onClick={() => onPick(team.id)} aria-label={`See ${team.name}’s answers and photos`}
                        style={{ ...linkBtn, textDecoration: 'underline', textUnderlineOffset: 3 }}>{label}</button>
                    ) : label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {SCORED_GAMES.map((g, gi) => (
              <tr key={g.key}>
                <td style={TD}>
                  <span className="note" style={{ marginRight: 4 }}>{gi + 1}.</span>
                  {gameTitleOf(g.key, CONFIG.cp)}
                </td>
                {rows.map(({ team, score }) => (
                  <td key={team.id} style={{ ...TD, textAlign: 'center' }}>
                    {onPick && score?.games[g.key] != null ? (
                      <button type="button" onClick={() => onPick(team.id, g.key)}
                        aria-label={`See ${team.name}’s ${gameTitleOf(g.key, CONFIG.cp)}`}
                        style={{ ...linkBtn, textDecoration: 'underline', textUnderlineOffset: 3, minWidth: 28 }}>
                        {cell(score.games[g.key])}
                      </button>
                    ) : cell(score?.games[g.key])}
                    {g.key === 'cp4' && score?.toMark > 0 && (
                      <div style={{ font: '700 10px/1.2 var(--body)', color: 'var(--red)' }}>{score.toMark} to mark</div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td style={TD}>Best pose / funniest boss photo</td>
              {rows.map(({ team, score }) => (
                <td key={team.id} style={{ ...TD, textAlign: 'center' }}>{cell(score ? score.judged : null)}</td>
              ))}
            </tr>
            <tr>
              <td style={TD}>First to complete</td>
              {rows.map(({ team, score }) => (
                <td key={team.id} style={{ ...TD, textAlign: 'center' }}>{cell(score ? score.first : null)}</td>
              ))}
            </tr>
            <tr>
              <td style={{ ...TD, borderBottom: 'none' }}><b>Total</b></td>
              {rows.map(({ team, score }) => (
                <td key={team.id} style={{ ...TD, borderBottom: 'none', textAlign: 'center' }}>
                  <b className="display" style={{ fontSize: 20 }}>{score ? score.total : '–'}</b>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="note" style={{ margin: '10px 0 0' }}>
        Games 1–6: {pts.checkpoint} a stamp, plus bingo {CONFIG.bingo.tilePts} for every correct photo ·
        Atami quiz {CONFIG.atami.pts} for every right answer · Look around you {pts.quizPerAnswer} for every right answer ·
        Know your colleagues {CONFIG.trivia.pts} for every right answer. Find the boss: {pts.boss ?? 20} for the selfie.
        Atami Video Challenge: {CONFIG.buy?.ratingPts ?? 0} a mark of the bosses’ 1–10 rating for each of the two videos. Best pose and funniest boss photo: {pts.judged ?? 5} each. First to complete all 7: {pts.first ?? 15}. – means not played.
        {onPick && ' Tap a group or a score to open its game page.'}
      </p>
    </div>
  );
}

/* ── What each group sent in ───────────────────────── */
const tick = (ok) => (
  <span aria-label={ok ? 'right' : 'wrong'} style={{ fontWeight: 900, color: ok ? 'var(--sea)' : 'var(--red)' }}>{ok ? '✓' : '✗'}</span>
);

export function QaList({ items }) {
  if (!items?.length) return null;
  return (
    <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13 }}>
      {items.map((x, k) => (
        <li key={k} style={{ marginBottom: 8 }}>
          {x.who && <b>{x.who}: </b>}{x.q}
          <div>
            {x.ok == null ? <span className="note">not marked</span> : tick(x.ok)}{' '}
            <b>{x.picked == null || x.picked === '' ? '—' : String(x.picked)}</b>
            {x.ok === false && x.a != null && <span className="note"> · answer: {String(x.a)}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Badge({ children }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 999, background: 'var(--red)', color: '#fff',
      font: '700 11px/1.4 var(--body)', marginLeft: 6, verticalAlign: 'middle',
    }}>{children}</span>
  );
}

/* A synced photo: `{ path }`, signed into `urls`. */
function Photo({ p, label, urls, onZoom }) {
  if (!p) return null;
  const src = p?.path ? urls[p.path] : null;
  const box = {
    display: 'block', width: '100%', aspectRatio: '4 / 3', objectFit: 'cover',
    borderRadius: 8, border: 'var(--line)', background: 'var(--th-slot)',
  };
  return src ? (
    <button type="button" onClick={() => onZoom(src)} aria-label={`Open ${label ?? 'photo'}`}
      style={{ padding: 0, border: 0, background: 'none', cursor: 'zoom-in', display: 'block', width: '100%' }}>
      <img src={src} alt={label ?? ''} loading="lazy" style={box} />
    </button>
  ) : (
    <div style={{ ...box, display: 'grid', placeItems: 'center' }}>
      <span className="note">{p?.path ? 'Loading…' : 'Photo not uploaded'}</span>
    </div>
  );
}

export function GroupDetails({
  CONFIG, rows, judging, resetAt, firstTeam, title = 'What each group sent in', sel: selProp, onSel, target,
}) {
  const [ownSel, setOwnSel] = useState(null);
  const sel = selProp ?? ownSel;
  const setSel = onSel ?? setOwnSel;
  const cardRef = useRef(null);
  const row = rows.find((r) => r.team.id === sel) ?? rows.find((r) => r.run) ?? rows[0] ?? null;
  const run = row?.run ?? null;
  const [urls, setUrls] = useState({});
  const [shots, setShots] = useState([]);
  const [zoom, setZoom] = useState(null);

  const pathsKey = photoPathsOf(run).join('|');
  useEffect(() => {
    let live = true;
    if (!pathsKey) { setUrls({}); return undefined; }
    signPhotos(pathsKey.split('|')).then((u) => { if (live) setUrls(u); });
    return () => { live = false; };
  }, [pathsKey]);

  const teamId = row?.team.id ?? null;
  useEffect(() => {
    let live = true;
    setShots([]);
    if (!teamId) return undefined;
    listShots(teamId)
      .then((list) => { if (live) setShots(list.filter((s) => s.src && new Date(s.created_at).getTime() > resetAt)); })
      .catch(() => { /* not allowed or offline: no bingo photos to show */ });
    return () => { live = false; };
  }, [teamId, resetAt]);

  /* After a jump from the boards: scroll to the game, or the card. */
  useEffect(() => {
    if (!target) return;
    const card = cardRef.current;
    const el = (target.game && card?.querySelector(`[data-game="${target.game}"]`)) || card;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [target]);

  if (!row) return null;

  const subs = run?.subs ?? {};
  const score = row.score ?? { total: 0, games: {}, first: 0 };
  const won = (key) => judging.awards?.[key] === row.team.id;
  const photo = (p, label) => <Photo p={p} label={label} urls={urls} onZoom={setZoom} />;

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 };
  const quizItems = (log) => (log ?? []).map((x) => ({ ...x, ok: x.picked === x.a }));
  const cp4 = subs.cp4;
  const verdicts = cp4 ? cp4Verdicts(cp4, CONFIG.quiz.questions, judging.cp4?.[row.team.id]) : [];

  const bodies = {
    bingo: shots.length ? (
      <div style={grid}>
        {[...shots].sort((a, b) => a.tile - b.tile).map((s) => (
          <button key={s.tile} type="button" onClick={() => setZoom(s.src)} aria-label={`Open bingo tile ${s.tile + 1}`}
            style={{ padding: 0, border: 0, background: 'none', cursor: 'zoom-in' }}>
            <img src={s.src} alt="" loading="lazy" style={{
              display: 'block', width: '100%', aspectRatio: 1, objectFit: 'cover', borderRadius: 8, border: 'var(--line)',
            }} />
          </button>
        ))}
      </div>
    ) : <p className="note" style={{ margin: 0 }}>No bingo photos to show.</p>,
    cp1: photo(subs.cp1?.photo, 'Pose photo'),
    cp2: (
      <>
        {photo(subs.cp2a?.photo, 'Team selfie')}
        <p style={{ margin: '8px 0 0', fontSize: 14 }}>
          <b>{subs.cp2b?.right ?? 0} of {subs.cp2b?.answered ?? 0}</b> right
          {subs.cp2b?.attempts > 1 ? ` · passed on try ${subs.cp2b.attempts}` : ''}
        </p>
        <QaList items={quizItems(subs.cp2b?.log)} />
      </>
    ),
    cp3: (
      <>
        {subs.cp3?.rating != null && (
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>
            Buy it, try it rated <b>{subs.cp3.rating}/10</b>{subs.cp3.ratedBy ? ` by ${subs.cp3.ratedBy}` : ''}
          </p>
        )}
        {subs.cp3?.geoRating != null && (
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>
            Atami Geographic rated <b>{subs.cp3.geoRating}/10</b>{subs.cp3.geoRatedBy ? ` by ${subs.cp3.geoRatedBy}` : ''}
          </p>
        )}
        {subs.cp3?.item && <p style={{ margin: '0 0 8px', fontSize: 14 }}>Bought: <b>{subs.cp3.item}</b></p>}
        <div style={grid}>
          {(subs.cp3?.people ?? []).map((p, k) => (
            <div key={k} style={{ minWidth: 0 }}>
              {photo(p.photo, p.name)}
              <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, marginTop: 4, overflowWrap: 'anywhere' }}>{p.name}</div>
            </div>
          ))}
        </div>
      </>
    ),
    cp4: <QaList items={CONFIG.quiz.questions.map((q, i) => ({ q: q.q, picked: cp4?.answers?.[i] ?? '', ok: verdicts[i]?.mark }))} />,
    guess: (
      <>
        <p style={{ margin: 0, fontSize: 14 }}><b>{subs.guess?.right ?? 0} of {subs.guess?.answered ?? 0}</b> right</p>
        <QaList items={quizItems(subs.guess?.log)} />
      </>
    ),
    boss: photo(subs.boss?.photo, 'Boss photo'),
  };

  return (
    <div className="card" ref={cardRef} style={{ scrollMarginTop: 80 }}>
      <div className="eyebrow" style={{ color: 'var(--red)', marginBottom: 8 }}>{title}</div>
      <div role="tablist" aria-label="Group" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {rows.map(({ team }) => {
          const on = team.id === row.team.id;
          return (
            <button key={team.id} type="button" role="tab" aria-selected={on} onClick={() => setSel(team.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
              border: '2px solid var(--ink)', cursor: 'pointer', font: '700 13px/1.2 var(--body)',
              background: on ? 'var(--ink)' : 'var(--card)', color: on ? 'var(--card)' : 'var(--ink)',
            }}>
              <GroupDot colour={team.colour} size={9} /> {team.name}
            </button>
          );
        })}
      </div>
      {!run ? (
        <p className="note" style={{ margin: '10px 0 4px' }}>
          Nothing from {row.team.name} yet — its games show here once the group leader’s phone has played and synced them.
        </p>
      ) : (
      <p style={{ margin: '6px 0 0', fontSize: 14 }}>
        <b className="display" style={{ fontSize: 22 }}>{score.total} pts</b>
        {row.leader && <span className="note"> · leader {row.leader}</span>}
        {firstTeam === row.team.id && <Badge>★ First to complete +{score.first}</Badge>}
      </p>
      )}
      {run && SCORED_GAMES.map((g, gi) => (
        <div key={g.key} data-game={g.key} style={{ scrollMarginTop: 80, padding: '12px 0', borderBottom: gi < SCORED_GAMES.length - 1 ? '1px dashed var(--th-rule)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <b style={{ flex: 1, fontSize: 15 }}>
              <span className="note" style={{ marginRight: 4 }}>{gi + 1}.</span>{gameTitleOf(g.key, CONFIG.cp)}
              {g.key === 'cp1' && won('pose') && <Badge>★ Best pose</Badge>}
              {g.key === 'boss' && won('bossPhoto') && <Badge>★ Funniest photo</Badge>}
            </b>
            {score.games[g.key] == null
              ? <span className="note">not played</span>
              : <span className="display" style={{ fontSize: 18 }}>{score.games[g.key]} pts</span>}
          </div>
          {score.games[g.key] != null && bodies[g.key]}
        </div>
      ))}

      {zoom && (
        <div role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setZoom(null)} style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,10,12,.85)',
          display: 'grid', placeItems: 'center', padding: 16, cursor: 'zoom-out',
        }}>
          <img src={zoom} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

/* ── Standings for members ─────────────────────────── */
function Standings({ ranked, onPick }) {
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <div className="card flag">
      <div className="eyebrow" style={{ color: 'var(--red)', marginBottom: 8 }}>Final standings</div>
      {ranked.map(({ team, score }, i) => {
        const line = {
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', width: '100%',
          borderBottom: i < ranked.length - 1 ? '1px dashed var(--th-rule)' : 'none',
        };
        const inner = (
          <>
            <span style={{ width: 28, fontSize: 20, textAlign: 'center' }}>{score ? medal[i] ?? i + 1 : '–'}</span>
            <GroupDot colour={team.colour} />
            <b style={{ flex: 1, fontSize: i === 0 && score ? 17 : 15 }}>{team.name}</b>
            <b className="display" style={{ fontSize: i === 0 && score ? 26 : 20 }}>{score ? score.total : '–'}</b>
            {onPick && <span aria-hidden="true" style={{ width: 12, color: 'var(--ink-soft)' }}>›</span>}
          </>
        );
        return onPick ? (
          <button key={team.id} type="button" onClick={() => onPick(team.id)}
            aria-label={`${team.name}, ${score?.total ?? 0} points — see answers and photos`}
            style={{ ...linkBtn, ...line }}>{inner}</button>
        ) : <div key={team.id} style={line}>{inner}</div>;
      })}
    </div>
  );
}

/* ── Live progress, admins only ───────────────────────
   Home's read-only view of the race while it runs: who has which
   stamps, time left and points, ranked. The controls stay in
   Admin → Organiser. A group opens its game page, read only. */
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const ago = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return clockTime(ms);
};

export function LiveHuntProgress({ config, onOpenGroup }) {
  const { CONFIG, remote, ranked, loadedAt } = useHuntBoard(config, { live: true });
  /* The countdowns tick on their own between reloads. */
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    return () => clearInterval(id);
  }, []);

  const started = ranked.filter((r) => r.run).length;
  const finished = ranked.filter((r) => r.run?.finishedAt).length;

  return (
    <section className="mt-9" aria-labelledby="hunt-live-h">
      <h2 id="hunt-live-h" className="font-mono text-[13px] font-bold tracking-[.14em] uppercase text-gray-700 mb-2.5">
        Hunt progress · live{' '}
        <span className="normal-case tracking-normal font-normal text-gray-400">(admin only, view only)</span>
      </h2>
      {remote === undefined ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Loading every group’s progress…</p></div>
      ) : remote === null ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Couldn’t load the groups’ progress. Try again with signal.</p></div>
      ) : (
        <div className="card">
          <p className="note" style={{ margin: '0 0 6px' }}>
            {started === 0
              ? 'No group has started yet.'
              : `${started} of ${ranked.length} groups started · ${finished} finished`}
          </p>
          {ranked.map(({ team, leader, run, score }, i) => {
            const left = run?.startedAt
              ? Math.max(0, Math.round(((run.startedAt + CONFIG.raceMinutes * 60000) - (run.finishedAt || Date.now())) / 1000))
              : 0;
            const stamps = SCORED_GAMES.filter((g) => score?.games[g.key] != null);
            const line = {
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', width: '100%',
              borderBottom: i < ranked.length - 1 ? '1px dashed var(--th-rule)' : 'none',
            };
            const inner = (
              <>
                <span className="display" style={{ width: 18, fontSize: 18, textAlign: 'center' }}>{run ? i + 1 : '–'}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <GroupDot colour={team.colour} />
                    <b style={{ fontSize: 15 }}>{team.name}</b>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 5 }}
                    aria-label={`${stamps.length} of ${SCORED_GAMES.length} games done`}>
                    {SCORED_GAMES.map((g) => (
                      <span key={g.key} title={gameTitleOf(g.key, CONFIG.cp)} style={{
                        display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--ink)',
                        background: score?.games[g.key] != null ? 'var(--red)' : 'var(--th-slot)',
                      }} />
                    ))}
                    <span className="note" style={{ marginLeft: 4 }}>{stamps.length}/{SCORED_GAMES.length}</span>
                  </span>
                  <span className="note" style={{ display: 'block', marginTop: 3 }}>
                    {!run ? 'Not started' : run.finishedAt ? `Finished ${clockTime(run.finishedAt)}` : `${mmss(left)} left`}
                    {leader ? ` · ${leader}` : ''}
                    {run?.syncedAt ? ` · synced ${ago(new Date(run.syncedAt).getTime())}` : ''}
                  </span>
                </span>
                <b className="display" style={{ fontSize: 22 }}>{score ? score.total : '–'}</b>
                {onOpenGroup && run && <span aria-hidden="true" style={{ width: 12, color: 'var(--ink-soft)' }}>›</span>}
              </>
            );
            return onOpenGroup && run ? (
              <button key={team.id} type="button" onClick={() => onOpenGroup(team.id)}
                aria-label={`${team.name}, ${score?.total ?? 0} points — open its game page`}
                style={{ ...linkBtn, ...line }}>{inner}</button>
            ) : <div key={team.id} style={line}>{inner}</div>;
          })}
          {loadedAt > 0 && (
            <p className="note" style={{ margin: '10px 0 0' }}>
              Updates as groups sync · last checked {new Date(loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/* Home, once published. A group, or one of its scores, opens that
   group's own game page, read only (`onOpenGroup(teamId, game)`). */
export default function HuntResults({ config, onOpenGroup }) {
  const { CONFIG, remote, ranked, rows } = useHuntBoard(config, { every: 60000 });
  return (
    <section className="mt-9" aria-labelledby="hunt-results-h">
      <h2 id="hunt-results-h" className="font-mono text-[13px] font-bold tracking-[.14em] uppercase text-gray-700 mb-2.5">
        Treasure hunt results
      </h2>
      {remote === undefined ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Loading the results…</p></div>
      ) : remote === null ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Couldn’t load the results. Try again with signal.</p></div>
      ) : (
        <>
          <Standings ranked={ranked} onPick={onOpenGroup} />
          <PointsTable CONFIG={CONFIG} rows={rows} onPick={onOpenGroup} />
        </>
      )}
    </section>
  );
}
