/* ═══════════════════════════════════════════════════
   Atami treasure hunt — editable content
   ═══════════════════════════════════════════════════

   Everything an admin can change lives in one JSON document
   (public.hunt_config, id 'atami'). The flow itself — six stamps a
   team may collect in any order — and the scoring rules stay in
   TreasureHunt.jsx.

   DEFAULT_HUNT_CONFIG is the game as originally written. A stored
   document is merged over it, so a field added here later still has a
   value on a trip whose config was saved before the field existed.

   Text fields: blank line = new paragraph, **double stars** = bold.
*/

import { supabase } from './supabase';
import { PHOTO_PRESETS, compressPhoto } from './photos';
import huntGroups, { HUNT_GROUP_IDS } from '../data/huntGroups';
import { AREAS, FIELD_BOUNDARY, HUNT_MAP_LINK, ROUTE_STATS, START } from '../data/huntRoute';
import ATAMI_QUIZ from '../data/atamiQuiz';

export const HUNT_ID = 'atami';
export const MEDIA_BUCKET = 'hunt-media';
const CACHE_KEY = 'olc-hunt-config';

/* One team's bingo card is the reference photos the committee uploads,
   each with an optional caption — as many as they upload, so teams can
   have different counts. Teams find the spot and take a selfie of
   the whole team there. A tile with no photo (a caption left over from
   an older config) isn't part of the card. */
export function bingoTiles(card) {
  return (card ?? []).filter((t) => t?.photo);
}

/* The database accepts tiles 0 to BINGO_MAX - 1; keep the two in step
   (20261008000000_bingo_any_count.sql). */
export const BINGO_MAX = 30;

