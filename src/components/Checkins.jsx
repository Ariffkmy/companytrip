/* ═══════════════════════════════════════════════════
   Safety check-ins — the popup, and the committee's view
   ═══════════════════════════════════════════════════

   CheckinPrompt sits over every screen for hunt-group members. While
   the hunt is open (and not stopped) it asks every 15 minutes for the
   phone's location: one tap, and the reading is saved. If location is
   blocked or can't be found, that is saved too, so the committee knows
   to call — and the popup comes back.

   CheckinsAdmin: everyone's latest check-in on a map and in a list,
   anyone overdue at the top in red. */

import { Suspense, useEffect, useMemo, useState } from 'react';
import { lazyChunk } from '../lib/chunk';
import {
  CHECKIN_EVERY_MS, OVERDUE_MS, SNOOZE_MS, deleteAllCheckins, fetchHuntActive, flushPending,
  getPosition, mapsLink, readLast, sendCheckin, useCheckinsLive, writeLast,
} from '../lib/checkins';
import { ping, unlockSound } from '../lib/bossChat';
import { HUNT_STOPPED_EVENT, fetchHuntConfig, withDefaults } from '../lib/huntConfig';
import huntGroups, { huntGroupOf } from '../data/huntGroups';
import { shortName } from './BossChat';

/* Leaflet is heavy; only the admin's check-in page needs it. */
const CheckinMap = lazyChunk(() => import('./CheckinMap'));

const ago = (ms, now) => {
  if (!ms) return 'No check-in yet';
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
};

