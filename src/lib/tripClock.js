/* ═══════════════════════════════════════════════════
   Everything the Home screen needs to answer one question:
   "where are we, and what happens next?"

   All of it is derived from src/data/schedule.js — no second
   source of truth, so editing the itinerary updates the landing
   page for free. Nothing here is fetched; the app works offline.
   ═══════════════════════════════════════════════════ */

import schedule from '../data/schedule';

/* Local midnight for a 'YYYY-MM-DD' string. Deliberately NOT
   new Date(iso) — that parses as UTC and lands on the wrong day
   for anyone west of Greenwich. */
function localDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/* D1 is the real start — D0 is a packing checklist, not a trip day. */
const TRIP_DAYS = schedule.filter((d) => d.day !== 'D0');
const FIRST = TRIP_DAYS[0];
const LAST = TRIP_DAYS[TRIP_DAYS.length - 1];

export const TRIP_LENGTH = TRIP_DAYS.length;

/* '08:30' → 510. Anything without a clock time ('All day', 'Evening',
   '🎯') returns null and sorts to the front of the day. */
export function parseTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  /* Past-midnight entries (00:30, 01:00) belong to the END of their
     listed day, not the start — D1 lands at the hotel at 01:00. */
  return (h < 4 ? h + 24 : h) * 60 + min;
}

/* Phase drives the whole hero. Three states, and the copy for each
   is genuinely different — a countdown is not the same object as
   "you are on day 3". */
export function getTripState(now = new Date()) {
  const today = startOfDay(now);
  const start = localDate(FIRST.date);
  const end = localDate(LAST.date);

  const DAY = 86400000;
  const daysToStart = Math.round((start - today) / DAY);

  if (daysToStart > 0) {
    return { phase: 'before', daysToStart, dayIndex: -1, day: null };
  }
  if (today > end) {
    return { phase: 'after', daysToStart: 0, dayIndex: -1, day: null };
  }

  const dayIndex = Math.round((today - start) / DAY);
  return {
    phase: 'during',
    daysToStart: 0,
    dayIndex,
    day: TRIP_DAYS[dayIndex] ?? null,
    dayNumber: dayIndex + 1,
  };
}

/* The "up next" card. During the trip this is the next activity whose
   clock time has not passed; before the trip it is the first thing that
   happens on D1, so the card is never empty. */
export function getNextUp(now = new Date()) {
  const state = getTripState(now);

  if (state.phase === 'after') return null;

  if (state.phase === 'before') {
    return {
      label: 'First up',
      day: FIRST,
      dayIndexInSchedule: schedule.indexOf(FIRST),
      activity: FIRST.activities[0],
      isLive: false,
    };
  }

  const day = state.day;
  if (!day) return null;

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const timed = day.activities
    .map((a, i) => ({ a, i, t: parseTime(a.time) }))
    .filter((x) => x.t !== null);

  const upcoming = timed.find((x) => x.t >= minutesNow);
  const current = [...timed].reverse().find((x) => x.t <= minutesNow);

  const pick = upcoming ?? current ?? { a: day.activities[0], i: 0 };

  return {
    label: upcoming ? 'Up next' : 'Happening now',
    day,
    dayIndexInSchedule: schedule.indexOf(day),
    activity: pick.a,
    isLive: !upcoming,
  };
}

/* Trip facts for the hero strip. Every figure is either counted from
   the schedule or taken from the proposal deck — none are invented. */
export const TRIP_FACTS = [
  { value: String(TRIP_LENGTH), label: 'days' },
  { value: '26+1', label: 'pax' },
  { value: '4', label: 'cities' },
  { value: '5', label: 'teams' },
];

export const TRIP_ROUTE = 'Yokohama · Kamakura · Enoshima · Atami';
export const TRIP_DATES = '22 – 27 October 2026';

export { TRIP_DAYS, FIRST, LAST };
