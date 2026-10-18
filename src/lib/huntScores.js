/* ═══════════════════════════════════════════════════
   Treasure hunt scores
   ═══════════════════════════════════════════════════

   A run lives on its group leader's phone. As it plays, the phone copies
   it to public.hunt_scores — stamps and answers, photos left out — so
   Admin → Organiser can score every group from one place
   (supabase/migrations/20261013000000_hunt_scores.sql).

   Points are worked out here, from the run and the live config, never
   stored: change a points value in the editor and every score follows.
   The committee's own calls (judged awards, marks on typed answers) are
   in hunt_config.judging. */

import { supabase } from './supabase';
import { HUNT_ID } from './huntConfig';
import { isStorageFull } from './photos';
import { huntGroupOf } from '../data/huntGroups';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9぀-ヿ一-龯]/g, '');

/* The seven games in hub order, and the submission that earns each
   stamp. cp2's selfie (cp2a) only unlocks the quiz; cp2b is the stamp. */
export const SCORED_GAMES = [
  { key: 'bingo', sub: 'bingo' },
  { key: 'cp1', sub: 'cp1' },
  { key: 'cp2', sub: 'cp2b' },
  { key: 'cp3', sub: 'cp3' },
  { key: 'cp4', sub: 'cp4' },
  { key: 'guess', sub: 'guess' },
  { key: 'boss', sub: 'boss' },
];

/* Judged at the finish by the committee; one group wins each. */
export const AWARDS = [
  { key: 'pose', label: 'Best pose photo' },
  { key: 'bossPhoto', label: 'Funniest group photo (Find the boss)' },
];

export const DEFAULT_JUDGED_POINTS = 5;

/* When a group collected its last game, or null if it hasn't got all
   seven yet. */
export function completedAt(run) {
  const subs = run?.subs ?? {};
  const times = SCORED_GAMES.map((g) => subs[g.sub]);
  if (times.some((s) => !s)) return null;
  return Math.max(...times.map((s) => Number(s.at) || Infinity));
}

/* The group that gets the first-to-complete points: the committee's
   pick if it made one, otherwise whoever collected all seven games
   first. `runs` is every group's current run. */
export function firstToComplete(runs, judging = {}) {
  if (judging.first) return judging.first;
  let best = null;
  (runs ?? []).forEach((run) => {
    const t = completedAt(run);
    if (t != null && Number.isFinite(t) && (!best || t < best.t)) best = { id: run.teamId, t };
  });
  return best?.id ?? null;
}

/* Look around you, one answer at a time: the committee's mark if it
   has made one, otherwise the accepted answers if the question has any.
   `null` means nobody can tell yet — it scores nothing until marked. */
export function cp4Verdicts(sub, questions, marks = {}) {
  return (questions ?? []).map((q, i) => {
    const m = marks?.[i];
    if (m === true || m === false) return { mark: m, auto: false };
    if (!q?.accept?.length) return { mark: null, auto: false };
    const answer = norm(sub?.answers?.[i]);
    return { mark: Boolean(answer) && q.accept.some((a) => norm(a) && answer.includes(norm(a))), auto: true };
  });
}

/* { games: { bingo: n|null, … }, judged, won, first, total, toMark }.
   A game the group hasn't collected is null, not 0, so the board can
   tell "not played" from "played, scored nothing". `firstTeam` is from
   firstToComplete().

   10 a stamp for games 1–6, plus each game's extra; Find the boss has
   no stamp points, just a flat amount for the selfie. */
