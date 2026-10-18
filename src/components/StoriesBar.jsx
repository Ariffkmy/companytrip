import { useCallback, useEffect, useRef, useState } from 'react';
import { STORY_MAX_SECONDS, deleteStory, groupByPerson, listStories, rememberSeenStories, seenStoryIds, uploadStory } from '../lib/stories';
import { mediaErrorMessage } from '../lib/video';
import StoriesViewer from './StoriesViewer';

/* ── Stories bar ─────────────────────────────────────
   A row of circles, Instagram style: "Your story" first (tap + to post
   a photo or video), then everyone who has posted in the last day. A red
   ring means there is something you haven't watched. Stories are their
   own thing: nothing here comes from, or goes into, the album. */

function Bubble({ thumb, ring, label }) {
  return (
    <span className={`block w-16 h-16 rounded-full p-[2.5px] ${ring}`}>
      <span className="block w-full h-full rounded-full overflow-hidden border-2 border-white bg-gray-100">
        {thumb
          ? <img src={thumb} crossOrigin="anonymous" alt="" className="w-full h-full object-cover" />
          : <span className="grid place-items-center w-full h-full font-display text-2xl text-gray-400">{label}</span>}
      </span>
    </span>
  );
}

function postingLabel(p) {
  if (p.step?.stage === 'shrink') return `Shrinking ${Math.round(p.step.progress * 100)}%`;
  return 'Posting…';
}

