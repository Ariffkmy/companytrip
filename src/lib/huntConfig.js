/* ═══════════════════════════════════════════════════
   Atami treasure hunt — editable content
   ═══════════════════════════════════════════════════

   Everything an admin can change lives in one JSON document
   (public.hunt_config, id 'atami'). The flow itself — eight stamps in a
   fixed order (photo bingo first), and the scoring rules — stays in TreasureHunt.jsx.

   DEFAULT_HUNT_CONFIG is the game as originally written. A stored
   document is merged over it, so a field added here later still has a
   value on a trip whose config was saved before the field existed.

   Text fields: blank line = new paragraph, **double stars** = bold.
   Unlock texts may use {budget}, {finish}, {quizCount}, {streak}.
*/

import { supabase } from './supabase';
import groupRoster from '../data/groupRoster';
import TRIVIA_BANK from '../data/triviaBank';
import { CHECKPOINTS, HUNT_MAP_LINK, ROUTE, ROUTE_STATS, START } from '../data/huntRoute';

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

/* Nine prompts for one team's bingo card. Who snaps each tile is drawn
   at random by the server, not set here. */
const bingoCard = (prompts) => prompts.map((prompt) => ({ prompt }));

export const DEFAULT_HUNT_CONFIG = {
  raceMinutes: 90,
  points: { checkpoint: 10, quizPerAnswer: 2 },
  finishPoint: 'The committee will point you to the finish at the briefing.',
  helpNote: 'Stuck? The committee is in the WhatsApp group.',

  teams: {
    'team-ruby': {
      pose: { photo: null },
      spot: { hint: 'Recce photo goes here.', photo: null },
      bingo: bingoCard([
        'Something older than everyone here',
        'A vending machine nobody has seen the like of',
        'A cat (real or on a sign)',
        'A sign you cannot read',
        'A traffic cone',
        'Something perfectly round',
        'A door you want to open',
        'The colour orange',
        'A convenience store',
      ]),
    },
    'team-sapphire': {
      pose: { photo: null },
      spot: { hint: 'Recce photo goes here.', photo: null },
      bingo: bingoCard([
        'Steam rising from anything',
        'A taxi',
        'A street light',
        'A shop mascot or character',
        'Something shaped like a fish',
        'A bicycle with a basket',
        'A tiny shrine or statue',
        'An umbrella',
        'Your shadow doing something silly',
      ]),
    },
    'team-emerald': {
      pose: { photo: null },
      spot: { hint: 'Recce photo goes here.', photo: null },
      bingo: bingoCard([
        'A lantern',
        'A plastic food display',
        'A crosswalk with nobody breaking the rules',
        'A parked car',
        'A sign with an arrow',
        'Something made of bamboo',
        'A bird',
        'A bus stop',
        'A traffic light',
      ]),
    },
    'team-diamond': {
      pose: { photo: null },
      spot: { hint: 'Recce photo goes here.', photo: null },
      bingo: bingoCard([
        'A torii gate',
        'A souvenir shaped like food',
        'A vending machine',
        'Someone waving back at you',
        'A clock showing the wrong time',
        'A noren curtain in a doorway',
        'Something striped',
        'A bicycle',
        'The colour purple',
      ]),
    },
    'team-pearl': {
      pose: { photo: null },
      spot: { hint: 'Recce photo goes here.', photo: null },
      bingo: bingoCard([
        'A hot spring sign (♨)',
        'A drink you have never tried, in a can',
        'A tree',
        'A shop menu',
        'Your selfie with a sad face',
        'Your selfie with a happy face',
        'A reflection in a window',
        'A flower in a pot',
        'The colour yellow',
      ]),
    },
  },

  /* Route map. Checkpoints are numbered by their order here, so a trip
     can have as many as it likes. `route` is the walking line; the
     editor can redraw it through the stops, or it falls back to
     straight lines between them. */
  map: {
    link: HUNT_MAP_LINK,
    km: ROUTE_STATS.km,
    walkMin: ROUTE_STATS.walkMin,
    start: { lat: START.lat, lng: START.lng, label: START.label },
    checkpoints: CHECKPOINTS.map((c) => ({ lat: c.lat, lng: c.lng, note: '' })),
    route: ROUTE,
  },

  checkpoints: {
    cp1: {
      title: 'Copy the pose', kana: 'ポーズを真似ろ', photo: null, stop: 'Checkpoint 2',
      body: 'Everyone in the frame. Ask a stranger to hold the phone if you have to.',
    },
    cp2a: {
      title: 'Find the place', kana: '現地で自撮り', photo: null, stop: 'Checkpoint 3',
      body: 'Work out where this is, go there, and take a team selfie on the spot. The riddle unlocks when the selfie lands.',
    },
    cp2b: {
      title: 'Three switches', kana: 'スイッチの謎', photo: null, stop: 'Checkpoint 3',
      /* Optional intro above the riddles; every riddle must be answered. */
      body: '',
      riddles: [
        'You\'re outside a room with the door shut. On the wall next to you are **three switches**. Inside the room are **three light bulbs**, one per switch.\n\nYou may flip the switches as much as you like. You may open the door and go in **once** — and once you\'re in, you can\'t touch the switches again. How do you tell which switch controls which bulb?',
      ],
    },
    cp3: {
      title: 'Buy it, try it', kana: '買って食べる', photo: null, stop: 'Checkpoint 3',
      budgetYen: 500,
      brief: 'Something Japanese that nobody on your team has tried before.',
      body: 'Every member has to taste it. Photo has to show all of you eating or drinking, mid-bite.',
    },
    cp4: {
      title: 'Look around you', kana: '周りを見ろ', photo: null, stop: 'Walk from Checkpoint 3 to 4',
      body: 'This one is played **on the walk from Checkpoint 3 to Checkpoint 4**. Every answer is somewhere along that stretch — shop signs, things in windows, what is on the street and above it.\n\nKeep your eyes up and notice everything as you go: once you reach Checkpoint 4 you can\'t walk back to check. Split the questions between you before you set off. Phones down — none of this is on the internet.',
      questions: [
        { q: 'Something that is red. Name the object.', accept: [] },
        { q: 'Name a shop or cafe sign you passed on the way.', accept: [] },
        { q: 'How many pedestrian crossings did you cross between Checkpoint 3 and 4?', accept: [] },
        { q: 'Something white and floating.', accept: ['cloud', 'clouds', 'seagull', 'seagulls'] },
        { q: 'The last shop you passed before reaching Checkpoint 4. Name it.', accept: [] },
      ],
    },
    ask: {
      title: 'Ask a stranger', kana: '声かけ', photo: null, stop: 'Checkpoint 4',
      body: 'Find someone who is not on this trip and talk to them. Three things you can come back with — do one, do all three.\n\nAsk before you photograph anyone. If they say no, thank them and find someone else.',
      tasks: [
        { key: 'word', pts: 2, label: 'A word they taught you', hint: 'Romaji is fine. Write what it means too.' },
        { key: 'rec', pts: 3, label: 'Something they recommended', hint: 'Food, a spot, anything at all.' },
        { key: 'photo', pts: 5, label: 'A photo with them and the whole team', hint: 'Ask first. If they say no, that is a no.' },
      ],
    },
    bingo: {
      title: 'Photo bingo', kana: 'ビンゴ', photo: null, stop: 'Checkpoint 1',
      linePts: 3,
      fullPts: 5,
    },
    /* Stamp 7. Keyed `guess` because it replaced the closest-guess game;
       the key is what saved team progress is filed under. */
    guess: {
      title: 'Test your general knowledge', kana: '一般常識', photo: null, stop: '',
      body: 'No phones, no googling — talk it through and answer as a team.',
      streak: 10,
      bank: TRIVIA_BANK,
    },
    cheer: {
      title: 'The team cheer', kana: 'チームコール', photo: null, stop: '',
      seconds: 15, maxSeconds: 30,
      body: 'Your team cheer — chant, dance, war cry, whatever you invented on the way here.\n\nEveryone on camera. Say "Atami" once. Loud enough to embarrass yourselves.',
    },
  },

  /* The "Stamp collected" screen shown before each checkpoint opens.
     stop on each checkpoint above is its place on the route map. */
  unlocks: {
    cp1: { h: 'Copy the pose', p: 'Bingo card is in. Now the stamp rally: your first stamp is a team photo copying the pose in the next picture — everyone in the frame.' },
    cp2: { h: 'Find the spot', p: 'Somewhere along the way is the thing in the next photo — find it, selfie with it, and the riddle opens. Your photo is different from every other team\'s, so following another team won\'t help.' },
    cp3: { h: 'Buy it, try it', p: 'Find the shops. ¥{budget} for the team, one thing none of you have tried, everyone tastes it.' },
    cp4: { h: 'Look around you', p: 'Read the {quizCount} questions before you leave Checkpoint 3 — every answer is somewhere on the walk to Checkpoint 4. Watch your surroundings the whole way. Nothing to google.' },
    ask: { h: 'Talk to a stranger', p: 'Next one is not a place, it is a person. Find someone who is not on this trip and come away with something — a word, a recommendation, a photo.' },
    guess: { h: 'Brain check', p: 'Multiple choice, one question at a time. Get {streak} right in a row to collect the stamp — one wrong answer and your streak goes back to zero.' },
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
  const merged = deepMerge(structuredClone(DEFAULT_HUNT_CONFIG), stored || {});
  /* Saved before riddles became a list: its one riddle lived in `body`. */
  const oldRiddle = stored?.checkpoints?.cp2b;
  if (oldRiddle && !Array.isArray(oldRiddle.riddles) && String(oldRiddle.body ?? '').trim()) {
    merged.checkpoints.cp2b.riddles = [oldRiddle.body];
    merged.checkpoints.cp2b.body = '';
  }
  /* Saved while stamp 7 was still the closest-guess game: its title,
     text and unlock screen describe a game that no longer exists. */
  const oldGuess = stored?.checkpoints?.guess;
  if (oldGuess && !Array.isArray(oldGuess.bank)) {
    merged.checkpoints.guess = {
      ...structuredClone(DEFAULT_HUNT_CONFIG.checkpoints.guess),
      stop: oldGuess.stop ?? '', photo: oldGuess.photo ?? null,
    };
    merged.unlocks.guess = structuredClone(DEFAULT_HUNT_CONFIG.unlocks.guess);
  }
  return merged;
}

/* Fill {tokens} in unlock text from the rest of the config. */
export function fillTokens(text, config) {
  const values = {
    budget: config.checkpoints.cp3.budgetYen,
    finish: config.finishPoint,
    quizCount: config.checkpoints.cp4.questions.length,
    streak: config.checkpoints.guess.streak,
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
      bingo: config.teams[g.id]?.bingo ?? [],
    })),
    buy: { budgetYen: cp.cp3.budgetYen, brief: cp.cp3.brief },
    quiz: { questions: cp.cp4.questions },
    ask: { tasks: cp.ask.tasks },
    bingo: { linePts: cp.bingo.linePts, fullPts: cp.bingo.fullPts, size: 9 },
    map: config.map,
    trivia: { streak: Math.max(1, Number(cp.guess.streak) || 10), bank: cp.guess.bank },
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
  if (!cp.cp2b.riddles.length || cp.cp2b.riddles.some((r) => !String(r ?? '').trim())) errs.push('Stamp 3: every riddle needs text, and there must be at least one.');
  if (!cp.cp4.questions.length || cp.cp4.questions.some((q) => !q.q.trim())) errs.push('Stamp 5: every question needs text, and there must be at least one.');
  groupRoster.forEach((g) => {
    const card = config.teams[g.id]?.bingo ?? [];
    if (card.length !== 9 || card.some((t) => !String(t?.prompt ?? '').trim())) errs.push(`Stamp 1: all nine of ${g.name}’s bingo tiles need a prompt.`);
  });
  const bank = cp.guess.bank ?? [];
  if (!(Number(cp.guess.streak) >= 1)) errs.push('Stamp 7: the streak needed must be at least 1.');
  if (bank.length < 4) errs.push('Stamp 7: add at least 4 general knowledge questions.');
  bank.forEach((t, i) => {
    const opts = [t.a, ...(t.decoys ?? [])].map((o) => String(o ?? '').trim().toLowerCase());
    if (!String(t.q ?? '').trim() || opts.length !== 4 || opts.some((o) => !o)) errs.push(`Stamp 7: question ${i + 1} needs its text, the right answer and three wrong answers.`);
    else if (new Set(opts).size !== 4) errs.push(`Stamp 7: question ${i + 1} has a wrong answer that matches another answer.`);
  });
  const coord = (p) => Math.abs(Number(p?.lat)) <= 90 && Math.abs(Number(p?.lng)) <= 180
    && String(p?.lat ?? '').trim() !== '' && String(p?.lng ?? '').trim() !== '';
  if (!coord(config.map.start)) errs.push('Route map: the start needs a latitude and longitude.');
  (config.map.checkpoints ?? []).forEach((c, i) => {
    if (!coord(c)) errs.push(`Route map: checkpoint ${i + 1} needs a latitude between -90 and 90 and a longitude between -180 and 180.`);
  });
  if (!(Number(cp.cheer.maxSeconds) >= Number(cp.cheer.seconds))) errs.push('Stamp 8: the maximum video length must be at least the target length.');
  if (cp.ask.tasks.some((t) => !t.label.trim() || !posInt(t.pts))) errs.push('Stamp 6: each task needs a label and a points value.');
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
