import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import groupRoster from '../data/groupRoster';
import huntGroups from '../data/huntGroups';
import rooms from '../data/rooms';
import HuntEditor from './HuntEditor';
import { HuntOrganiser } from './TreasureHunt';
import { fetchHuntConfig } from '../lib/huntConfig';
import { sendInvites, inviteProblem } from '../lib/invites';
import { listPolicies, removeCertificate, uploadCertificate } from '../lib/insurance';
import { nameLooksWrong } from '../lib/policyPdf';

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

/* The treasure hunt's groups, separate from the trip teams. */
function HuntGroupSelect({ value, onChange, disabled, id }) {
  return (
    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled} className={selectCls}>
      <option value="">Not playing</option>
      {huntGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
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
  const [inviteNow, setInviteNow] = useState(true);

  async function onSubmit(e) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!addr) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase
      .from('allowed_emails')
      .insert({ email: addr, full_name: name.trim() || null, team, role });
    if (err) { setBusy(false); setError(friendly(err)); return; }
    if (inviteNow) {
      const [r] = await sendInvites([addr]);
      setAdded(r.status === 'sent' ? `Added ${addr} and emailed the invite.` : `Added ${addr}, but the invite didn’t send: ${inviteProblem(r.message)}`);
    } else {
      setAdded(`Added ${addr}. Send the invite from the list when you’re ready.`);
    }
    setBusy(false);
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
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" checked={inviteNow} onChange={(e) => setInviteNow(e.target.checked)} className="w-4 h-4 accent-[var(--color-red)]" />
        Email the invite link now
      </label>
      {error && <p role="alert" className="text-sm text-red">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full h-11 rounded-lg bg-red text-paper font-display text-base tracking-wide cursor-pointer transition-transform duration-100 active:translate-y-px disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        {busy ? 'Adding…' : 'Add to the trip list'}
      </button>
      {added && (
        <p className="note leading-relaxed" aria-live="polite">
          {added}
        </p>
      )}
    </form>
  );
}