export const DEFAULT_HUNT_CONFIG = {
  raceMinutes: 90,
  /* checkpoint: each stamp of games 1–6. quizPerAnswer: Look around
     you. judged: each award the committee gives at the finish. boss:
     the Find the boss selfie (no stamp points). first: the first group
     to complete all seven games. See src/lib/huntScores.js. */
  points: { checkpoint: 10, quizPerAnswer: 2, judged: 5, boss: 20, first: 15 },
  finishPoint: 'The committee will point you to the finish at the briefing.',
  helpNote: 'Stuck? The committee is in the WhatsApp group.',

  /* Shown behind the "How it works" button on the hub. Points, not
     prose: this is read standing up, in a group, with the clock
     running. A line starting "- " is a bullet.

     The game count, the clock and the finish point are printed from the
     live config above this text, so they are deliberately not repeated
     here — those are the parts that would go stale. */
  rules: [
    '**The clock**',
    '- Starts when your team taps Start the hunt',
    '- Counts down in the header; at zero the hunt closes itself',
    '- You can finish early any time',
    '',
    '**Order**',
    '- Any order — open whichever game suits where you are',
    '- Skipping is allowed; a game you never play scores nothing',
    '- Leave one half-done and come back to it',
    '',
    '**Where you can go**',
    '- Stay inside the marked areas on the map',
    '- No route to follow, so walk where you like within them',
    '',
    '**Stay together**',
    '- One team — most photos need everyone in the frame',
    '- Photo bingo too: anyone can snap a tile, but it’s a selfie of the whole team at the spot',
    '',
    '**No looking things up**',
    '- Atami quiz: no searching, no asking anyone outside the team, no AI',
    '- Know your colleagues: no asking the person the question is about',
    '- Observation quiz: from what you noticed on the way, with no doubling back',
    '- Every photo taken today, by your team',
    '',
    '**Buy it, try it**',
    '- Spend any amount you like',
    '- Every member takes a photo with what you bought',
    '',
    '**What scores**',
    '- 10 a stamp, games 1 to 6',
    '- Photo bingo: 1 a photo, 5 more for the full card',
    '- Copy the pose: best pose photo, 5 more',
    '- Atami quiz: 2 a right answer, at least 10 of 15 right for the stamp, 10 seconds a question',
    '- Buy it, try it: most interesting buy, 5 more',
    '- Look around you: 2 a right answer',
    '- Know your colleagues: every question is about your rival group (A ↔ B, C ↔ D), 2 a right answer',
    '- Find the boss: 20 for the selfie with Tim and Ellice',
    '- First team to complete all 7 games: 15 more',
  ].join('\n'),

  /* Per hunt group (src/data/huntGroups.js), not per trip team. */
  teams: Object.fromEntries(HUNT_GROUP_IDS.map((id) => [id, {
    pose: { photo: null, place: null, placeHint: '' },
    spot: { hint: 'Recce photo goes here.', photo: null },
    bingo: [],
  }])),

  /* Area map. The areas tile the playing field side by side, sharing
     borders and covering it completely, so a team is always inside
     exactly one. There is no walking line — the order is the team's to
     choose. Outlines are fixed in ../data/huntRoute, which explains how
     they are derived; admins edit the labels and notes. */
  map: {
    link: HUNT_MAP_LINK,
    km: ROUTE_STATS.km,
    walkMin: ROUTE_STATS.walkMin,
    start: { lat: START.lat, lng: START.lng, label: START.label },
    boundary: FIELD_BOUNDARY,
    areas: AREAS.map((a) => ({ n: a.n, label: a.label, note: a.note, polygon: a.polygon })),
  },

  checkpoints: {
    cp1: {
      title: 'Copy the pose', photo: null, stop: '',
      body: 'Go to the place in the first photo, then copy the pose in the second.\n\nEveryone in the frame. Ask a passer-by to hold the phone if you have to.',
    },
    cp2a: {
      title: 'Atami quiz', photo: null, stop: '',
      body: 'Work out where this is, go there, and take a team selfie on the spot. The Atami quiz unlocks when the selfie lands.',
    },
    /* Multiple choice about Atami. Each round deals `perRound` random
       questions from the bank; the stamp needs `passMark` of them right,
       and a round short of it is played again with a fresh deal. Each
       question has `secondsPerQuestion` (0 = no limit); running out
       restarts the round from question 1 with a fresh deal. */
    cp2b: {
      title: 'How Well Do You Know Atami?', photo: null, stop: '',
      body: 'Answer as a team. You have **10 seconds** for each question — run out of time and you start again from the beginning with new questions. Get at least **10 of 15** right to collect the stamp; fall short and you get 15 new questions to try again. No searching, no asking anyone outside the team, no AI.',
      perRound: 15,
      secondsPerQuestion: 10,
      passMark: 10,
      pointsPerRight: 2,
      questions: ATAMI_QUIZ,
    },
    cp3: {
      title: 'Buy it, try it', photo: null, stop: '',
      brief: 'Something Japanese that nobody on your team has tried before.',
      body: 'Spend any amount you like. Every member takes a photo with what you bought — tap each name below to add their photo. Line-up changed? Edit the names, remove someone or add a member.',
    },
    cp4: {
      title: 'Look around you', photo: null, stop: '',
      body: 'This one is played **on the walk from Checkpoint 3 to Checkpoint 4**. Every answer is somewhere along that stretch — shop signs, things in windows, what is on the street and above it.\n\nKeep your eyes up and notice everything as you go: once you reach Checkpoint 4 you can\'t walk back to check. Split the questions between you before you set off. Phones down — none of this is on the internet.',
      questions: [
        { q: 'Something that is red. Name the object.', accept: [] },
        { q: 'Name a shop or cafe sign you passed on the way.', accept: [] },
        { q: 'How many pedestrian crossings did you cross between Checkpoint 3 and 4?', accept: [] },
        { q: 'Something white and floating.', accept: ['cloud', 'clouds', 'seagull', 'seagulls'] },
        { q: 'The last shop you passed before reaching Checkpoint 4. Name it.', accept: [] },
      ],
    },
    bingo: {
      title: 'Photo bingo', photo: null, stop: '',
      tilePts: 1,
      fullPts: 5,
    },
    /* Stamp 6. Keyed `guess` because it replaced the closest-guess game
       (and then general knowledge); the key is what saved team progress
       is filed under. The questions, who answers which, the answers and
       the wrong options are in the database (src/lib/colleagueQuiz.js);
       a team is only asked about people on the other teams. */
    guess: {
      title: 'Do you know your colleagues?', photo: null, stop: '',
      pointsPerRight: 2,
    },
    /* Stamp 7. Tim and Ellice roam the field; one photo of the team
       with them, in a funny pose. */
    boss: {
      title: 'Find the boss', photo: null, stop: '',
      body: 'Tim and Ellice are hiding somewhere in the hunt area. Find them both, then take **one photo of your whole team with them, pulling your funniest pose**.\n\nEveryone in the frame — Tim and Ellice too.',
    },
  },
};

/* ── Merge + shape ─────────────────────────────────── */

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

