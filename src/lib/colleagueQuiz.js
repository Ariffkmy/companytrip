/* ═══════════════════════════════════════════════════
   Know your colleagues — questions, answers and options
   ═══════════════════════════════════════════════════

   Stamp 7 of the treasure hunt. The allocation (who answers which five
   questions), each person's answer and the wrong options shown beside it
   live in public.colleague_answers, joined to public.colleague_questions
   (20261010000000_colleague_quiz.sql). Everyone signed in reads them;
   only admins change them.

   A row, as the app uses it:
     { id, person, team, position, questionNo, question, answer, wrong }
*/

import { supabase } from './supabase';

const CACHE_KEY = 'olc-colleague-answers';

const shape = (r) => ({
  id: r.id,
  person: r.person,
  team: r.team,
  position: r.position,
  questionNo: r.question_no,
  question: r.colleague_questions?.question ?? '',
  answer: r.answer ?? '',
  wrong: r.wrong_options ?? [],
});

export function cachedColleagueAnswers() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? []; } catch { return []; }
}

/* Every row in form order. Falls back to this phone's last copy when
   there is no signal, so a team mid-game keeps playing. */
export async function fetchColleagueAnswers() {
  if (!supabase) return cachedColleagueAnswers();
  const { data, error } = await supabase
    .from('colleague_answers')
    .select('id, person, team, position, question_no, answer, wrong_options, colleague_questions(question)')
    .order('id');
  if (error) return cachedColleagueAnswers();
  const rows = data.map(shape);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch { /* quota */ }
  return rows;
}

/** Write the answer and wrong options of every row that changed. Admin only. */
export async function saveColleagueAnswers(rows, before) {
  const was = new Map(before.map((r) => [r.id, r]));
  const changed = rows.filter((r) => {
    const o = was.get(r.id);
    return !o || o.answer !== r.answer || JSON.stringify(o.wrong) !== JSON.stringify(r.wrong);
  });
  const results = await Promise.all(changed.map((r) => supabase
    .from('colleague_answers')
    .update({ answer: r.answer.trim() || null, wrong_options: r.wrong.map((w) => w.trim()).filter(Boolean) })
    .eq('id', r.id)
    .select('id')));
  const failed = results.find((x) => x.error || !x.data?.length);
  if (failed) throw failed.error ?? new Error('Not saved — only admins can change the answers.');
  return changed.length;
}

const norm = (s) => String(s ?? '').trim().toLowerCase();
/* Forms and spreadsheets turn ' into ’, so both match. */
const nameKey = (s) => norm(String(s ?? '').replace(/[’‘`]/g, "'"));
const qKey = (s) => String(s ?? '').replace(/[’‘`]/g, "'").toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim();

const shuffled = (list) => {
  const a = [...list];
  for (let j = a.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [a[j], a[k]] = [a[k], a[j]];
  }
  return a;
};

/* Wrong options for one row: what other people said to the same
   question, so they sound right. Only if nobody else gave a different
   answer are other questions' answers borrowed. */
function wrongFor(row, rows) {
  const taken = new Set([norm(row.answer)]);
  const pick = (list, n) => shuffled(list).reduce((out, o) => {
    const t = String(o.answer ?? '').trim();
    if (out.length < n && t && !taken.has(norm(t))) { taken.add(norm(t)); out.push(t); }
    return out;
  }, []);
  const same = pick(rows.filter((o) => o.id !== row.id && o.questionNo === row.questionNo), 3);
  return same.length ? same : pick(rows.filter((o) => o.id !== row.id), 2);
}

/** Fill in wrong options for answered rows — every row, or only those without any. */
export function buildWrongOptions(rows, { onlyEmpty = false } = {}) {
  return rows.map((r) => {
    if (!String(r.answer ?? '').trim() || (onlyEmpty && r.wrong.some((w) => w.trim()))) return r;
    return { ...r, wrong: wrongFor(r, rows) };
  });
}

/* Rows of tab-separated cells, as Excel copies them: a cell holding a
   tab, a newline or a quote comes wrapped in quotes, with "" for ". */
function parseTsv(text) {
  const rows = [[]];
  let cell = '';
  let quoted = false;
  const s = String(text ?? '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === '\t') { rows[rows.length - 1].push(cell); cell = ''; }
    else if (c === '\n') { rows[rows.length - 1].push(cell); cell = ''; rows.push([]); }
    else cell += c;
  }
  rows[rows.length - 1].push(cell);
  return rows.filter((r) => r.some((x) => x.trim()));
}

/* Fill in answers from the Microsoft Forms results, copied from Excel
   with the header row. The "Who are you?" column names the person; any
   column headed by one of their questions holds their answer. Branching
   leaves everyone else's columns blank. A later submission wins. */
export function importFormAnswers(rows, text) {
  const sheet = parseTsv(text);
  const head = sheet[0] ?? [];
  const whoCol = head.findIndex((h) => /who are you/i.test(h));
  if (whoCol < 0) return { error: 'Couldn’t find the “Who are you?” column. Copy the header row too.' };
  const questions = [...new Set(rows.map((r) => qKey(r.question)))];
  /* Excel may tack a number onto a repeated header ("…food?2"). */
  const colQ = head.map((h) => questions.find((q) => qKey(h).startsWith(q)) ?? null);
  const next = rows.map((r) => ({ ...r }));
  const people = new Set();
  const unknown = new Set();
  let filled = 0;
  sheet.slice(1).forEach((line) => {
    const who = nameKey(line[whoCol]);
    if (!who) return;
    let any = false;
    line.forEach((cell, c) => {
      const answer = String(cell ?? '').trim();
      if (!colQ[c] || !answer) return;
      const r = next.find((x) => nameKey(x.person) === who && qKey(x.question) === colQ[c]);
      if (!r) return;
      r.answer = answer;
      filled += 1;
      any = true;
    });
    if (any) people.add(who); else unknown.add(String(line[whoCol]).trim());
  });
  return { rows: next, filled, people: people.size, unknown: [...unknown] };
}
