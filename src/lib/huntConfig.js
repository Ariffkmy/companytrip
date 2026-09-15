/* ═══════════════════════════════════════════════════
   Atami treasure hunt — editable content
   ═══════════════════════════════════════════════════

   Everything an admin can change lives in one JSON document
   (public.hunt_config, id 'atami'). The flow itself — eight stamps in a
   fixed order, and the scoring rules — stays in TreasureHunt.jsx.

   DEFAULT_HUNT_CONFIG is the game as originally written. A stored
   document is merged over it, so a field added here later still has a
   value on a trip whose config was saved before the field existed.

   Text fields: blank line = new paragraph, **double stars** = bold.
   Unlock texts may use {budget}, {finish}, {quizCount}, {guessCount}.
*/

import { supabase } from './supabase';
import groupRoster from '../data/groupRoster';

export const HUNT_ID = 'atami';
export const MEDIA_BUCKET = 'hunt-media';
const CACHE_KEY = 'olc-hunt-config';

/* Team colours are part of the stamp-rally look, not content. */
const TEAM_COLOURS = {
  'team-ruby': 'var(--red)',
  'team-sapphire': 'var(--sea)',
  'team-emerald': '#E9A82C',
  'team-diamond': '#5B7F3E',
  'team-pearl': '#8A4B9E',
};

