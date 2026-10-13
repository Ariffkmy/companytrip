/* ═══════════════════════════════════════════════════
   Announcements — the popup everyone sees, and the admin's composer
   ═══════════════════════════════════════════════════

   AnnouncementPopup sits over every screen (Home, the hunt, the boss
   inbox) and opens the moment an admin sends something. It stays until
   the person taps "Got it". An emergency is red and beeps twice as
   long. Sound needs one earlier tap anywhere in the app (a browser
   rule), so the first tap unlocks it; the buzz works regardless on
   Android. */

import { useEffect, useState } from 'react';
import {
  ANNOUNCEMENT_MAX, POPUP_WINDOW_MS, deleteAnnouncement, readSeen, sendAnnouncement,
  useAnnouncements, writeSeen,
} from '../lib/announcements';
import { ping, unlockSound } from '../lib/bossChat';
import { HUNT_STOPPED_EVENT } from '../lib/huntConfig';
import { shortName } from './BossChat';

const when = (iso) => {
  try {
    return new Date(iso).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
};

const LEVELS = {
  info: { label: 'Announcement', colour: 'var(--sea)' },
  urgent: { label: 'Emergency', colour: 'var(--red)' },
  /* Sent by Admin → Organiser → Stop the game, not from the composer. */
  gameover: { label: 'Game over', colour: 'var(--red)' },
};

/* ── Everyone: the popup ───────────────────────────── */
export function AnnouncementPopup({ userId }) {
  const [seen, setSeen] = useState(() => readSeen(userId));
  useEffect(() => { setSeen(readSeen(userId)); }, [userId]);

  useEffect(() => {
    window.addEventListener('pointerdown', unlockSound, { once: true });
    return () => window.removeEventListener('pointerdown', unlockSound);
  }, []);

  const { items } = useAnnouncements({
    enabled: Boolean(userId),
    onNew: (row) => {
      ping();
      if (row.level !== 'info') { setTimeout(ping, 700); setTimeout(ping, 1400); }
      if (row.level === 'gameover') window.dispatchEvent(new Event(HUNT_STOPPED_EVENT));
    },
  });

  const cutoff = Date.now() - POPUP_WINDOW_MS;
  const open = items.filter((a) => !seen.has(a.id) && new Date(a.created_at).getTime() > cutoff);
  if (!userId || !open.length) return null;

  const urgent = open.some((a) => a.level !== 'info');
  const gameOver = open.some((a) => a.level === 'gameover');
  const dismiss = () => {
    const next = new Set(seen);
    open.forEach((a) => next.add(a.id));
    writeSeen(userId, next);
    setSeen(next);
  };

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="ann-title"
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="card w-full max-w-[480px] max-h-[85dvh] overflow-y-auto"
        style={{ borderTop: `8px solid ${urgent ? 'var(--red)' : 'var(--sea)'}`, margin: 0 }}>
        <h2 id="ann-title" className="display text-3xl leading-none" style={{ color: urgent ? 'var(--red)' : 'var(--ink)' }}>
          {gameOver ? '🏁 Game over' : urgent ? '⚠ Emergency' : 'Announcement'}
        </h2>
        <div className="mt-4 space-y-4">
          {open.map((a) => (
            <div key={a.id} className={open.length > 1 ? 'pb-4 border-b border-gray-200 last:border-0 last:pb-0' : ''}>
              {open.length > 1 && (
                <div className="font-mono text-[10px] tracking-[.18em] uppercase font-bold" style={{ color: LEVELS[a.level]?.colour }}>
                  {LEVELS[a.level]?.label ?? 'Announcement'}
                </div>
              )}
              <p className="text-[17px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] mt-1">{a.body}</p>
              <p className="text-xs text-gray-500 mt-2">
                From {a.author_name ? shortName(a.author_name) : 'the committee'} · {when(a.created_at)}
              </p>
            </div>
          ))}
        </div>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- an alert dialog takes focus */}
        <button type="button" autoFocus onClick={dismiss} className="btn block mt-5"
          style={urgent ? undefined : { background: 'var(--sea)' }}>
          Got it
        </button>
      </div>
    </div>
  );
}