/* ── One person ──────────────────────────────────── */
const shortDate = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function PersonRow({ person, joined, isSelf, onPatch, onRemove, selected, onSelect, inviting, onInvite, inviteNote }) {
  const [confirming, setConfirming] = useState(false);
  const base = `p-${person.email.replace(/[^a-z0-9]/gi, '-')}`;

  const who = person.full_name || person.email;

  return (
    <tr className="border-t border-gray-200 align-middle">
      <td className="pl-3 pr-1 py-2.5 w-8">
        {!joined && (
          <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select ${who} for invite`}
            className="w-4 h-4 accent-[var(--color-red)] cursor-pointer" />
        )}
      </td>
      <td className="px-2 py-2.5 max-w-[220px]">
        <p className="text-sm font-medium leading-snug truncate">
          {who}
          {isSelf && <span className="ml-1.5 text-gray-400 font-normal">(you)</span>}
        </p>
        {person.full_name && <p className="font-mono text-[11px] text-gray-400 truncate">{person.email}</p>}
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap">
        <span className={`font-mono text-[10px] uppercase tracking-wider ${joined ? 'text-sea' : person.invited_at ? 'text-amber-600' : 'text-gray-400'}`}>
          {joined ? 'Joined' : person.invited_at ? 'Invited' : 'Not invited'}
        </span>
        {!joined && person.invited_at && <span className="block text-[11px] text-gray-400">{shortDate(person.invited_at)}</span>}
      </td>
      <td className="px-2 py-2.5 min-w-[130px]">
        <label htmlFor={`${base}-team`} className="sr-only">Team for {who}</label>
        <TeamSelect id={`${base}-team`} value={person.team} onChange={(v) => onPatch({ team: v })} />
      </td>
      <td className="px-2 py-2.5 min-w-[120px]">
        <label htmlFor={`${base}-group`} className="sr-only">Hunt group for {who}</label>
        <HuntGroupSelect id={`${base}-group`} value={person.hunt_group} onChange={(v) => onPatch({ hunt_group: v })}
          disabled={person.hunt_group === undefined} />
      </td>
      <td className="px-2 py-2.5 min-w-[120px]">
        <label htmlFor={`${base}-role`} className="sr-only">Role for {who}</label>
        <RoleSelect id={`${base}-role`} value={person.role} onChange={(v) => onPatch({ role: v })} />
      </td>
      <td className="px-2 py-2.5 text-center">
        <input type="checkbox" checked={person.is_admin} disabled={isSelf}
          onChange={(e) => onPatch({ is_admin: e.target.checked })}
          aria-label={isSelf ? 'Admin (can’t remove your own)' : `Admin: ${who}`}
          title={isSelf ? 'Can’t remove your own admin' : undefined}
          className="w-4 h-4 accent-[var(--color-red)] cursor-pointer disabled:cursor-not-allowed" />
      </td>
      <td className="pl-2 pr-3 py-2.5">
        <div className="flex items-center justify-end gap-3 whitespace-nowrap">
          {inviteNote && <span className={`text-xs ${inviteNote.ok ? 'text-sea' : 'text-red'}`}>{inviteNote.text}</span>}
          {!joined && (
            <button type="button" onClick={onInvite} disabled={inviting}
              className="h-8 px-3 rounded-md border border-gray-200 bg-white text-xs font-medium text-ink cursor-pointer hover:border-gray-400 disabled:opacity-50 disabled:cursor-wait">
              {inviting ? 'Sending…' : person.invited_at ? 'Resend' : 'Invite'}
            </button>
          )}
          {!isSelf && (
            <button type="button"
              onClick={() => (confirming ? onRemove() : setConfirming(true))}
              onBlur={() => setConfirming(false)}
              className={`text-xs font-medium cursor-pointer rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-red ${confirming ? 'text-red' : 'text-gray-400 hover:text-red'}`}>
              {confirming ? 'Tap again' : 'Remove'}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ── Admin page ──────────────────────────────────── */
function TripList({ currentEmail, onSelfChanged }) {
  const [people, setPeople] = useState(null);
  const [joined, setJoined] = useState(new Set());
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [sending, setSending] = useState(new Set());
  const [notes, setNotes] = useState({});
  const [bulkMsg, setBulkMsg] = useState('');
  const [progress, setProgress] = useState(null);

  const load = useCallback(async () => {
    const cols = 'email, full_name, team, role, is_admin, added_at';
    let [list, profiles] = await Promise.all([
      supabase.from('allowed_emails').select(`${cols}, hunt_group, invited_at, invite_count`).order('added_at'),
      supabase.from('profiles').select('email'),
    ]);
    /* Before the hunt-groups migration runs, hunt_group doesn't exist. */
    if (list.error && /hunt_group/.test(list.error.message)) {
      list = await supabase.from('allowed_emails').select(`${cols}, invited_at, invite_count`).order('added_at');
    }
    /* Before the invite-tracking migration runs, those columns don't exist. */
    if (list.error && /invited_at|invite_count/.test(list.error.message)) {
      list = await supabase.from('allowed_emails').select(cols).order('added_at');
    }
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

  /* One path for single and bulk sends: mark rows busy, send, note each
     result on its row, then reload so "Invited" dates are fresh. */
  const invite = async (emails) => {
    if (!emails.length) return [];
    setSending((prev) => new Set([...prev, ...emails]));
    setNotes((prev) => { const next = { ...prev }; emails.forEach((e) => delete next[e]); return next; });
    const results = await sendInvites(emails, emails.length > 1 ? (done, total) => setProgress({ done, total }) : undefined);
    setNotes((prev) => ({
      ...prev,
      ...Object.fromEntries(results.map((r) => [r.email, r.status === 'sent'
        ? { ok: true, text: 'Sent' }
        : r.status === 'joined' ? { ok: true, text: 'Already joined' }
        : r.status === 'not_on_list' ? { ok: false, text: 'Not on the list' }
        : { ok: false, text: inviteProblem(r.message) }])),
    }));
    setSending((prev) => { const next = new Set(prev); emails.forEach((e) => next.delete(e)); return next; });
    setProgress(null);
    load();
    return results;
  };

  const inviteSelected = async () => {
    const emails = [...selected];
    setBulkMsg('');
    const results = await invite(emails);
    const sent = results.filter((r) => r.status === 'sent').length;
    const failed = results.filter((r) => r.status === 'error' || r.status === 'not_on_list').length;
    setBulkMsg(`${sent} invite${sent === 1 ? '' : 's'} sent${failed ? ` · ${failed} didn’t send — see the rows marked in red` : ''}.`);
    setSelected(new Set(results.filter((r) => r.status === 'error').map((r) => r.email)));
  };

  const counts = useMemo(() => {
    const c = { all: people?.length ?? 0, none: 0 };
    (people ?? []).forEach((p) => { const k = p.team ?? 'none'; c[k] = (c[k] ?? 0) + 1; });
    return c;
  }, [people]);

  const shown = (people ?? []).filter((p) =>
    filter === 'all' ? true : filter === 'none' ? !p.team : p.team === filter
  );

  const invitable = shown.filter((p) => !joined.has(p.email));
  const notInvited = invitable.filter((p) => !p.invited_at);
  const toggle = (email, on) => setSelected((prev) => {
    const next = new Set(prev);
    if (on) next.add(email); else next.delete(email);
    return next;
  });

  const chips = [['all', 'Everyone'], ...groupRoster.map((g) => [g.id, g.name.replace(/^Team /, '')]), ['none', 'No team']];

  return (
    <div className="lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-8 lg:items-start">
      <div className="lg:sticky lg:top-32">
        <AddPerson onAdded={load} />
        {error && <p role="alert" className="text-sm text-red mt-4">{error}</p>}
      </div>

      <div className="min-w-0">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none mt-7 lg:mt-0 mb-3 -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap">
        {chips.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id}
            className={`flex-none h-8 px-3 rounded-full border text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
              filter === id ? 'bg-ink dark:bg-flame text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}>
            {label} <span className="font-mono opacity-70">{counts[id] ?? 0}</span>
          </button>
        ))}
      </div>

      {invitable.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-sm font-medium">Invites</span>
            <button type="button" onClick={() => setSelected(new Set(notInvited.map((p) => p.email)))} disabled={!notInvited.length}
              className="text-xs font-medium underline underline-offset-2 decoration-red cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              Select not invited ({notInvited.length})
            </button>
            <button type="button" onClick={() => setSelected(new Set(invitable.map((p) => p.email)))}
              className="text-xs font-medium underline underline-offset-2 decoration-red cursor-pointer">
              Select all not joined ({invitable.length})
            </button>
            {selected.size > 0 && (
              <button type="button" onClick={() => setSelected(new Set())}
                className="text-xs text-gray-500 underline underline-offset-2 cursor-pointer">Clear</button>
            )}
            <button type="button" onClick={inviteSelected} disabled={!selected.size || sending.size > 0}
              className="ml-auto h-9 px-4 rounded-lg bg-red text-paper font-display text-sm tracking-wide cursor-pointer disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 whitespace-nowrap">
              {progress ? `Sending ${progress.done}/${progress.total}…` : `Send ${selected.size || ''} invite${selected.size === 1 ? '' : 's'}`}
            </button>
          </div>
          {bulkMsg && <p className="text-xs text-gray-600" aria-live="polite">{bulkMsg}</p>}
          <p className="note leading-snug">Each person gets an email link that opens the app to set their password. People who’ve already joined can’t be selected.</p>
        </div>
      )}

      {people === null && !error && <p className="note">Loading the list…</p>}
      {people && shown.length === 0 && (
        <p className="text-sm text-gray-500">{filter === 'all' ? 'Nobody on the list yet. Add the first person above.' : 'Nobody here.'}</p>
      )}

      {shown.length > 0 && (
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <thead>
          <tr className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
            <th scope="col" className="pl-3 pr-1 py-2.5 w-8">
              {invitable.length > 0 && (
                <input type="checkbox"
                  checked={invitable.every((p) => selected.has(p.email))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(invitable.map((p) => p.email)) : new Set())}
                  aria-label="Select everyone not joined"
                  className="w-4 h-4 accent-[var(--color-red)] cursor-pointer" />
              )}
            </th>
            <th scope="col" className="px-2 py-2.5 font-normal">Name</th>
            <th scope="col" className="px-2 py-2.5 font-normal">Status</th>
            <th scope="col" className="px-2 py-2.5 font-normal">Team</th>
            <th scope="col" className="px-2 py-2.5 font-normal">Hunt group</th>
            <th scope="col" className="px-2 py-2.5 font-normal">Role</th>
            <th scope="col" className="px-2 py-2.5 font-normal text-center">Admin</th>
            <th scope="col" className="pl-2 pr-3 py-2.5 font-normal"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
        {shown.map((p) => (
          <PersonRow
            key={p.email}
            person={p}
            joined={joined.has(p.email)}
            isSelf={p.email === currentEmail}
            onPatch={(change) => patch(p.email, change)}
            onRemove={() => remove(p.email)}
            selected={selected.has(p.email)}
            onSelect={(on) => toggle(p.email, on)}
            inviting={sending.has(p.email)}
            onInvite={() => invite([p.email])}
            inviteNote={notes[p.email]}
          />
        ))}
        </tbody>
      </table>
      </div>
      )}

      {people && people.length > 0 && (
        <p className="note mt-6 leading-relaxed">
          Removing someone takes them off the list but doesn’t delete an account they’ve already made. To lock them out, also delete them in Supabase → Authentication → Users.
        </p>
      )}
      </div>
    </div>
  );
}