export const DEFAULT_HUNT_CONFIG = {
  raceMinutes: 90,
  points: { checkpoint: 10, quizPerAnswer: 2 },
  finishPoint: 'The committee will point you to the finish at the briefing.',
  helpNote: 'Stuck? The committee is in the WhatsApp group.',

  teams: {
    'team-ruby': {
      pose: { photo: null },
      spot: { hint: 'Recce photo goes here.', photo: null },
    },
    'team-sapphire': {
      pose: { photo: null },
      spot: { hint: 'Recce photo goes here.', photo: null },
    },
    'team-emerald': {
      pose: { photo: null },
      spot: { hint: 'Recce photo goes here.', photo: null },
    },
    'team-diamond': {
      pose: { photo: null },
      spot: { hint: 'Recce photo goes here.', photo: null },
    },
    'team-pearl': {
      pose: { photo: null },
      spot: { hint: 'Recce photo goes here.', photo: null },
    },
  },

  checkpoints: {
    cp1: {
      title: 'Copy the pose', kana: 'ポーズを真似ろ', photo: null,
      body: 'Everyone in the frame. Ask a stranger to hold the phone if you have to.',
    },
    cp2a: {
      title: 'Find the place', kana: '現地で自撮り', photo: null,
      body: 'Work out where this is, go there, and take a team selfie on the spot. The riddle unlocks when the selfie lands.',
    },
    cp2b: {
      title: 'Three switches', kana: 'スイッチの謎', photo: null,
      body: 'You\'re outside a room with the door shut. On the wall next to you are **three switches**. Inside the room are **three light bulbs**, one per switch.\n\nYou may flip the switches as much as you like. You may open the door and go in **once** — and once you\'re in, you can\'t touch the switches again. How do you tell which switch controls which bulb?',
    },
    cp3: {
      title: 'Buy it, try it', kana: '買って食べる', photo: null,
      budgetYen: 500,
      brief: 'Something Japanese that nobody on your team has tried before.',
      body: 'Every member has to taste it. Photo has to show all of you eating or drinking, mid-bite.',
    },
    cp4: {
      title: 'Look around you', kana: '周りを見ろ', photo: null,
      body: 'Stop where the committee sent you. Every answer is somewhere in sight. Phones down — this one isn\'t on the internet.',
      questions: [
        { q: 'Something that is red. Name the object.', accept: [] },
        { q: 'Read out a shop or cafe sign you can see from here.', accept: [] },
        { q: 'How many people can you count from where you are standing?', accept: [] },
        { q: 'Something white and floating.', accept: ['cloud', 'clouds', 'seagull', 'seagulls'] },
        { q: 'The furthest thing you can see. Name it.', accept: [] },
      ],
    },
    ask: {
      title: 'Ask a stranger', kana: '声かけ', photo: null,
      body: 'Find someone who is not on this trip and talk to them. Three things you can come back with — do one, do all three.\n\nAsk before you photograph anyone. If they say no, thank them and find someone else.',
      tasks: [
        { key: 'word', pts: 2, label: 'A word they taught you', hint: 'Romaji is fine. Write what it means too.' },
        { key: 'rec', pts: 3, label: 'Something they recommended', hint: 'Food, a spot, anything at all.' },
        { key: 'photo', pts: 5, label: 'A photo with them and the whole team', hint: 'Ask first. If they say no, that is a no.' },
      ],
    },
    bingo: {
      title: 'Photo bingo', kana: 'ビンゴ', photo: null,
      linePts: 3,
      fullPts: 5,
      tiles: [
        'Something older than everyone here',
        'A vending machine nobody has seen the like of',
        'An animal',
        'A sign you cannot read',
        'Someone in uniform',
        'Something perfectly round',
        'A door you want to open',
        'The colour orange',
        'A view worth stopping for',
      ],
    },
    guess: {
      title: 'Closest guess', kana: '目分量', photo: null,
      exactPts: 5, nearPts: 3, closePts: 1,
      questions: [
        'How many steps are in the staircase at this checkpoint?',
        'The committee is holding one item. What does it cost, in yen?',
        'How many vending machines did you pass since the last stamp?',
      ],
    },
    cheer: {
      title: 'The team cheer', kana: 'チームコール', photo: null,
      seconds: 15, maxSeconds: 30,
      body: 'Your team cheer — chant, dance, war cry, whatever you invented on the way here.\n\nEveryone on camera. Say "Atami" once. Loud enough to embarrass yourselves.',
    },
  },

  /* The "Stamp collected" screen shown before each checkpoint opens. */
  unlocks: {
    cp2: { h: 'Find the spot', p: 'Somewhere along the way is the thing in the next photo — find it, selfie with it, and the riddle opens. Your photo is different from every other team\'s, so following another team won\'t help.' },
    cp3: { h: 'Buy it, try it', p: 'Find the shops. ¥{budget} for the team, one thing none of you have tried, everyone tastes it.' },
    cp4: { h: 'Look around you', p: '{quizCount} questions, every answer within sight of where you\'re standing. Nothing to google.' },
    ask: { h: 'Talk to a stranger', p: 'Next one is not a place, it is a person. Find someone who is not on this trip and come away with something — a word, a recommendation, a photo. Start counting vending machines from here; you will be asked.' },
    bingo: { h: 'Bingo card — lock it in', p: 'Last call on the nine photo prompts. Anything still blank when you lock the card stays blank, so fill what you can on the way.' },
    guess: { h: 'Three numbers', p: 'No looking anything up, no counting twice. Closest guess takes the points — and being roughly right still pays.' },
    cheer: { h: 'Last one', p: 'Film your team cheer, then walk it in. {finish}' },
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

export function withDefaults(stored) {
  return deepMerge(structuredClone(DEFAULT_HUNT_CONFIG), stored || {});
}

/* Fill {tokens} in unlock text from the rest of the config. */
export function fillTokens(text, config) {
  const values = {
    budget: config.checkpoints.cp3.budgetYen,
    finish: config.finishPoint,
    quizCount: config.checkpoints.cp4.questions.length,
    guessCount: config.checkpoints.guess.questions.length,
  };
  return String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

/* The shape TreasureHunt was written against, derived from the config. */
export function toRuntime(config) {
  const cp = config.checkpoints;
  return {
    raceMinutes: Number(config.raceMinutes) || 90,
    stamps: 8,
    points: config.points,
    finishPoint: config.finishPoint,
    helpNote: config.helpNote,
    teams: groupRoster.map((g) => ({
      id: g.id,
      name: g.name,
      colour: TEAM_COLOURS[g.id] ?? 'var(--ink)',
      pose: config.teams[g.id]?.pose ?? { photo: null },
      spot: config.teams[g.id]?.spot ?? { hint: '', photo: null },
    })),
    buy: { budgetYen: cp.cp3.budgetYen, brief: cp.cp3.brief },
    quiz: { questions: cp.cp4.questions },
    ask: { tasks: cp.ask.tasks },
    bingo: { linePts: cp.bingo.linePts, fullPts: cp.bingo.fullPts, tiles: cp.bingo.tiles },
    guess: { exactPts: cp.guess.exactPts, nearPts: cp.guess.nearPts, closePts: cp.guess.closePts, questions: cp.guess.questions },
    video: { seconds: cp.cheer.seconds, maxSeconds: cp.cheer.maxSeconds },
    cp,
    unlocks: Object.fromEntries(
      Object.entries(config.unlocks).map(([k, u]) => [k, { h: u.h, p: fillTokens(u.p, config) }])
    ),
  };
}

/* Problems that would break the game, in words an admin can act on. */
export function validate(config) {
  const errs = [];
  const cp = config.checkpoints;
  const posInt = (v) => Number.isFinite(Number(v)) && Number(v) >= 0;
  if (!(Number(config.raceMinutes) > 0)) errs.push('General: race length must be more than 0 minutes.');
  if (!cp.cp4.questions.length || cp.cp4.questions.some((q) => !q.q.trim())) errs.push('Checkpoint 4: every question needs text, and there must be at least one.');
  if (cp.bingo.tiles.length !== 9 || cp.bingo.tiles.some((t) => !t.trim())) errs.push('Checkpoint 6: all nine bingo tiles need a prompt.');
  if (!cp.guess.questions.length || cp.guess.questions.some((q) => !q.trim())) errs.push('Checkpoint 7: every question needs text, and there must be at least one.');
  if (!(Number(cp.cheer.maxSeconds) >= Number(cp.cheer.seconds))) errs.push('Checkpoint 8: the maximum video length must be at least the target length.');
  if (cp.ask.tasks.some((t) => !t.label.trim() || !posInt(t.pts))) errs.push('Checkpoint 5: each task needs a label and a points value.');
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
export async function fetchHuntConfig() {
  if (!supabase) return { config: cachedHuntConfig() ?? withDefaults(null), updatedAt: null };
  const { data, error } = await supabase
    .from('hunt_config')
    .select('config, updated_at')
    .eq('id', HUNT_ID)
    .maybeSingle();
  if (error) {
    return { config: cachedHuntConfig() ?? withDefaults(null), updatedAt: null, error };
  }
  const config = withDefaults(data?.config);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data?.config ?? {})); } catch (e) { /* silent */ }
  return { config, updatedAt: data?.updated_at ?? null };
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

/* Phone photos are 3–10 MB. Reference shots only need to be legible on
   a phone screen, so downscale before they cost anyone's roaming data. */
function toJpeg(file, max = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

export async function uploadHuntPhoto(file) {
  const blob = await toJpeg(file);
  const path = `${HUNT_ID}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
