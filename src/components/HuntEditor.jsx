import { useEffect, useMemo, useRef, useState } from 'react';
import TreasureHunt from './TreasureHunt';
import groupRoster from '../data/groupRoster';
import {
  DEFAULT_HUNT_CONFIG, fetchHuntConfig, saveHuntConfig, uploadHuntPhoto, validate,
} from '../lib/huntConfig';

/* ── Immutable path update ───────────────────────── */
function setIn(obj, path, value) {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  copy[k] = setIn(obj?.[k], rest, value);
  return copy;
}
const getIn = (obj, path) => path.reduce((o, k) => o?.[k], obj);

/* ── Fields ──────────────────────────────────────── */
const inputCls =
  'w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-[15px] text-ink placeholder:text-gray-400 ' +
  'outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-red/40';

let fieldSeq = 0;
function useFieldId() {
  const ref = useRef(null);
  if (ref.current === null) ref.current = `hf-${++fieldSeq}`;
  return ref.current;
}

function Field({ label, hint, children, id }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="note mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

function Text({ label, hint, value, onChange, placeholder }) {
  const id = useFieldId();
  return (
    <Field label={label} hint={hint} id={id}>
      <input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} h-10`} />
    </Field>
  );
}

function Area({ label, hint, value, onChange, rows = 3 }) {
  const id = useFieldId();
  return (
    <Field label={label} hint={hint} id={id}>
      <textarea id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} rows={rows}
        className={`${inputCls} py-2 leading-relaxed resize-y`} />
    </Field>
  );
}

function Num({ label, hint, value, onChange, min = 0 }) {
  const id = useFieldId();
  return (
    <Field label={label} hint={hint} id={id}>
      <input id={id} type="number" inputMode="numeric" min={min} value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className={`${inputCls} h-10 tick`} />
    </Field>
  );
}

function Photo({ label, hint, value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = useFieldId();

  async function onFile(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange(await uploadHuntPhoto(file));
    } catch (e) {
      setError(/fetch|network/i.test(e?.message ?? '') ? 'No connection. Uploading needs internet.' : 'Upload failed. Try a JPG or PNG under 5 MB.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      <p className="block text-xs font-semibold text-gray-600 mb-1">{label}</p>
      {value ? (
        <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
          <img src={value} alt="" className="block w-full max-h-56 object-cover" />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <label htmlFor={id} className="h-8 px-2.5 grid place-items-center rounded-md bg-white border border-gray-200 text-xs font-medium cursor-pointer">Replace</label>
            <button type="button" onClick={() => onChange(null)} className="h-8 px-2.5 rounded-md bg-white border border-gray-200 text-xs font-medium text-red cursor-pointer">Remove</button>
          </div>
        </div>
      ) : (
        <label htmlFor={id} className="flex h-20 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white text-sm text-gray-500 cursor-pointer hover:border-gray-400">
          {busy ? 'Uploading…' : '+ Add photo'}
        </label>
      )}
      <input id={id} type="file" accept="image/*" className="sr-only" disabled={busy}
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      {busy && value && <p className="note mt-1">Uploading…</p>}
      {error && <p role="alert" className="text-xs text-red mt-1">{error}</p>}
      {hint && <p className="note mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

/* A list of one-line strings with add / remove. */
function StringList({ label, items, onChange, addLabel, fixedLength }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-1">{label}</p>
      <ol className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 items-center">
            <span className="font-mono text-[11px] text-gray-400 w-5 shrink-0 text-right">{i + 1}</span>
            <input aria-label={`${label} ${i + 1}`} value={item} onChange={(e) => onChange(setIn(items, [i], e.target.value))}
              className={`${inputCls} h-10`} />
            {!fixedLength && (
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${i + 1}`}
                disabled={items.length <= 1}
                className="shrink-0 h-10 w-10 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-red cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">×</button>
            )}
          </li>
        ))}
      </ol>
      {!fixedLength && (
        <button type="button" onClick={() => onChange([...items, ''])}
          className="mt-2 text-sm font-medium text-ink underline underline-offset-2 decoration-red cursor-pointer">+ {addLabel}</button>
      )}
    </div>
  );
}

function Section({ title, sub, children, defaultOpen = false }) {
  return (
    <details open={defaultOpen} className="group bg-white border border-gray-200 rounded-lg overflow-hidden">
      <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-display text-base tracking-wide truncate">{title}</span>
          {sub && <span className="block text-xs text-gray-400 truncate">{sub}</span>}
        </span>
        <span className="ml-auto text-gray-400 text-xs transition-transform group-open:rotate-90" aria-hidden="true">▶</span>
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-4 border-t border-gray-100">{children}</div>
    </details>
  );
}