/* ── Insurance ───────────────────────────────────────
   One row per person on the trip list, whether or not they have joined
   yet: policies are keyed by email, so a certificate can be uploaded
   for someone who has not accepted their invite. */
function InsuranceRow({ person, policy, busy, note, mismatch, onUpload, onRemove }) {
  const who = person.full_name || person.email;
  const id = `ins-${person.email.replace(/[^a-z0-9]/gi, '-')}`;
  const hasFile = !!policy?.pdf_path;
  const details = policy?.reference_no || policy?.master_policy_no;

  return (
    <tr className="border-t border-gray-200 align-middle">
      <td className="pl-3 pr-2 py-2.5 max-w-[220px]">
        <span className="block text-sm font-medium truncate">{who}</span>
        <span className="block note truncate">{person.email}</span>
      </td>
      <td className="px-2 py-2.5">
        {details ? (
          <>
            <span className="block text-sm truncate">{policy.product || 'Policy loaded'}</span>
            <span className="block note truncate">
              {details}
              {policy.effective_date && ` · ${policy.effective_date} to ${policy.expiry_date ?? '?'}`}
            </span>
          </>
        ) : (
          <span className="text-sm text-gray-400">Read from the PDF when you upload it</span>
        )}
      </td>
      <td className="px-2 py-2.5">
        <span className={`text-xs font-medium ${hasFile ? 'text-green' : 'text-gray-400'}`}>
          {hasFile ? '✓ Uploaded' : 'No PDF'}
        </span>
        {note && (
          <span className={`block text-xs ${note.ok ? 'text-gray-600' : 'text-red'}`}>{note.text}</span>
        )}
        {/* Uploading one person's certificate against another is a
            privacy problem, not a typo, so it gets said plainly. */}
        {mismatch && (
          <span role="alert" className="block text-xs text-red leading-snug">
            Certificate names {mismatch} — check this is the right person’s PDF.
          </span>
        )}
      </td>
      <td className="pl-2 pr-3 py-2.5 text-right whitespace-nowrap">
        <label
          htmlFor={id}
          className={`inline-block h-9 px-3 leading-9 rounded-lg border border-gray-200 bg-white text-xs font-medium ${
            busy ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:border-gray-300'
          }`}
        >
          {busy ? 'Uploading…' : hasFile ? 'Replace' : 'Upload PDF'}
        </label>
        <input
          id={id}
          type="file"
          accept="application/pdf"
          disabled={busy}
          className="hidden"
          onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onUpload(f); }}
        />
        {hasFile && !busy && (
          <button type="button" onClick={onRemove}
            className="ml-2 text-xs text-gray-400 underline underline-offset-2 hover:text-red cursor-pointer">
            Remove
          </button>
        )}
      </td>
    </tr>
  );
}