/* ── Admin: write and send ─────────────────────────── */
export function AnnounceAdmin() {
  const [body, setBody] = useState('');
  const [level, setLevel] = useState('info');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState(null);
  const [removing, setRemoving] = useState(null);
  const { items, error, setItems } = useAnnouncements();

  const send = async () => {
    if (!body.trim() || sending) return;
    if (!confirming) { setConfirming(true); return; }
    setSending(true);
    setNote(null);
    try {
      const row = await sendAnnouncement(body, level);
      if (row) setItems((list) => (list.some((r) => r.id === row.id) ? list : [row, ...list]));
      setBody('');
      setLevel('info');
      setNote({ ok: true, text: 'Sent. It’s popping up on every phone with the app open now.' });
    } catch (e) {
      setNote({ ok: false, text: e.message });
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  const remove = async (id) => {
    if (removing !== id) { setRemoving(id); return; }
    try {
      await deleteAnnouncement(id);
      setItems((list) => list.filter((r) => r.id !== id));
    } catch (e) {
      setNote({ ok: false, text: e.message });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="card" style={{ margin: 0 }}>
        <label htmlFor="ann-body" className="font-mono text-[10px] tracking-[.18em] uppercase text-gray-500">Message</label>
        <textarea id="ann-body" value={body} maxLength={ANNOUNCEMENT_MAX} rows={4}
          onChange={(e) => { setBody(e.target.value); setConfirming(false); }}
          placeholder="e.g. Bus leaves from the hotel lobby at 8:30, not 9:00."
          className="mt-1.5 w-full p-3 rounded-lg border border-gray-300 bg-white text-[15px] text-ink outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-red/40" />
        <div className="flex items-center justify-between gap-3 mt-1">
          <span className="text-[11px] text-gray-400">{body.length}/{ANNOUNCEMENT_MAX}</span>
        </div>

        <fieldset className="mt-3">
          <legend className="font-mono text-[10px] tracking-[.18em] uppercase text-gray-500 mb-1.5">Type</legend>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(LEVELS).filter(([id]) => id !== 'gameover').map(([id, l]) => (
              <label key={id} className={`flex items-center gap-2 h-11 px-3 rounded-lg border-2 cursor-pointer text-sm font-semibold ${level === id ? 'border-ink' : 'border-gray-200 text-gray-500'}`}>
                <input type="radio" name="ann-level" value={id} checked={level === id}
                  onChange={() => { setLevel(id); setConfirming(false); }} className="accent-[var(--color-red)]" />
                <span style={level === id ? { color: l.colour } : undefined}>{id === 'urgent' ? '⚠ ' : ''}{l.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button type="button" onClick={send} disabled={!body.trim() || sending} className="btn block mt-4"
          style={level === 'info' ? { background: 'var(--sea)' } : undefined}>
          {sending ? 'Sending…' : confirming ? 'Tap again to send to everyone' : `Send ${level === 'urgent' ? 'emergency alert' : 'announcement'} to everyone`}
        </button>
        <p className="note mt-2">
          Pops up straight away on every phone with the app open. Anyone offline or with the app closed sees it when they next open it (within 24 hours).
        </p>
        {note && <p className={`text-sm mt-2 ${note.ok ? 'text-sea' : 'text-red'}`} aria-live="polite">{note.text}</p>}
        {error && <p className="text-sm mt-2 text-red">{error}</p>}
      </div>

      <h2 className="font-mono text-[11px] tracking-[.18em] uppercase text-gray-500 mt-7 mb-2">Sent</h2>
      {!items.length && <p className="note">Nothing sent yet.</p>}
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="flex items-start gap-3 py-2.5 border-b border-gray-200">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-[.14em] uppercase">
                <span className="font-bold" style={{ color: LEVELS[a.level]?.colour }}>{LEVELS[a.level]?.label}</span>
                <span className="text-gray-400">{when(a.created_at)}{a.author_name ? ` · ${shortName(a.author_name)}` : ''}</span>
              </div>
              <p className="text-sm mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{a.body}</p>
            </div>
            <button type="button" onClick={() => remove(a.id)} onBlur={() => setRemoving(null)}
              className={`shrink-0 text-xs font-medium underline underline-offset-2 cursor-pointer ${removing === a.id ? 'text-red' : 'text-gray-400 hover:text-red'}`}>
              {removing === a.id ? 'Tap again' : 'Delete'}
            </button>
          </li>
        ))}
      </ul>
      <p className="note mt-3">Deleting takes it off phones that haven’t dismissed it yet.</p>
    </div>
  );
}