function Sub({ children }) {
  return <p className="font-mono text-[10px] tracking-[.18em] uppercase text-gray-400 pt-2">{children}</p>;
}

const TEXT_HINT = 'Blank line starts a new paragraph. **Double stars** make text bold.';

/* ── Editor ──────────────────────────────────────── */
export default function HuntEditor() {
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    let live = true;
    fetchHuntConfig().then(({ config, updatedAt: at, error }) => {
      if (!live) return;
      if (error) setLoadError('Couldn’t load the latest version — showing the copy saved on this device. Don’t save until you’re back online.');
      setDraft(config);
      setSaved(JSON.stringify(config));
      setUpdatedAt(at);
    });
    return () => { live = false; };
  }, []);

  const dirty = draft && JSON.stringify(draft) !== saved;
  const errors = useMemo(() => (draft ? validate(draft) : []), [draft]);

  /* Warn before closing the tab with unsaved edits. */
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  if (!draft) return <p className="note">Loading the hunt…</p>;

  if (previewing) {
    return (
      <div className="max-w-[640px] mx-auto">
        <TreasureHunt preview config={draft} onClose={() => { setPreviewing(false); window.scrollTo({ top: 0 }); }} />
      </div>
    );
  }

  const posePhotoCount = groupRoster.filter((g) => draft.teams[g.id]?.pose?.photo).length;
  const set = (path) => (value) => { setSaveMsg(''); setDraft((d) => setIn(d, path, value)); };
  const val = (path) => getIn(draft, path);
  const cp = (key) => ['checkpoints', key];

  async function onSave() {
    if (errors.length) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const at = await saveHuntConfig(draft);
      setSaved(JSON.stringify(draft));
      setUpdatedAt(at);
      setSaveMsg('Saved. Teams get the new version next time they open the hunt.');
    } catch (e) {
      setSaveMsg(/row-level|permission/i.test(e?.message ?? '') ? 'Not saved: your account isn’t an admin.' : 'Not saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  const commonFields = (key, { body = true, photo = true } = {}) => (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Text label="Title" value={val([...cp(key), 'title'])} onChange={set([...cp(key), 'title'])} />
        <Text label="Japanese subtitle" value={val([...cp(key), 'kana'])} onChange={set([...cp(key), 'kana'])} />
      </div>
      <Text label="Where on the route map" hint="Shown as a 📍 tag that opens the map, e.g. “Checkpoint 2”. Leave blank to hide."
        value={val([...cp(key), 'stop'])} onChange={set([...cp(key), 'stop'])} />
      {body && <Area label="Instructions" hint={TEXT_HINT} value={val([...cp(key), 'body'])} onChange={set([...cp(key), 'body'])} rows={4} />}
      {photo && <Photo label="Photo under the instructions (optional)" value={val([...cp(key), 'photo'])} onChange={set([...cp(key), 'photo'])} />}
    </>
  );

  const unlockFields = (key, n) => (
    <>
      <Sub>Unlock screen before checkpoint {n}</Sub>
      <Text label="Heading" value={val(['unlocks', key, 'h'])} onChange={set(['unlocks', key, 'h'])} />
      <Area label="Text" hint="Can use {budget}, {finish}, {quizCount}, {streak}." value={val(['unlocks', key, 'p'])} onChange={set(['unlocks', key, 'p'])} />
    </>
  );

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <p className="text-sm text-gray-500 flex-1 min-w-[12rem]">
          {updatedAt ? `Last saved ${new Date(updatedAt).toLocaleString()}` : 'Using the original content — not saved yet.'}
        </p>
        <button type="button" onClick={() => { setPreviewing(true); window.scrollTo({ top: 0 }); }}
          className="h-10 px-4 rounded-lg border-2 border-ink dark:border-gray-300 bg-white font-display text-base tracking-wide cursor-pointer whitespace-nowrap active:translate-y-px">
          ▶ Preview the game
        </button>
      </div>

      {loadError && <p role="alert" className="text-sm text-red">{loadError}</p>}

      <Section title="General" sub="Clock, points, finish" defaultOpen>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Num label="Race length (min)" value={val(['raceMinutes'])} onChange={set(['raceMinutes'])} min={1} />
          <Num label="Points per stamp" value={val(['points', 'checkpoint'])} onChange={set(['points', 'checkpoint'])} />
          <Num label="Quiz pts / answer" value={val(['points', 'quizPerAnswer'])} onChange={set(['points', 'quizPerAnswer'])} />
        </div>
        <Area label="Finish point" hint="Shown on the last unlock screen and the results screen." value={val(['finishPoint'])} onChange={set(['finishPoint'])} rows={2} />
        <Text label="Help note" hint="Small line under the first game (photo bingo). Leave blank to hide." value={val(['helpNote'])} onChange={set(['helpNote'])} />
      </Section>

      <Section title="1 · Photo bingo" sub="First game · nine prompts per team">
        <p className="note">Its own game, played first. Locking the card opens the stamp rally.</p>
        {commonFields('bingo', { body: false })}
        <div className="grid grid-cols-2 gap-3">
          <Num label="Points per line" value={val([...cp('bingo'), 'linePts'])} onChange={set([...cp('bingo'), 'linePts'])} />
          <Num label="Points for all nine" value={val([...cp('bingo'), 'fullPts'])} onChange={set([...cp('bingo'), 'fullPts'])} />
        </div>
        <Sub>Each team’s card</Sub>
        <p className="note -mt-2">
          Every team gets its own nine prompts (left to right, top to bottom). Who snaps each tile is drawn at random when the team
          first opens its card — one member per tile, spread evenly. Only that member can upload it; the Team Lead can upload any
          tile, but only to cover for a member with a technical issue.
        </p>
        <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3 lg:items-start">
          {groupRoster.map((g) => (
            <div key={g.id} className="rounded-lg border border-gray-200 p-3 space-y-3">
              <p className="font-display text-base tracking-wide">{g.name}</p>
              <StringList label="Prompts" items={val(['teams', g.id, 'bingo']).map((t) => t.prompt)}
                onChange={(items) => set(['teams', g.id, 'bingo'])(items.map((prompt) => ({ prompt })))} fixedLength />
            </div>
          ))}
        </div>
      </Section>

      <Section title="2 · Copy the pose" sub={`${posePhotoCount} of ${groupRoster.length} teams have a pose photo`}>
        {unlockFields('cp1', 2)}
        <Sub>Checkpoint</Sub>
        {commonFields('cp1', { photo: false })}
        <Sub>Each team’s pose</Sub>
        <p className="note -mt-2">Every team gets a different pose. The photo is what they copy — add one for every team.</p>
        <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3 lg:items-start">
          {groupRoster.map((g) => (
            <div key={g.id} className="rounded-lg border border-gray-200 p-3 space-y-3">
              <p className="font-display text-base tracking-wide">{g.name}</p>
              <Photo label="Pose photo" value={val(['teams', g.id, 'pose', 'photo'])} onChange={set(['teams', g.id, 'pose', 'photo'])} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="3 · Find the place + riddle" sub={`${val([...cp('cp2a'), 'title'])} · ${val([...cp('cp2b'), 'title'])}`}>
        {unlockFields('cp2', 3)}
        <Sub>Part A — find the place</Sub>
        {commonFields('cp2a', { photo: false })}
        <p className="note">Each team gets its own place to find — only that team sees its photo.</p>
        <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3 lg:items-start">
          {groupRoster.map((g) => (
            <div key={g.id} className="rounded-lg border border-gray-200 p-3 space-y-3">
              <p className="font-display text-base tracking-wide">{g.name}</p>
              <Photo label="Place photo" value={val(['teams', g.id, 'spot', 'photo'])} onChange={set(['teams', g.id, 'spot', 'photo'])} />
              <Text label="Caption under the photo" value={val(['teams', g.id, 'spot', 'hint'])} onChange={set(['teams', g.id, 'spot', 'hint'])} />
            </div>
          ))}
        </div>
        <Sub>Part B — riddles</Sub>
        {commonFields('cp2b', { body: false })}
        <Area label="Intro above the riddles (optional)" hint={TEXT_HINT} value={val([...cp('cp2b'), 'body'])} onChange={set([...cp('cp2b'), 'body'])} rows={2} />
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1">Riddles</p>
          <ol className="space-y-3">
            {val([...cp('cp2b'), 'riddles']).map((r, i, all) => (
              <li key={i} className="flex gap-2 items-start">
                <span className="font-mono text-[11px] text-gray-400 w-5 shrink-0 text-right pt-3">{i + 1}</span>
                <textarea aria-label={`Riddle ${i + 1}`} value={r} rows={4}
                  onChange={(e) => set([...cp('cp2b'), 'riddles', i])(e.target.value)}
                  className={`${inputCls} py-2 leading-relaxed resize-y`} />
                <button type="button" aria-label={`Remove riddle ${i + 1}`} disabled={all.length <= 1}
                  onClick={() => set([...cp('cp2b'), 'riddles'])(all.filter((_, j) => j !== i))}
                  className="shrink-0 h-10 w-10 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-red cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">×</button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => set([...cp('cp2b'), 'riddles'])([...val([...cp('cp2b'), 'riddles']), ''])}
            className="mt-2 text-sm font-medium text-ink underline underline-offset-2 decoration-red cursor-pointer">+ Add riddle</button>
          <p className="note mt-1">{TEXT_HINT} Teams must answer every riddle to collect the stamp.</p>
        </div>
      </Section>

      <Section title="4 · Buy it, try it" sub={val([...cp('cp3'), 'title'])}>
        {unlockFields('cp3', 4)}
        <Sub>Checkpoint</Sub>
        <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-3">
          <Num label="Budget ¥" value={val([...cp('cp3'), 'budgetYen'])} onChange={set([...cp('cp3'), 'budgetYen'])} />
          <Text label="What to buy" value={val([...cp('cp3'), 'brief'])} onChange={set([...cp('cp3'), 'brief'])} />
        </div>
        {commonFields('cp3')}
      </Section>

      <Section title="5 · Look around you" sub={`${val([...cp('cp4'), 'questions']).length} questions`}>
        {unlockFields('cp4', 5)}
        <Sub>Checkpoint</Sub>
        {commonFields('cp4')}
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1">Questions</p>
          <ol className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3">
            {val([...cp('cp4'), 'questions']).map((q, i) => (
              <li key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="flex gap-2 items-start">
                  <span className="font-mono text-[11px] text-gray-400 w-5 shrink-0 text-right pt-3">{i + 1}</span>
                  <div className="flex-1 min-w-0 space-y-2">
                    <input aria-label={`Question ${i + 1}`} value={q.q} onChange={(e) => set([...cp('cp4'), 'questions', i, 'q'])(e.target.value)} className={`${inputCls} h-10`} />
                    <input aria-label={`Accepted answers for question ${i + 1}`} value={(q.accept ?? []).join(', ')}
                      onChange={(e) => set([...cp('cp4'), 'questions', i, 'accept'])(e.target.value.split(',').map((a) => a.trim()).filter(Boolean))}
                      placeholder="Auto-marked answers, comma separated (optional)" className={`${inputCls} h-10 text-sm`} />
                  </div>
                  <button type="button" aria-label={`Remove question ${i + 1}`}
                    disabled={val([...cp('cp4'), 'questions']).length <= 1}
                    onClick={() => set([...cp('cp4'), 'questions'])(val([...cp('cp4'), 'questions']).filter((_, j) => j !== i))}
                    className="shrink-0 h-10 w-10 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-red cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">×</button>
                </div>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => set([...cp('cp4'), 'questions'])([...val([...cp('cp4'), 'questions']), { q: '', accept: [] }])}
            className="mt-2 text-sm font-medium text-ink underline underline-offset-2 decoration-red cursor-pointer">+ Add question</button>
          <p className="note mt-1">Questions without accepted answers still count for the stamp; they just don’t earn quiz points automatically.</p>
        </div>
      </Section>

      <Section title="6 · Ask a stranger" sub={val([...cp('ask'), 'title'])}>
        {unlockFields('ask', 6)}
        <Sub>Checkpoint</Sub>
        {commonFields('ask')}
        {val([...cp('ask'), 'tasks']).map((t, i) => (
          <div key={t.key} className="rounded-lg border border-gray-200 p-3 space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
              {t.key === 'photo' ? 'Photo task' : t.key === 'word' ? 'Text task 1' : 'Text task 2'}
            </p>
            <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
              <Text label="Task" value={t.label} onChange={set([...cp('ask'), 'tasks', i, 'label'])} />
              <Num label="Points" value={t.pts} onChange={set([...cp('ask'), 'tasks', i, 'pts'])} />
            </div>
            <Text label={t.key === 'photo' ? 'Hint under the photo box' : 'Hint in the answer box'} value={t.hint} onChange={set([...cp('ask'), 'tasks', i, 'hint'])} />
          </div>
        ))}
      </Section>
      <Section title="7 · General knowledge" sub={`${val([...cp('guess'), 'streak'])} in a row · ${val([...cp('guess'), 'bank']).length} questions`}>
        {unlockFields('guess', 7)}
        <Sub>Checkpoint</Sub>
        {commonFields('guess')}
        <div className="grid grid-cols-[minmax(0,10rem)] gap-3">
          <Num label="Right in a row to pass" value={val([...cp('guess'), 'streak'])} onChange={set([...cp('guess'), 'streak'])} min={1} />
        </div>
        <p className="note -mt-2">Questions are drawn at random with the four answers shuffled. A wrong answer resets the streak to zero.</p>
        <details className="rounded-lg border border-gray-200">
          <summary className="px-3 py-2.5 cursor-pointer text-sm font-medium">
            Question bank ({val([...cp('guess'), 'bank']).length})
          </summary>
          <ol className="px-3 pb-3 space-y-3">
            {val([...cp('guess'), 'bank']).map((t, i, all) => {
              const path = [...cp('guess'), 'bank', i];
              return (
                <li key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <div className="flex gap-2 items-center">
                    <span className="font-mono text-[11px] text-gray-400 w-6 shrink-0 text-right">{i + 1}</span>
                    <input aria-label={`Question ${i + 1}`} value={t.q} placeholder="Question"
                      onChange={(e) => set([...path, 'q'])(e.target.value)} className={`${inputCls} h-10`} />
                    <button type="button" aria-label={`Remove question ${i + 1}`} disabled={all.length <= 4}
                      onClick={() => set([...cp('guess'), 'bank'])(all.filter((_, j) => j !== i))}
                      className="shrink-0 h-10 w-10 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-red cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">×</button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 pl-8 pr-12">
                    <input aria-label={`Right answer for question ${i + 1}`} value={t.a} placeholder="✓ Right answer"
                      onChange={(e) => set([...path, 'a'])(e.target.value)} className={`${inputCls} h-10 text-sm border-sea`} />
                    {[0, 1, 2].map((d) => (
                      <input key={d} aria-label={`Wrong answer ${d + 1} for question ${i + 1}`} value={t.decoys?.[d] ?? ''} placeholder={`✕ Wrong answer ${d + 1}`}
                        onChange={(e) => set([...path, 'decoys', d])(e.target.value)} className={`${inputCls} h-10 text-sm`} />
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
          <button type="button" onClick={() => set([...cp('guess'), 'bank'])([...val([...cp('guess'), 'bank']), { q: '', a: '', decoys: ['', '', ''] }])}
            className="mx-3 mb-3 text-sm font-medium text-ink underline underline-offset-2 decoration-red cursor-pointer">+ Add question</button>
        </details>
      </Section>

      <Section title="8 · Team cheer" sub={val([...cp('cheer'), 'title'])}>
        {unlockFields('cheer', 8)}
        <Sub>Checkpoint</Sub>
        <div className="grid grid-cols-2 gap-3">
          <Num label="Target length (s)" value={val([...cp('cheer'), 'seconds'])} onChange={set([...cp('cheer'), 'seconds'])} min={1} />
          <Num label="Longest allowed (s)" value={val([...cp('cheer'), 'maxSeconds'])} onChange={set([...cp('cheer'), 'maxSeconds'])} min={1} />
        </div>
        {commonFields('cheer')}
      </Section>

      <button type="button"
        onClick={() => { setSaveMsg(''); setDraft(structuredClone(DEFAULT_HUNT_CONFIG)); }}
        className="text-xs text-gray-400 underline underline-offset-2 hover:text-red cursor-pointer pt-2">
        Reset everything to the original content (not saved until you press Save)
      </button>

      {/* Save bar — sits above the mobile tab bar, and only when there is something to save. */}
      {(dirty || saveMsg) && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 z-30 mt-4">
          <div className="rounded-xl border-2 border-ink dark:border-gray-300 bg-white p-3 shadow-lg space-y-2">
            {errors.length > 0 && (
              <ul role="alert" className="text-xs text-red space-y-0.5">
                {errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
            {saveMsg && <p className="text-sm text-gray-600" aria-live="polite">{saveMsg}</p>}
            {dirty && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium flex-1">Unsaved changes</span>
                <button type="button" onClick={() => { setDraft(JSON.parse(saved)); setSaveMsg(''); }}
                  className="h-10 px-3 rounded-lg text-sm text-gray-500 underline underline-offset-2 cursor-pointer">Discard</button>
                <button type="button" onClick={onSave} disabled={saving || errors.length > 0}
                  className="h-10 px-5 rounded-lg bg-red text-paper font-display text-base tracking-wide cursor-pointer disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 whitespace-nowrap">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