/* ── Everyone in a hunt group: the popup ────────────── */
export function CheckinPrompt({ userId, huntGroup }) {
  const enabled = Boolean(userId && huntGroup);
  const [active, setActive] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [last, setLast] = useState(() => (userId ? readLast(userId) : 0));
  const [snoozeUntil, setSnoozeUntil] = useState(0);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState('ask'); // ask · locating · done · denied · unavailable · error
  const [result, setResult] = useState(null);

  /* Is the hunt on? Re-checked every minute, on coming back to the app,
     and the moment the game-over popup arrives. Unsent readings go too. */
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    const check = () => fetchHuntActive().then((a) => { if (live) setActive(a); });
    const wake = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
      check();
      flushPending(userId);
    };
    const onOnline = () => flushPending(userId);
    check();
    flushPending(userId);
    const id = setInterval(() => { if (!document.hidden) check(); }, 60000);
    window.addEventListener(HUNT_STOPPED_EVENT, check);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', wake);
    return () => {
      live = false;
      clearInterval(id);
      window.removeEventListener(HUNT_STOPPED_EVENT, check);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [enabled]);

  const due = enabled && active && now - last >= CHECKIN_EVERY_MS && now >= snoozeUntil;
  useEffect(() => {
    if (!due || open) return;
    setPhase('ask');
    setResult(null);
    setOpen(true);
    ping();
  }, [due, open]);

  /* The game ended while the popup was up: nothing to ask any more. */
  useEffect(() => { if (!active && phase !== 'done') setOpen(false); }, [active, phase]);

  if (!open) return null;

  const share = async () => {
    unlockSound();
    setPhase('locating');
    const reading = await getPosition();
    try {
      const outcome = await sendCheckin(userId, reading);
      if (reading.status === 'ok') {
        const t = Date.now();
        writeLast(userId, t);
        setLast(t);
        setResult({ ...reading, outcome });
        setPhase('done');
        setTimeout(() => setOpen(false), outcome === 'queued' ? 5000 : 2500);
      } else {
        setPhase(reading.status);
      }
    } catch (e) {
      setResult({ message: e.message });
      setPhase('error');
    }
  };

  const later = () => {
    setSnoozeUntil(Date.now() + SNOOZE_MS);
    setOpen(false);
  };

  const body = {
    ask: 'Every 15 minutes during the hunt, the committee checks that everyone is safe. Tap below to share where you are right now.',
    locating: 'Finding you… Stay on this screen for a few seconds.',
    done: result?.outcome === 'queued'
      ? `Got your location (±${result?.accuracy} m). No signal right now — it sends by itself as soon as you’re back online.`
      : `Checked in (±${result?.accuracy} m). Thanks — see you in 15 minutes.`,
    denied: 'Location is blocked for this app, so the committee can’t see where you are. In your phone’s Settings, allow Location for your browser (Safari or Chrome), then tap Try again.',
    unavailable: 'Your phone couldn’t find your location. Step away from tall buildings or indoors, then tap Try again.',
    error: result?.message ?? 'That didn’t save. Try again.',
  }[phase];

  const retry = phase === 'denied' || phase === 'unavailable' || phase === 'error';

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="checkin-title"
      className="fixed inset-0 z-[190] flex items-end sm:items-center justify-center bg-black/60 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="card w-full max-w-[480px]" style={{ borderTop: `8px solid ${retry ? 'var(--gold)' : 'var(--sea)'}`, margin: 0 }}>
        <h2 id="checkin-title" className="display text-3xl leading-none">
          {phase === 'done' ? '✓ Checked in' : '📍 Safety check-in'}
        </h2>
        <p className="text-[16px] leading-relaxed mt-3" aria-live="polite">{body}</p>
        {phase === 'denied' && (
          <p className="note mt-2">The committee will see that you didn’t share, and may call you.</p>
        )}
        {phase !== 'done' && (
          <>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- an alert dialog takes focus */}
            <button type="button" autoFocus onClick={share} disabled={phase === 'locating'}
              className="btn block mt-5" style={{ background: 'var(--sea)' }}>
              {phase === 'locating' ? 'Finding you…' : retry ? 'Try again' : 'Share my location'}
            </button>
            <button type="button" onClick={later} disabled={phase === 'locating'}
              className="block mx-auto mt-3 text-sm text-gray-500 underline underline-offset-2 cursor-pointer">
              Not now (ask again in 5 min)
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Admin: everyone's latest ───────────────────────── */
export function CheckinsAdmin() {
  const { rows, people, error, loaded, reload } = useCheckinsLive();
  const [active, setActive] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [start, setStart] = useState(null);
  const [focus, setFocus] = useState(null);
  const [fitKey, setFitKey] = useState(0);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delNote, setDelNote] = useState(null);

  useEffect(() => {
    let live = true;
    const tick = () => { setNow(Date.now()); fetchHuntActive().then((a) => { if (live) setActive(a); }); };
    tick();
    fetchHuntConfig().then(({ config }) => { if (live) setStart(withDefaults(config).map?.start ?? null); });
    const id = setInterval(tick, 30000);
    return () => { live = false; clearInterval(id); };
  }, []);

  const list = useMemo(() => {
    const latest = new Map();
    const latestPos = new Map();
    const count = new Map();
    for (const r of rows) {
      if (!latest.has(r.user_id)) latest.set(r.user_id, r);
      if (r.status === 'ok' && !latestPos.has(r.user_id)) latestPos.set(r.user_id, r);
      count.set(r.user_id, (count.get(r.user_id) ?? 0) + 1);
    }
    const byId = new Map(people.map((p) => [p.id, p]));
    const ids = new Set([...byId.keys(), ...latest.keys()]);
    return [...ids].map((id) => {
      const p = byId.get(id);
      const last = latest.get(id) ?? null;
      const pos = latestPos.get(id) ?? null;
      const lastAt = last ? new Date(last.taken_at).getTime() : 0;
      return {
        id,
        name: shortName(p?.full_name ?? last?.full_name),
        team: p?.hunt_group ?? last?.team ?? null,
        last,
        pos,
        lastAt,
        posAt: pos ? new Date(pos.taken_at).getTime() : 0,
        overdue: Boolean(active) && (!lastAt || now - lastAt > OVERDUE_MS),
        count: count.get(id) ?? 0,
      };
    }).sort((a, b) => (Number(b.overdue) - Number(a.overdue))
      || String(a.team).localeCompare(String(b.team))
      || a.name.localeCompare(b.name));
  }, [rows, people, active, now]);

  const points = useMemo(() => list.filter((x) => x.pos).map((x) => ({
    id: x.id,
    lat: x.pos.lat,
    lng: x.pos.lng,
    accuracy: x.pos.accuracy,
    name: x.name,
    group: huntGroupOf(x.team)?.name ?? '',
    colour: huntGroupOf(x.team)?.colour ?? 'var(--ink)',
    when: ago(x.posAt, now),
    overdue: x.overdue,
  })), [list, now]);

  const overdueCount = list.filter((x) => x.overdue).length;
  const freshCount = list.filter((x) => x.lastAt && now - x.lastAt <= OVERDUE_MS && x.last?.status === 'ok').length;

  const removeAll = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    setConfirmDel(false);
    try {
      await deleteAllCheckins();
      setDelNote({ ok: true, text: 'All check-ins deleted.' });
      reload();
    } catch (e) {
      setDelNote({ ok: false, text: e.message });
    }
  };

  const chip = (team) => {
    const g = huntGroupOf(team);
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold text-white border-2 border-ink whitespace-nowrap"
        style={{ background: g?.colour ?? 'var(--ink)' }}>
        {g?.name ?? 'No group'}
      </span>
    );
  };

  return (
    <div>
      <div className="card" style={{ margin: '0 0 14px', borderTop: `6px solid ${active ? 'var(--sea)' : 'var(--th-rule, #ccc)'}` }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="eyebrow" style={{ color: active ? 'var(--sea)' : 'var(--ink-soft)' }}>
            {active == null ? 'Check-ins' : active ? 'Check-ins are on' : 'Check-ins are off'}
          </div>
          <button type="button" className="mini" onClick={reload}>Refresh</button>
        </div>
        <p className="text-sm mt-1.5">
          {active
            ? <>Every hunt-group member is asked every 15 minutes. <b>{freshCount}</b> of {list.length} checked in within 20 minutes
              {overdueCount ? <>, <b className="text-red">{overdueCount} overdue</b></> : ''}.</>
            : 'They run while the hunt is open and not stopped (Admin → Treasure hunt opens it). The latest from the last 24 hours shows below.'}
        </p>
      </div>

      {error && <p className="text-sm text-red mb-3">{error}</p>}

      <div className="lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-5 items-start">
        <div className="mb-4 lg:sticky lg:top-28">
          <Suspense fallback={<div className="card note" style={{ margin: 0 }}>Loading map…</div>}>
            <CheckinMap points={points} start={start} focus={focus} fitKey={fitKey} />
          </Suspense>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <button type="button" className="mini" onClick={() => setFitKey((k) => k + 1)}>Fit everyone</button>
            <span className="flex flex-wrap gap-2">
              {huntGroups.map((g) => <span key={g.id}>{chip(g.id)}</span>)}
            </span>
          </div>
          <p className="note mt-1.5">Each dot is a person’s latest shared location; the faint circle is how accurate it is.</p>
        </div>

        <div>
          {!loaded && <p className="note">Loading…</p>}
          {loaded && !list.length && !error && <p className="note">Nobody is in a hunt group yet.</p>}
          <ul className="space-y-2">
            {list.map((x) => {
              const status = x.last?.status;
              return (
                <li key={x.id} className="card" style={{
                  margin: 0, padding: '10px 12px',
                  ...(x.overdue ? { borderColor: 'var(--red)', boxShadow: '3px 3px 0 var(--red)' } : {}),
                }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {chip(x.team)}
                    <b className="text-[15px]">{x.name}</b>
                    {x.overdue && <span className="text-[11px] font-bold uppercase tracking-wider text-red">Overdue</span>}
                    {status === 'denied' && <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--gold)' }}>Location blocked</span>}
                    {status === 'unavailable' && <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--gold)' }}>No fix</span>}
                    <span className="ml-auto text-xs text-gray-500">{ago(x.lastAt, now)}</span>
                  </div>
                  {x.pos ? (
                    <div className="flex items-center gap-3 flex-wrap mt-1.5 text-xs">
                      <button type="button" onClick={() => setFocus({ id: x.id, n: Date.now() })}
                        className="underline underline-offset-2 cursor-pointer text-ink">Show on map</button>
                      <a href={mapsLink(x.pos.lat, x.pos.lng)} target="_blank" rel="noopener noreferrer"
                        className="underline underline-offset-2 text-sea">Open in Google Maps ↗</a>
                      <span className="text-gray-500">
                        ±{x.pos.accuracy ?? '?'} m{x.posAt !== x.lastAt ? ` · position from ${ago(x.posAt, now)}` : ''}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1.5">No location shared yet.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="mt-8 pt-4 border-t border-gray-200">
        <p className="note">Location data is only for the hunt. Delete it all after the trip:</p>
        <button type="button" className="mini mt-2" onClick={removeAll} onBlur={() => setConfirmDel(false)}
          style={confirmDel ? { background: 'var(--red)', color: '#fff' } : undefined}>
          {confirmDel ? 'Tap again to delete every check-in' : 'Delete all check-ins'}
        </button>
        {delNote && <p className={`text-sm mt-2 ${delNote.ok ? 'text-sea' : 'text-red'}`}>{delNote.text}</p>}
      </div>
    </div>
  );
}
