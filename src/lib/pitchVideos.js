/* ═══════════════════════════════════════════════════
   Atami Video Challenge — each group's videos
   ═══════════════════════════════════════════════════

   Any member of a group records a video and uploads it
   (20261028000000_pitch_videos.sql, 20261031000000_video_challenge.sql),
   tagged with its part: `pitch` (Buy it, try it) or `geo` (Atami
   Geographic). Stored like the album and stories
   (src/lib/album.js): shrunk on the phone, then a private bucket and a
   row. The group is stamped by the database from the uploader's
   profile. The bosses watch them in the Boss inbox next to the rating. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { MEDIA_COLUMNS, deleteMedia, uploadMedia, withUrls } from './album';

const PITCH = { bucket: 'pitch-videos', table: 'pitch_videos' };
/* Both videos are short; this keeps the upload quick on roaming data. */
export const PITCH_MAX_SECONDS = 120;

const notReady = (err) => /pitch_videos|pitch-videos|challenge|does not exist|schema cache|bucket not found/i.test(err?.message ?? '');

/**
 * Challenge videos, oldest first, with signed URLs (`src`, `thumb`), each
 * with its `challenge`. With `team`, only that group's. `ready` is false until the SQL has been
 * run, so the stamp doesn't wait for a video nobody can upload.
 */
export function usePitchVideos({ team = null, enabled = true } = {}) {
  const [videos, setVideos] = useState([]);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase || !enabled) return;
    let q = supabase.from(PITCH.table).select(`${MEDIA_COLUMNS}, team, challenge`).order('created_at');
    if (team) q = q.eq('team', team);
    const { data, error } = await q;
    setLoaded(true);
    if (error) { if (notReady(error)) setReady(false); return; }
    setReady(true);
    try { setVideos(await withUrls(PITCH.bucket, data ?? [])); } catch { setVideos(data ?? []); }
  }, [team, enabled]);

  useEffect(() => {
    if (!supabase || !enabled) return undefined;
    reload();
    const channel = supabase
      .channel(`pitch-videos:${team ?? 'all'}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: PITCH.table,
        ...(team ? { filter: `team=eq.${team}` } : {}),
      }, () => reload())
      .subscribe((s) => { if (s === 'SUBSCRIBED') reload(); });
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', reload);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', reload);
      supabase.removeChannel(channel);
    };
  }, [team, enabled, reload]);

  return { videos, ready, loaded, reload };
}

/** Shrink and upload one video of `challenge` ('pitch' | 'geo') for the
    signed-in member's group.
    `onProgress({ stage: 'shrink' | 'upload', progress })`. */
export async function uploadPitchVideo(file, challenge, onProgress) {
  const { data } = await supabase.auth.getSession();
  const userId = data?.session?.user?.id;
  if (!userId) throw new Error('not signed in');
  return uploadMedia(PITCH, file, userId, { onProgress, maxSeconds: PITCH_MAX_SECONDS, extra: { challenge } });
}

export const deletePitchVideo = (video) => deleteMedia(PITCH, video);