export function scoreBreakdown(run, CONFIG, judging = {}, firstTeam = null) {
  const subs = run?.subs ?? {};
  const pts = CONFIG.points ?? {};
  const stamp = Number(pts.checkpoint) || 0;
  const games = {};
  let toMark = 0;
  SCORED_GAMES.forEach(({ key, sub: subKey }) => {
    const sub = subs[subKey];
    if (!sub) { games[key] = null; return; }
    if (key === 'boss') { games[key] = Number(pts.boss ?? 20) || 0; return; }
    let p = stamp;
    if (key === 'bingo') p += Number(sub.points) || 0;
    else if (key === 'cp2') p += (Number(sub.right) || 0) * CONFIG.atami.pts;
    else if (key === 'cp3') p += Math.min(10, Math.max(0, Number(sub.rating) || 0)) * (CONFIG.buy?.ratingPts ?? 0);
    else if (key === 'guess') p += (Number(sub.right) || 0) * CONFIG.trivia.pts;
    else if (key === 'cp4') {
      const per = Number(CONFIG.points?.quizPerAnswer) || 0;
      if (Array.isArray(sub.answers)) {
        const v = cp4Verdicts(sub, CONFIG.quiz.questions, judging.cp4?.[run.teamId]);
        p += v.filter((x) => x.mark === true).length * per;
        toMark = v.filter((x) => x.mark === null).length;
      } else {
        p += (Number(sub.correct) || 0) * per;
      }
    }
    games[key] = p;
  });
  const each = Number(pts.judged ?? DEFAULT_JUDGED_POINTS) || 0;
  const won = AWARDS.filter((a) => judging.awards?.[a.key] === run?.teamId);
  const judged = won.length * each
    + Object.values(run?.bonus ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const first = firstTeam && firstTeam === run?.teamId ? Number(pts.first ?? 15) || 0 : 0;
  const total = Object.values(games).reduce((s, v) => s + (v ?? 0), 0) + judged + first;
  return { games, judged, won: won.map((a) => a.key), first, total, toMark };
}

/* ── Photos ──────────────────────────────────────────
   On the phone a photo is a data URL (50–200 KB). The synced run holds
   `{ path }` instead, pointing into the private hunt-photos bucket; the
   path is the photo's own hash, so the same photo is only ever uploaded
   once and a retake gets a new file. */
const PHOTO_BUCKET = 'hunt-photos';
const URL_TTL = 60 * 60;

function hashOf(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
const extOf = (dataUrl) => ({ 'image/png': 'png', 'image/webp': 'webp' }[dataUrl.slice(5, dataUrl.indexOf(';'))] ?? 'jpg');
const photoPath = (teamId, dataUrl) => `${teamId}/${hashOf(dataUrl)}-${dataUrl.length.toString(36)}.${extOf(dataUrl)}`;

function mapPhotos(v, fn) {
  if (typeof v === 'string') return v.startsWith('data:image/') ? fn(v) : v;
  if (Array.isArray(v)) return v.map((x) => mapPhotos(x, fn));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapPhotos(x, fn)]));
  return v;
}

/* What the scoreboard keeps of a run. Work in progress (open game,
   drafts, the quiz being dealt) stays on the phone. */
export function runSummary(run) {
  return mapPhotos({
    teamId: run.teamId,
    teamName: run.teamName,
    members: run.members ?? '',
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    clockReset: run.clockReset ?? null,
    subs: run.subs ?? {},
    bonus: run.bonus ?? {},
  }, (d) => ({ path: photoPath(run.teamId, d) }));
}

/* Uploads the run's photos that this phone hasn't uploaded yet. True
   when every one is up. */
async function uploadPhotos(run, onStorageFull) {
  const key = `treasure-up:${run.teamId}`;
  const found = new Map();
  mapPhotos(run.subs ?? {}, (d) => { found.set(photoPath(run.teamId, d), d); return d; });
  let done;
  try { done = new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { done = new Set(); }
  for (const [path, dataUrl] of found) {
    if (done.has(path)) continue;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const { error } = await supabase.storage.from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
      if (error) {
        /* Out of room: no point trying the rest this round. */
        if (isStorageFull(error)) onStorageFull?.();
        return false;
      }
    } catch { return false; }
    done.add(path);
    try { localStorage.setItem(key, JSON.stringify([...done])); } catch { /* re-uploads next time, harmlessly */ }
  }
  return true;
}

/** Copy a run, and its photos, to the scoreboard. True once all of it
    is there; the scores go up even if a photo didn't. `onStorageFull`
    is called when photo storage has run out of room. */
export async function pushRun(run, { onStorageFull } = {}) {
  if (!supabase || !run?.teamId) return false;
  const photosUp = await uploadPhotos(run, onStorageFull);
  const { error } = await supabase
    .from('hunt_scores')
    .upsert({ team_id: run.teamId, run: runSummary(run) });
  return !error && photosUp;
}

