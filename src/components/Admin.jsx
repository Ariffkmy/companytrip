import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import groupRoster from '../data/groupRoster';
import HuntEditor from './HuntEditor';

const ROLES = ['Member', 'Team Lead', 'JP Speaker'];

const selectCls =
  'h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-ink cursor-pointer ' +
  'outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-red/40 disabled:opacity-60';
const inputCls =
  'h-11 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-[15px] text-ink placeholder:text-gray-400 ' +
  'outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-red/40';

function friendly(error) {
  const msg = error?.message ?? '';
  if (/duplicate key/i.test(msg)) return 'That email is already on the list.';
  if (/row-level security|permission denied/i.test(msg)) return 'Your account isn’t an admin any more.';
  if (/fetch|network/i.test(msg)) return 'No connection. Changes need internet.';
  return 'Couldn’t save that. Try again.';
}

function TeamSelect({ value, onChange, disabled, id }) {
  return (
    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled} className={selectCls}>
      <option value="">No team</option>
      {groupRoster.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
    </select>
  );
}

function RoleSelect({ value, onChange, disabled, id }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={selectCls}>
      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}

/* ── Add someone ─────────────────────────────────── */
function AddPerson({ onAdded }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [team, setTeam] = useState(null);
  const [role, setRole] = useState('Member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!addr) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase
      .from('allowed_emails')
      .insert({ email: addr, full_name: name.trim() || null, team, role });
    setBusy(false);
    if (err) { setError(friendly(err)); return; }
    setAdded(addr);
    setEmail('');
    setName('');
    onAdded();
  }

  return (
    <form onSubmit={onSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <h2 className="font-display text-lg tracking-wide">Add someone</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <input type="email" required inputMode="email" autoCapitalize="none" spellCheck={false}
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" className={inputCls} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" className={inputCls} />
        <TeamSelect value={team} onChange={setTeam} />
        <RoleSelect value={role} onChange={setRole} />
      </div>
      {error && <p role="alert" className="text-sm text-red">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full h-11 rounded-lg bg-red text-paper font-display text-base tracking-wide cursor-pointer transition-transform duration-100 active:translate-y-px disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        {busy ? 'Adding…' : 'Add to the trip list'}
      </button>
      {added && (
        <p className="note leading-relaxed" aria-live="polite">
          Added {added}. Now send the invite: Supabase → Authentication → Users → Invite user.
        </p>
      )}
    </form>
  );
}

/* ── One person ──────────────────────────────────── */
function PersonRow({ person, joined, isSelf, onPatch, onRemove }) {
  const [confirming, setConfirming] = useState(false);
  const base = `p-${person.email.replace(/[^a-z0-9]/gi, '-')}`;

  return (
    <li className="bg-white border border-gray-200 rounded-lg p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug truncate">
            {person.full_name || person.email}
            {isSelf && <span className="ml-1.5 text-gray-400 font-normal">(you)</span>}
          </p>
          {person.full_name && <p className="font-mono text-[11px] text-gray-400 truncate">{person.email}</p>}
        </div>
        <span className={`shrink-0 font-mono text-[10px] uppercase tracking-wider ${joined ? 'text-sea' : 'text-gray-400'}`}>
          {joined ? 'Joined' : 'Not joined'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div>
          <label htmlFor={`${base}-team`} className="sr-only">Team</label>
          <TeamSelect id={`${base}-team`} value={person.team} onChange={(v) => onPatch({ team: v })} />
        </div>
        <div>
          <label htmlFor={`${base}-role`} className="sr-only">Role</label>
          <RoleSelect id={`${base}-role`} value={person.role} onChange={(v) => onPatch({ role: v })} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-3">
        <label className={`flex items-center gap-2 text-sm ${isSelf ? 'text-gray-400' : 'text-gray-600 cursor-pointer'}`}>
          <input type="checkbox" checked={person.is_admin} disabled={isSelf}
            onChange={(e) => onPatch({ is_admin: e.target.checked })}
            className="w-4 h-4 accent-[var(--color-red)]" />
          Admin
          {isSelf && <span className="note">can’t remove your own</span>}
        </label>
        {!isSelf && (
          <button type="button"
            onClick={() => (confirming ? onRemove() : setConfirming(true))}
            onBlur={() => setConfirming(false)}
            className={`text-xs font-medium cursor-pointer rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-red ${confirming ? 'text-red' : 'text-gray-400 hover:text-red'}`}>
            {confirming ? 'Tap again to remove' : 'Remove'}
          </button>
        )}
      </div>
    </li>
  );
}

/* ── Admin page ──────────────────────────────────── */
function TripList({ currentEmail, onSelfChanged }) {
  const [people, setPeople] = useState(null);
  const [joined, setJoined] = useState(new Set());
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    const [list, profiles] = await Promise.all([
      supabase.from('allowed_emails').select('email, full_name, team, role, is_admin, added_at').order('added_at'),
      supabase.from('profiles').select('email'),
    ]);
    if (list.error) { setError(friendly(list.error)); return; }
    setError('');
    setPeople(list.data);
    setJoined(new Set((profiles.data ?? []).map((p) => p.email)));
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Optimistic: the select changes instantly; a failure puts it back. */
  const patch = async (email, change) => {
    const before = people;
    setPeople((ps) => ps.map((p) => (p.email === email ? { ...p, ...change } : p)));
    /* RLS turns a refused write into "0 rows", not an error — so ask for
       the row back and treat nothing returned as refused. */
    const { data, error: err } = await supabase.from('allowed_emails').update(change).eq('email', email).select('email');
    if (err || !data?.length) { setPeople(before); setError(friendly(err ?? { message: 'row-level security' })); return; }
    setError('');
    if (email === currentEmail) onSelfChanged?.();
  };

  const remove = async (email) => {
    const before = people;
    setPeople((ps) => ps.filter((p) => p.email !== email));
    const { data, error: err } = await supabase.from('allowed_emails').delete().eq('email', email).select('email');
    if (err || !data?.length) { setPeople(before); setError(friendly(err ?? { message: 'row-level security' })); }
  };

  const counts = useMemo(() => {
    const c = { all: people?.length ?? 0, none: 0 };
    (people ?? []).forEach((p) => { const k = p.team ?? 'none'; c[k] = (c[k] ?? 0) + 1; });
    return c;
  }, [people]);

  const shown = (people ?? []).filter((p) =>
    filter === 'all' ? true : filter === 'none' ? !p.team : p.team === filter
  );

  const chips = [['all', 'Everyone'], ...groupRoster.map((g) => [g.id, g.name.replace(/^Team /, '')]), ['none', 'No team']];

  return (
    <div>

      <AddPerson onAdded={load} />

      {error && <p role="alert" className="text-sm text-red mt-4">{error}</p>}

      <div className="flex gap-1.5 overflow-x-auto scrollbar-none mt-7 mb-3 -mx-4 px-4">
        {chips.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id}
            className={`flex-none h-8 px-3 rounded-full border text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
              filter === id ? 'bg-ink dark:bg-flame text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}>
            {label} <span className="font-mono opacity-70">{counts[id] ?? 0}</span>
          </button>
        ))}
      </div>

      {people === null && !error && <p className="note">Loading the list…</p>}
      {people && shown.length === 0 && (
        <p className="text-sm text-gray-500">{filter === 'all' ? 'Nobody on the list yet. Add the first person above.' : 'Nobody here.'}</p>
      )}

      <ul className="space-y-2.5">
        {shown.map((p) => (
          <PersonRow
            key={p.email}
            person={p}
            joined={joined.has(p.email)}
            isSelf={p.email === currentEmail}
            onPatch={(change) => patch(p.email, change)}
            onRemove={() => remove(p.email)}
          />
        ))}
      </ul>

      {people && people.length > 0 && (
        <p className="note mt-6 leading-relaxed">
          Removing someone takes them off the list but doesn’t delete an account they’ve already made. To lock them out, also delete them in Supabase → Authentication → Users.
        </p>
      )}
    </div>
  );
}

const SECTIONS = [
  { id: 'people', label: 'Trip list', lede: 'Who can join, which team they’re on, and who else can manage this list. Teams set here are what people see in the treasure hunt.' },
  { id: 'hunt', label: 'Treasure hunt', lede: 'Every checkpoint’s text, questions and reference photos. Preview plays your edits before anyone else sees them.' },
];

/* ── Admin page ──────────────────────────────────── */
export default function Admin({ currentEmail, onSelfChanged }) {
  const [section, setSection] = useState(() => {
    try { return sessionStorage.getItem('olc-admin-section') || 'people'; } catch (e) { return 'people'; }
  });
  const choose = (id) => {
    setSection(id);
    try { sessionStorage.setItem('olc-admin-section', id); } catch (e) { /* silent */ }
  };
  const current = SECTIONS.find((x) => x.id === section) ?? SECTIONS[0];

  return (
    <section>
      <div className="pt-9 pb-5">
        <p className="font-mono text-[10px] tracking-[.28em] uppercase text-gray-400">Committee</p>
        <h1 className="display text-3xl sm:text-4xl mt-2.5 leading-[1.05]">
          Admin <span className="text-red">{current.id === 'hunt' ? 'hunt' : 'list'}</span>
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed mt-2.5 max-w-[46ch]">{current.lede}</p>
      </div>

      <div role="tablist" aria-label="Admin sections" className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-lg bg-gray-100">
        {SECTIONS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={section === x.id} onClick={() => choose(x.id)}
            className={`h-9 rounded-md text-sm font-medium cursor-pointer transition-colors ${
              section === x.id ? 'bg-white text-ink shadow-sm' : 'text-gray-500 hover:text-ink'
            }`}>
            {x.label}
          </button>
        ))}
      </div>

      {section === 'hunt'
        ? <HuntEditor />
        : <TripList currentEmail={currentEmail} onSelfChanged={onSelfChanged} />}
    </section>
  );
}