/* Stored values win; objects merge key by key; arrays replace whole. */
function deepMerge(base, over) {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
  const out = { ...base };
  Object.keys(over).forEach((k) => { out[k] = deepMerge(base[k], over[k]); });
  return out;
}

/* Saved while the hunt was played in the five trip teams: their pose,
   spot and bingo content carries over to the four groups. Pearl's has
   no group to go to. */
const TEAM_TO_GROUP = {
  'team-ruby': 'group-a', 'team-sapphire': 'group-b', 'team-emerald': 'group-c', 'team-diamond': 'group-d',
};

function teamsToGroups(stored) {
  const teams = stored?.teams;
  if (!teams || HUNT_GROUP_IDS.some((id) => teams[id])) return stored;
  const moved = Object.fromEntries(Object.entries(TEAM_TO_GROUP).filter(([t]) => teams[t]).map(([t, g]) => [g, teams[t]]));
  return { ...stored, teams: moved };
}

export function withDefaults(stored) {
  const merged = deepMerge(structuredClone(DEFAULT_HUNT_CONFIG), teamsToGroups(stored) || {});
  Object.keys(merged.teams).forEach((k) => { if (!HUNT_GROUP_IDS.includes(k)) delete merged.teams[k]; });
  /* Saved while the second half of stamp 3 was a riddle: it is the Atami
     quiz now. The committee's photo and play area carry over. */
  const oldCp2b = stored?.checkpoints?.cp2b;
  if (oldCp2b && !Array.isArray(oldCp2b.questions)) {
    merged.checkpoints.cp2b = {
      ...structuredClone(DEFAULT_HUNT_CONFIG.checkpoints.cp2b),
      photo: oldCp2b.photo ?? null,
      stop: oldCp2b.stop ?? '',
    };
    merged.checkpoints.cp2a.body = String(merged.checkpoints.cp2a.body ?? '').replace(/The riddle unlocks/, 'The Atami quiz unlocks');
    merged.rules = String(merged.rules ?? '')
      .replace(/^- Riddle: /m, '- Atami quiz: ')
      .replace(/^(- Observation quiz: .*)$/m, '$1\n- Atami quiz: 2 a right answer, at least 10 of 15 right for the stamp, 10 seconds a question');
  }
  delete merged.checkpoints.cp2b.riddles;
  /* Saved while Buy it, try it had a budget and one team photo: any
     amount now, and a photo of every member with what they bought. */
  if (merged.checkpoints.cp3.budgetYen !== undefined) {
    delete merged.checkpoints.cp3.budgetYen;
    if (/^Every member has to taste it\./.test(merged.checkpoints.cp3.body ?? '')) {
      merged.checkpoints.cp3.body = DEFAULT_HUNT_CONFIG.checkpoints.cp3.body;
    }
    merged.rules = String(merged.rules ?? '')
      .replace(/^\*\*Money\*\*$/m, '**Buy it, try it**')
      .replace(/^- ¥\d+ for the whole team on Buy it, try it$/m, '- Spend any amount you like')
      .replace(/^- Everyone tastes it; spending more earns nothing extra$/m, '- Every member takes a photo with what you bought');
  }
  /* Game 3 was called Find the place; it is the Atami quiz now. A title
     the committee changed to something else is left alone. */
  if (merged.checkpoints.cp2a.title === 'Find the place') merged.checkpoints.cp2a.title = 'Atami quiz';
  /* Saved while every award was 5 at the finish, first back included,
     and Find the boss earned a stamp: the points table changed, so the
     "What scores" section is replaced with the current one. */
  {
    const rules = String(merged.rules ?? '');
    if (/^- Judged at the finish: .*first back/m.test(rules)) {
      const block = (s) => s.match(/\*\*What scores\*\*[\s\S]*?(?=\n\s*\n|$)/);
      const fresh = block(DEFAULT_HUNT_CONFIG.rules)[0];
      merged.rules = block(rules) ? rules.replace(block(rules)[0], fresh) : `${rules.trimEnd()}\n\n${fresh}`;
    }
  }
  /* Saved while stamp 6 was the closest-guess or general knowledge game:
     its title, text and questions describe a game that no longer exists. */
  const oldGuess = stored?.checkpoints?.guess;
  if (oldGuess && (oldGuess.bank !== undefined
    || (oldGuess.streak === undefined && oldGuess.questions === undefined && oldGuess.pointsPerRight === undefined))) {
    merged.checkpoints.guess = {
      ...structuredClone(DEFAULT_HUNT_CONFIG.checkpoints.guess),
      stop: oldGuess.stop ?? '', photo: oldGuess.photo ?? null,
    };
  }
  /* The answers moved to their own tables (colleague_answers). */
  delete merged.checkpoints.guess.facts;
  /* Saved while it was won with a streak, then in rounds of a set size;
     now a group answers every question about its rival group. */
  delete merged.checkpoints.guess.streak;
  delete merged.checkpoints.guess.questions;
  /* Saved while the hunt was a fixed route: the team cheer, the unlock
     interstitials and the walking line are all gone, and the numbered
     stops are now outlined areas. */
  delete merged.checkpoints.cheer;
  /* Saved while Ask a stranger was one of the games. */
  delete merged.checkpoints.ask;
  merged.rules = String(merged.rules ?? '').split('\n').filter((l) => !/^- Ask a stranger/.test(l)).join('\n');
  /* Saved while bingo was a fixed 3×3 grid that scored rows and columns,
     with placeholder captions on tiles that had no photo yet. */
  delete merged.checkpoints.bingo.linePts;
  delete merged.checkpoints.bingo.size;
  Object.values(merged.teams).forEach((t) => { if (Array.isArray(t.bingo)) t.bingo = bingoTiles(t.bingo); });
  delete merged.unlocks;
  delete merged.map.checkpoints;
  delete merged.map.route;
  if (!Array.isArray(merged.map.areas) || !merged.map.areas.length) {
    merged.map.areas = structuredClone(DEFAULT_HUNT_CONFIG.map.areas);
  }
  /* Saved before the areas tiled the field: the old outlines were
     separate islands, and there was no field boundary at all. */
  if (merged.map.areas.some((a) => !Array.isArray(a.polygon) || a.polygon.length < 3)
    || !Array.isArray(merged.map.boundary) || merged.map.boundary.length < 3) {
    merged.map.boundary = structuredClone(DEFAULT_HUNT_CONFIG.map.boundary);
    /* Rebuilt from the defaults rather than from what was stored:
       deepMerge replaces arrays whole, so a document saved with a
       different number of areas would otherwise drop the rest of the
       tiling and leave holes in the field. Labels and notes the
       committee wrote are carried across by position. */
    const stored = merged.map.areas;
    merged.map.areas = DEFAULT_HUNT_CONFIG.map.areas.map((fresh, i) => ({
      ...structuredClone(fresh),
      label: stored[i]?.label ?? fresh.label,
      note: stored[i]?.note ?? fresh.note,
    }));
  }
  return merged;
}