function InsuranceAdmin() {
  const [people, setPeople] = useState(null);
  const [policies, setPolicies] = useState({});
  const [busy, setBusy] = useState(new Set());
  const [notes, setNotes] = useState({});
  /* The name printed on each certificate, as read from the PDF. Not a
     column — it exists only to catch the wrong file going to the wrong
     member, so it lives for as long as the page is open. */
  const [insured, setInsured] = useState({});
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const [{ data, error: err }, rows] = await Promise.all([
      supabase.from('allowed_emails').select('email, full_name').order('full_name', { nullsFirst: false }),
      listPolicies().catch(() => null),
    ]);
    if (err) { setError(friendly(err)); return; }
    setPeople(data ?? []);
    if (rows === null) setError('Couldn’t read the policies. Has the insurance migration been run?');
    else setPolicies(rows);
  }, []);

  useEffect(() => { load(); }, [load]);

  const mark = (email, on) => setBusy((prev) => {
    const next = new Set(prev);
    if (on) next.add(email); else next.delete(email);
    return next;
  });

  const run = async (email, work, okText) => {
    mark(email, true);
    setNotes((prev) => ({ ...prev, [email]: undefined }));
    try {
      const row = await work();
      setPolicies((prev) => ({ ...prev, [email]: row }));
      if ('insured_name' in row) setInsured((prev) => ({ ...prev, [email]: row.insured_name }));
      setNotes((prev) => ({ ...prev, [email]: { ok: true, text: okText } }));
    } catch (e) {
      const msg = e?.message ?? '';
      setNotes((prev) => ({ ...prev, [email]: { ok: false, text:
        /not a pdf/i.test(msg) ? 'That file isn’t a PDF.'
        : /row-level security|permission|403/i.test(msg) ? 'Your account isn’t an admin any more.'
        : /foreign key/i.test(msg) ? 'Not on the trip list any more.'
        : /payload too large|exceeded/i.test(msg) ? 'Too big — the limit is 10 MB.'
        : /fetch|network/i.test(msg) ? 'No connection.'
        : 'Couldn’t save that. Try again.' } }));
    } finally {
      mark(email, false);
    }
  };

  const done = (people ?? []).filter((p) => policies[p.email]?.pdf_path).length;

  return (
    <div className="min-w-0">
      {error && <p role="alert" className="text-sm text-red mb-3">{error}</p>}
      {people === null && !error && <p className="note">Loading the list…</p>}

      {people && people.length > 0 && (
        <>
          <p className="text-sm text-gray-600 mb-3">
            {done} of {people.length} have a certificate.
            {done < people.length && ' A PDF can go up before someone accepts their invite — it appears on their home screen when they first sign in.'}
          </p>
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
                  <th scope="col" className="pl-3 pr-2 py-2.5 font-normal">Member</th>
                  <th scope="col" className="px-2 py-2.5 font-normal">Policy</th>
                  <th scope="col" className="px-2 py-2.5 font-normal">Certificate</th>
                  <th scope="col" className="pl-2 pr-3 py-2.5 font-normal"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <InsuranceRow
                    key={p.email}
                    person={p}
                    policy={policies[p.email]}
                    busy={busy.has(p.email)}
                    note={notes[p.email]}
                    mismatch={nameLooksWrong(insured[p.email], p.full_name) ? insured[p.email] : null}
                    onUpload={(file) => run(p.email, () => uploadCertificate(p.email, file), 'Uploaded')}
                    onRemove={() => run(p.email, () => removeCertificate(policies[p.email]), 'Removed')}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="note mt-6 leading-relaxed">
            Policy numbers, plan and cover dates are read off the certificate as it uploads — there is nothing to type
            in. Replacing a certificate deletes the old file once the new one is safely in place.
          </p>
        </>
      )}

      {people && people.length === 0 && (
        <p className="text-sm text-gray-500">Nobody on the trip list yet — add people under Trip members first.</p>
      )}
    </div>
  );
}

