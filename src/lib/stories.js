/* ═══════════════════════════════════════════════════
   Stories — short-lived photos and videos, apart from the album
   ═══════════════════════════════════════════════════

   Rows live in public.stories; files in the private `stories` bucket.
   Same shape and the same upload path as the album (src/lib/album.js),
   but nothing here ever shows in the album, and a story is only listed
   for STORY_HOURS after it is posted. */

import { supabase } from './supabase';
import { MEDIA_COLUMNS, deleteMedia, uploadMedia, withUrls } from './album';

const STORIES = { bucket: 'stories', table: 'stories' };
export const STORY_HOURS = 24;
export const STORY_MAX_SECONDS = 60;

/** Live stories, oldest first (the order they play in). */
export async function listStories() {
  const since = new Date(Date.now() - STORY_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from(STORIES.table)
    .select(MEDIA_COLUMNS)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return withUrls(STORIES.bucket, data);
}

export const uploadStory = (file, userId, onProgress) =>
  uploadMedia(STORIES, file, userId, { onProgress, maxSeconds: STORY_MAX_SECONDS });

export const deleteStory = (story) => deleteMedia(STORIES, story);

/** One entry per person, their stories oldest first. Yours leads; then
    people with something you haven't seen; then most recent first. */
export function groupByPerson(stories, userId, seen) {
  const people = new Map();
  for (const s of stories) {
    if (!people.has(s.uploader_id)) people.set(s.uploader_id, { id: s.uploader_id, name: s.uploader_name, items: [] });
    people.get(s.uploader_id).items.push(s);
  }
  const rank = (p) => (p.id === userId ? 0 : p.items.some((s) => !seen.has(s.id)) ? 1 : 2);
  const latest = (p) => p.items[p.items.length - 1].created_at;
  return [...people.values()].sort((a, b) => rank(a) - rank(b) || latest(b).localeCompare(latest(a)));
}

/* Which stories this phone has watched, for the rings and for where a
   person's stories pick up. Per device: a nudge, not a record. Ids of
   stories older than a day drop out the next time the list loads. */
const SEEN_KEY = 'olc-story-seen';

export function seenStoryIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

export function rememberSeenStories(ids) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...ids])); } catch { /* quota — skip */ }
}