/* The Atami quiz as played: only complete questions, a round no bigger
   than the bank, and a pass mark no bigger than the round. */
export function atamiRules(c) {
  const questions = (c?.questions ?? []).filter((x) => String(x?.q ?? '').trim()
    && (x.options ?? []).filter((o) => String(o ?? '').trim()).length >= 2
    && String(x.options?.[x.a] ?? '').trim());
  const perRound = Math.min(questions.length, Math.max(1, Number(c?.perRound) || 15));
  return {
    questions,
    perRound,
    passMark: Math.min(perRound, Math.max(0, Number(c?.passMark) || 0)),
    pts: Math.max(0, Number(c?.pointsPerRight) || 0),
    secs: Math.max(0, Number(c?.secondsPerQuestion) || 0),
  };
}

/* The shape TreasureHunt was written against, derived from the config. */
export function toRuntime(config) {
  const cp = config.checkpoints;
  return {
    raceMinutes: Number(config.raceMinutes) || 90,
    stamps: 7,
    points: config.points,
    finishPoint: config.finishPoint,
    helpNote: config.helpNote,
    rules: config.rules,
    teams: huntGroups.map((g) => ({
      id: g.id,
      name: g.name,
      colour: g.colour,
      rival: g.rival,
      pose: { photo: null, place: null, placeHint: '', ...config.teams[g.id]?.pose },
      spot: config.teams[g.id]?.spot ?? { hint: '', photo: null },
      bingo: bingoTiles(config.teams[g.id]?.bingo).slice(0, BINGO_MAX),
    })),
    buy: { brief: cp.cp3.brief },
    quiz: { questions: cp.cp4.questions },
    bingo: { tilePts: Number(cp.bingo.tilePts) || 0, fullPts: Number(cp.bingo.fullPts) || 0 },
    map: config.map,
    trivia: { pts: Math.max(0, Number(cp.guess.pointsPerRight) || 0) },
    atami: atamiRules(cp.cp2b),
    cp,
  };
}