/* ── Room pairing ─────────────────────────────────── */
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z ]/g, '').trim();

/* The roster's short names don't always match how the rooms were
   written ("Ragina" vs "Regina"), so the first word of the full name
   counts too. */
function rosterEntry(name) {
  const n = norm(name);
  for (const g of groupRoster) {
    const m = g.members.find((x) => norm(x.name) === n || norm(x.full).split(' ')[0] === n);
    if (m) return { team: g.name.replace(/^Team /, ''), role: m.role };
  }
  return null;
}

function RoomPairing() {
  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        {rooms.length} rooms, two to a room{rooms.some((r) => r.length === 1) ? ' unless marked single' : ''}. Team is shown so you can see who’s rooming across teams.
      </p>
      <ol className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rooms.map((pair, i) => (
          <li key={i} className="bg-white border border-gray-200 rounded-lg p-3.5">
            <p className="font-mono text-[11px] font-bold tracking-[.14em] uppercase text-gray-700 mb-2">
              Room {i + 1}{pair.length === 1 && <span className="text-gray-400 font-normal"> · single</span>}
              {i === rooms.length - 1 && <span className="text-gray-400 font-normal"> · last</span>}
            </p>
            <ul className="space-y-1.5">
              {pair.map((name) => {
                const who = rosterEntry(name);
                return (
                  <li key={name} className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-ink">{name}</span>
                    {who && (
                      <span className="ml-auto text-xs text-gray-400 truncate">
                        {who.team}{who.role !== 'Member' ? ` · ${who.role}` : ''}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* Trip members has two views: the allowlist itself, and who shares a room. */
function TripMembers({ currentEmail, onSelfChanged }) {
  const [view, setView] = useState('members');
  return (
    <div>
      <div role="tablist" aria-label="Trip members views" className="inline-flex gap-1 p-1 mb-5 rounded-full bg-gray-100">
        {[['members', 'Members'], ['rooms', 'Room pairing']].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
            className={`h-8 px-3.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
              view === id ? 'bg-white text-ink shadow-sm' : 'text-gray-500 hover:text-ink'
            }`}>
            {label}
          </button>
        ))}
      </div>
      {view === 'rooms'
        ? <RoomPairing />
        : <TripList currentEmail={currentEmail} onSelfChanged={onSelfChanged} />}
    </div>
  );
}

const SECTIONS = [
  { id: 'people', label: 'Trip members' },
  { id: 'insurance', label: 'Insurance', lede: 'One travel insurance certificate per person. Upload the PDF and it shows on their home screen — they can only ever see their own.' },
  { id: 'hunt', label: 'Treasure hunt', lede: 'Every game’s text, questions and reference photos. Preview plays your edits before anyone else sees them.' },
  { id: 'organiser', label: 'Organiser', lede: 'Live board for the hunt: scores, each team’s answers and photos, bonus points and resets.' },
];

/* The organiser scores against the hunt as saved, not as being edited. */
function OrganiserAdmin() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    let live = true;
    fetchHuntConfig().then((r) => { if (live) setConfig(r.config); });
    return () => { live = false; };
  }, []);
  if (!config) return <p className="text-sm text-gray-500">Loading…</p>;
  return <HuntOrganiser config={config} />;
}

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
          Admin <span className="text-red">{{ hunt: 'hunt', insurance: 'cover', organiser: 'board' }[current.id] ?? 'members'}</span>
        </h1>
        {current.lede && <p className="text-sm text-gray-500 leading-relaxed mt-2.5 max-w-[46ch]">{current.lede}</p>}
      </div>

      <div role="tablist" aria-label="Admin sections" className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 mb-5 rounded-lg bg-gray-100 lg:max-w-xl">
        {SECTIONS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={section === x.id} onClick={() => choose(x.id)}
            className={`h-9 rounded-md text-sm font-medium cursor-pointer transition-colors ${
              section === x.id ? 'bg-white text-ink shadow-sm' : 'text-gray-500 hover:text-ink'
            }`}>
            {x.label}
          </button>
        ))}
      </div>

      {section === 'hunt' && <HuntEditor />}
      {section === 'insurance' && <InsuranceAdmin />}
      {section === 'organiser' && <OrganiserAdmin />}
      {!['hunt', 'insurance', 'organiser'].includes(section) && (
        <TripMembers currentEmail={currentEmail} onSelfChanged={onSelfChanged} />
      )}
    </section>
  );
}