/* { path: signed URL } for synced photos. */
export async function signPhotos(paths) {
  const list = [...new Set(paths.filter(Boolean))];
  if (!supabase || !list.length) return {};
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(list, URL_TTL);
  if (error) return {};
  return Object.fromEntries(data.filter((u) => u.signedUrl).map((u) => [u.path, u.signedUrl]));
}

/* Every `{ path }` photo in a synced run. */
export function photoPathsOf(run) {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (typeof v.path === 'string' && Object.keys(v).length === 1) out.push(v.path);
      else Object.values(v).forEach(walk);
    }
  };
  walk(run?.subs);
  return out;
}

/* ── The board ───────────────────────────────────────
   One row per group, scored. A run from before the last restart is
   one the group no longer has: its phone starts over as soon as it
   hears about the restart. `loadLocal` (organiser only) falls back to a
   run played on this device when a group hasn't synced. */
export function buildRows(CONFIG, remote, judging = {}, resetAt = 0, loadLocal = null) {
  const current = (run) => Boolean(run?.startedAt) && !(resetAt
    && !(Number(run.clockReset) >= resetAt || Number(run.startedAt) >= resetAt));
  const runRows = CONFIG.teams.map((team) => {
    const synced = remote?.[team.id];
    const local = synced || !loadLocal ? null : loadLocal(team.id);
    const run = current(synced) ? synced : current(local) ? { ...local, teamId: team.id } : null;
    const stale = !run && Boolean(synced?.startedAt || local?.startedAt);
    return { team, leader: huntGroupOf(team.id)?.leader ?? null, run, stale, fromPhone: Boolean(run && !synced) };
  });
  const runs = runRows.map((r) => r.run).filter(Boolean);
  const autoFirst = firstToComplete(runs);
  const firstTeam = firstToComplete(runs, judging);
  const rows = runRows.map((r) => ({ ...r, score: r.run ? scoreBreakdown(r.run, CONFIG, judging, firstTeam) : null }));
  const ranked = [...rows].sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1));
  return { rows, ranked, autoFirst, firstTeam };
}

/* A game's title as the admin set it. cp2 is titled by its first screen. */
export const gameTitleOf = (key, cp) => cp[key === 'cp2' ? 'cp2a' : key]?.title ?? key;

/* ── Publishing ──────────────────────────────────────
   hunt_config.results_published: once on, every member can read every
   group's run, photos and bingo card. */
export async function fetchResultsPublished() {
  if (!supabase) return false;
  const { data, error } = await supabase.from('hunt_config').select('results_published').eq('id', HUNT_ID).maybeSingle();
  if (error) return false;
  return data?.results_published === true;
}

/** Admin only — RLS refuses everyone else. */
export async function setResultsPublished(on) {
  const { data, error } = await supabase
    .from('hunt_config')
    .upsert({ id: HUNT_ID, results_published: on })
    .select('results_published')
    .single();
  if (error) throw error;
  return data.results_published === true;
}

/* Every group's synced run, by team id. Admins only (RLS). `null` when
   the table isn't there or can't be reached. */
export async function fetchRuns() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('hunt_scores').select('team_id, run, updated_at');
  if (error) return null;
  return Object.fromEntries(data.map((r) => [r.team_id, { ...r.run, teamId: r.team_id, syncedAt: r.updated_at }]));
}

/** One group's synced run, or null (none yet, or not allowed to see it). */
export async function fetchRun(teamId) {
  if (!supabase || !teamId) return null;
  const { data, error } = await supabase.from('hunt_scores').select('run, updated_at').eq('team_id', teamId).maybeSingle();
  if (error || !data) return null;
  return { ...data.run, teamId, syncedAt: data.updated_at };
}

export async function fetchJudging() {
  if (!supabase) return {};
  const { data, error } = await supabase.from('hunt_config').select('judging').eq('id', HUNT_ID).maybeSingle();
  if (error) return {};
  return data?.judging ?? {};
}

/** Admin only — RLS refuses everyone else. */
export async function saveJudging(judging) {
  const { data, error } = await supabase
    .from('hunt_config')
    .upsert({ id: HUNT_ID, judging })
    .select('judging')
    .single();
  if (error) throw error;
  return data.judging ?? {};
}