/* Problems that would break the game, in words an admin can act on. */
export function validate(config) {
  const errs = [];
  const cp = config.checkpoints;
  const posInt = (v) => Number.isFinite(Number(v)) && Number(v) >= 0;
  if (!(Number(config.raceMinutes) > 0)) errs.push('General: race length must be more than 0 minutes.');
  {
    const qs = cp.cp2b.questions ?? [];
    const bad = qs.findIndex((x) => !String(x?.q ?? '').trim()
      || (x.options ?? []).filter((o) => String(o ?? '').trim()).length < 2
      || !String(x.options?.[x.a] ?? '').trim());
    if (bad >= 0) errs.push(`Stamp 3: Atami question ${bad + 1} needs its text, at least two options and a right answer.`);
    if (!(Number(cp.cp2b.perRound) >= 1)) errs.push('Stamp 3: questions per round must be at least 1.');
    if (Number(cp.cp2b.perRound) > qs.length) errs.push(`Stamp 3: ${cp.cp2b.perRound} questions per round, but there are only ${qs.length} questions.`);
    if (!posInt(cp.cp2b.passMark) || Number(cp.cp2b.passMark) > Number(cp.cp2b.perRound)) errs.push('Stamp 3: the pass mark must be between 0 and the questions per round.');
    if (!posInt(cp.cp2b.pointsPerRight)) errs.push('Stamp 3: points per right answer must be 0 or more.');
    if (!posInt(cp.cp2b.secondsPerQuestion)) errs.push('Stamp 3: seconds per question must be 0 (no limit) or more.');
  }
  if (!cp.cp4.questions.length || cp.cp4.questions.some((q) => !q.q.trim())) errs.push('Stamp 5: every question needs text, and there must be at least one.');
  /* No minimum: photos go in when the committee has them, and a team
     with none yet sees "coming soon" instead of a card. */
  huntGroups.forEach((g) => {
    if (bingoTiles(config.teams[g.id]?.bingo).length > BINGO_MAX) errs.push(`Stamp 1: ${g.name} has more than ${BINGO_MAX} bingo photos.`);
  });
  if (!posInt(cp.bingo.tilePts) || !posInt(cp.bingo.fullPts)) errs.push('Stamp 1: bingo points must be 0 or more.');
  /* Answers go in as the form comes back, so blanks are fine: a blank
     fact simply isn't asked. */
  if (!posInt(cp.guess.pointsPerRight)) errs.push('Stamp 6: points per right answer must be 0 or more.');
  const coord = (p) => Math.abs(Number(p?.lat)) <= 90 && Math.abs(Number(p?.lng)) <= 180
    && String(p?.lat ?? '').trim() !== '' && String(p?.lng ?? '').trim() !== '';
  if (!coord(config.map.start)) errs.push('Area map: the start needs a latitude and longitude.');
  (config.map.areas ?? []).forEach((a, i) => {
    if (!Array.isArray(a.polygon) || a.polygon.length < 3) {
      errs.push(`Area map: area ${i + 1} needs an outline of at least three points.`);
    }
  });
  return errs;
}

/* ── Load / save ───────────────────────────────────── */

export function cachedHuntConfig() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? withDefaults(JSON.parse(raw)) : null;
  } catch (e) {
    return null;
  }
}

/* Returns { config, updatedAt }. Falls back to the phone's last copy,
   then to the defaults, so the hunt still opens with no signal. */
/* Whether the committee has opened the hunt, as last seen on this
   phone. Atami is where the signal goes, and a team standing at the
   start line should not be told the game is shut because their phone
   could not ask. Only a phone that has never seen the answer assumes
   it is closed. */
const OPEN_KEY = 'olc-hunt-open';

export function cachedHuntOpen() {
  try { return localStorage.getItem(OPEN_KEY) === 'true'; } catch (e) { return false; }
}

export async function fetchHuntConfig() {
  if (!supabase) {
    return { config: cachedHuntConfig() ?? withDefaults(null), updatedAt: null, isOpen: cachedHuntOpen() };
  }
  const { data, error } = await supabase
    .from('hunt_config')
    .select('config, updated_at, is_open')
    .eq('id', HUNT_ID)
    .maybeSingle();
  if (error) {
    return { config: cachedHuntConfig() ?? withDefaults(null), updatedAt: null, isOpen: cachedHuntOpen(), error };
  }
  const config = withDefaults(data?.config);
  const isOpen = data?.is_open === true;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data?.config ?? {}));
    localStorage.setItem(OPEN_KEY, String(isOpen));
  } catch (e) { /* silent */ }
  return { config, updatedAt: data?.updated_at ?? null, isOpen };
}