export default function StoriesBar({ userId, isAdmin }) {
  const [stories, setStories] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [seen, setSeen] = useState(seenStoryIds);
  const [viewer, setViewer] = useState(null); // { order: [personId], start }
  const [posting, setPosting] = useState(null); // { step }
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await listStories();
      setStories(rows);
      setLoadFailed(false);
      /* Forget watched stories that have expired, so the list stays small. */
      const live = new Set(rows.map((r) => r.id));
      setSeen((s) => {
        const next = new Set([...s].filter((id) => live.has(id)));
        if (next.size !== s.size) rememberSeenStories(next);
        return next;
      });
    } catch {
      setStories((s) => s ?? []);
      setLoadFailed(true);
    }
  }, []);

  /* Load now, and again whenever the app comes back to the front, but
     not mid-story: fresh signed URLs would restart the video playing. */
  const watching = useRef(false);
  watching.current = Boolean(viewer);
  useEffect(() => {
    load();
    const onVis = () => { if (!document.hidden && !watching.current) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  const markSeen = useCallback((id) => {
    setSeen((s) => {
      if (s.has(id)) return s;
      const next = new Set(s).add(id);
      rememberSeenStories(next);
      return next;
    });
  }, []);

  async function onFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    setError('');
    setPosting({});
    let failed = 0;
    let lastErr = null;
    /* One at a time: parallel uploads on a weak signal all time out together. */
    for (const file of files) {
      try {
        const row = await uploadStory(file, userId, (step) => setPosting({ step }));
        setStories((s) => [...(s ?? []), row]);
        markSeen(row.id); // your own story is never "new" to you
      } catch (e) {
        failed++;
        lastErr = e;
      }
      setPosting({});
    }
    setPosting(null);
    if (failed) {
      const what = failed === files.length ? 'Your story' : `${failed} of ${files.length}`;
      setError(`${what} didn’t post. ${mediaErrorMessage(lastErr, { maxSeconds: STORY_MAX_SECONDS })}`);
    }
  }

  const people = groupByPerson(stories ?? [], userId, seen);
  const mine = people.find((p) => p.id === userId);
  const others = people.filter((p) => p.id !== userId);
  const unseenIn = (p) => p.items.some((s) => !seen.has(s.id));

  /* Play from this person's first unwatched story, then on through
     everyone after them in the bar. */
  function watch(personId) {
    const flat = people.flatMap((p) => p.items);
    const person = people.find((p) => p.id === personId);
    const startItem = person.items.find((s) => !seen.has(s.id)) ?? person.items[0];
    setViewer({ order: people.map((p) => p.id), start: flat.indexOf(startItem) });
  }

  /* Re-derived each render, so a deleted story drops out while watching;
     the person order is fixed when the viewer opens. */
  const viewerItems = viewer
    ? viewer.order.flatMap((id) => (stories ?? []).filter((s) => s.uploader_id === id))
    : [];

  async function onDelete(story) {
    try {
      await deleteStory(story);
      setStories((s) => s.filter((x) => x.id !== story.id));
    } catch (e) {
      setError(/not allowed|row-level|permission/i.test(e?.message ?? '') ? 'You can only delete your own stories.' : 'That story didn’t delete. Try again.');
      throw e;
    }
  }

  const fileInput = (
    <input type="file" accept="image/*,video/*" multiple className="sr-only" disabled={Boolean(posting)}
      onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
  );

  return (
    <section aria-labelledby="stories-h" className="mb-7">
      <h2 id="stories-h" className="font-mono text-[13px] font-bold tracking-[.14em] uppercase text-gray-700 mb-2.5">Stories</h2>

      <ul className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {/* Yours: tap the circle to watch (or to post, if you have none); the + always posts. */}
        <li className="relative shrink-0 w-16 text-center">
          {mine ? (
            <>
              <button type="button" onClick={() => watch(userId)} aria-label="Watch your story"
                className="block cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red">
                <Bubble thumb={mine.items[mine.items.length - 1].thumb} ring="bg-gray-200" />
              </button>
              <label aria-label="Add to your story"
                className={`absolute left-11 top-11 w-6 h-6 rounded-full border-2 border-white grid place-items-center text-sm leading-none text-paper focus-within:outline-2 focus-within:outline-red ${posting ? 'bg-gray-400 cursor-wait' : 'bg-red cursor-pointer'}`}>
                +
                {fileInput}
              </label>
            </>
          ) : (
            <label aria-label="Post a story"
              className={`block rounded-full focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-red ${posting ? 'cursor-wait' : 'cursor-pointer'}`}>
              <Bubble ring="bg-red/15" label="+" />
              {fileInput}
            </label>
          )}
          <span role={posting ? 'status' : undefined} className="block mt-1.5 text-[11px] leading-tight truncate text-gray-600">
            {posting ? postingLabel(posting) : 'Your story'}
          </span>
        </li>

        {others.map((p) => (
          <li key={p.id} className="shrink-0 w-16 text-center">
            <button type="button" onClick={() => watch(p.id)}
              aria-label={`${p.name}’s story${unseenIn(p) ? ', new' : ''}`}
              className="block cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red">
              <Bubble thumb={p.items[p.items.length - 1].thumb} ring={unseenIn(p) ? 'bg-red' : 'bg-gray-200'} label={p.name[0]?.toUpperCase()} />
            </button>
            <span className={`block mt-1.5 text-[11px] leading-tight truncate ${unseenIn(p) ? 'text-ink font-medium' : 'text-gray-500'}`}>
              {p.name.split(' ')[0]}
            </span>
          </li>
        ))}

        {stories !== null && others.length === 0 && (
          <li className="self-center text-xs text-gray-500 pl-1 pb-5">
            {loadFailed ? 'Stories need internet to load.' : 'No stories yet. Post the first one.'}
          </li>
        )}
      </ul>

      {error && <p role="alert" className="text-sm text-red mt-2">{error}</p>}

      {viewer && viewerItems.length > 0 && (
        <StoriesViewer
          items={viewerItems}
          startIndex={Math.min(viewer.start, viewerItems.length - 1)}
          onSeen={markSeen}
          onClose={() => setViewer(null)}
          canDelete={(s) => isAdmin || s.uploader_id === userId}
          onDelete={onDelete}
        />
      )}
    </section>
  );
}