/** Open or close the hunt. Admin only — RLS refuses everyone else. */
export async function setHuntOpen(isOpen) {
  /* Upsert, because the row only exists once someone has saved content
     and the switch may well be flipped before that ever happens. */
  const { data, error } = await supabase
    .from('hunt_config')
    .upsert({ id: HUNT_ID, is_open: isOpen })
    .select('is_open')
    .single();
  if (error) throw error;
  try { localStorage.setItem(OPEN_KEY, String(data.is_open === true)); } catch (e) { /* silent */ }
  return data.is_open === true;
}

/* When the committee last restarted the race clock, as epoch ms (0 if
   never). Kept out of fetchHuntConfig so a missing column (migration
   not run yet) only costs this feature. */
export async function fetchClockReset() {
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from('hunt_config')
    .select('clock_reset_at')
    .eq('id', HUNT_ID)
    .maybeSingle();
  if (error || !data?.clock_reset_at) return 0;
  return new Date(data.clock_reset_at).getTime();
}

/** Give every team a fresh race clock. Admin only — RLS refuses everyone else. */
export async function restartClock() {
  const { data, error } = await supabase
    .from('hunt_config')
    .upsert({ id: HUNT_ID, clock_reset_at: new Date().toISOString() })
    .select('clock_reset_at')
    .single();
  if (error) throw error;
  /* A restart is a new game: it lifts a stop too. Best effort, as the
     stop columns arrive with 20261018000000_hunt_stop.sql. */
  await supabase.from('hunt_config').update({ stopped_at: null }).eq('id', HUNT_ID);
  return new Date(data.clock_reset_at).getTime();
}

/* ── Stopping the game for everyone ──────────────────
   Admin → Organiser → Stop the game. The moment is kept in
   hunt_config.stopped_at; a "game over" announcement carries the
   committee's message to every phone (src/components/Announcements.jsx),
   which also fires HUNT_STOPPED_EVENT so an open hunt closes at once
   instead of at its next check. */
export const DEFAULT_STOP_MESSAGE =
  'The game is over! Stop playing now and make your way back to the starting point.';

export const HUNT_STOPPED_EVENT = 'hunt:stopped';

/** { stoppedAt: epoch ms (0 while the game runs), message } */
export async function fetchStop() {
  if (!supabase) return { stoppedAt: 0, message: '' };
  const { data, error } = await supabase
    .from('hunt_config')
    .select('stopped_at, stop_message')
    .eq('id', HUNT_ID)
    .maybeSingle();
  if (error) return { stoppedAt: 0, message: '' };
  return {
    stoppedAt: data?.stopped_at ? new Date(data.stopped_at).getTime() : 0,
    message: data?.stop_message ?? '',
  };
}

/** Stop the hunt for every group, now, and tell everyone. Admin only. */
export async function stopGame(message) {
  const text = String(message ?? '').trim() || DEFAULT_STOP_MESSAGE;
  const { data, error } = await supabase
    .from('hunt_config')
    .upsert({ id: HUNT_ID, stopped_at: new Date().toISOString(), stop_message: text })
    .select('stopped_at')
    .single();
  if (error) throw error;
  const { error: annErr } = await supabase.from('announcements').insert({ body: text, level: 'gameover' });
  return { stoppedAt: new Date(data.stopped_at).getTime(), announced: !annErr };
}

/** Undo a stop. Runs already closed stay closed until their team plays on. */
export async function resumeGame() {
  const { error } = await supabase.from('hunt_config').upsert({ id: HUNT_ID, stopped_at: null });
  if (error) throw error;
}

export async function saveHuntConfig(config) {
  const { data, error } = await supabase
    .from('hunt_config')
    .upsert({ id: HUNT_ID, config })
    .select('updated_at')
    .single();
  if (error) throw error;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(config)); } catch (e) { /* silent */ }
  return data.updated_at;
}

/* Reference shots only need to be legible on a phone screen, so they
   are shrunk before they cost anyone's roaming data (src/lib/photos.js). */
export async function uploadHuntPhoto(file) {
  const { blob } = await compressPhoto(file, PHOTO_PRESETS.reference);
  const path = `${HUNT_ID}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
