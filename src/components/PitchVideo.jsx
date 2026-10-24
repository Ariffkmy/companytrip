/* ═══════════════════════════════════════════════════
   Atami Video Challenge — one of the group's videos
   ═══════════════════════════════════════════════════

   On the hunt page, for every member of the group (not only the
   leader): record the video for `challenge` ('pitch' for Buy it, try
   it, 'geo' for Atami Geographic), or pick the clip from the phone, and
   upload it. `pv` is usePitchVideos() for the group, owned by the hunt
   page so the stamp can wait for both videos too. */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PITCH_MAX_SECONDS, deletePitchVideo, uploadPitchVideo } from '../lib/pitchVideos';
import { CHALLENGE_INFO } from '../lib/pitchRatings';
import { formatDuration, isVideoFile, mediaErrorMessage } from '../lib/video';
import { shortName } from './BossChat';

export default function PitchVideo({ pv, challenge = 'pitch', canUpload = true }) {
  const { ready, loaded, reload } = pv;
  const info = CHALLENGE_INFO[challenge];
  const videos = pv.videos.filter((v) => (v.challenge ?? 'pitch') === challenge);
  const [me, setMe] = useState(null);
  const [step, setStep] = useState(null);
  const [error, setError] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);

  useEffect(() => {
    let live = true;
    supabase?.auth.getSession().then(({ data }) => { if (live) setMe(data?.session?.user?.id ?? null); });
    return () => { live = false; };
  }, []);

  if (loaded && !ready) return null;

  const onFile = async (file) => {
    if (!file) return;
    setError('');
    if (!isVideoFile(file)) { setError('Pick a video, not a photo.'); return; }
    setStep({ stage: 'shrink', progress: 0 });
    try {
      await uploadPitchVideo(file, challenge, setStep);
      await reload();
    } catch (err) {
      setError(mediaErrorMessage(err, { maxSeconds: PITCH_MAX_SECONDS }));
    } finally {
      setStep(null);
    }
  };

  const remove = async (v) => {
    if (confirmDel !== v.id) { setConfirmDel(v.id); return; }
    setConfirmDel(null);
    try { await deletePitchVideo(v); await reload(); } catch { setError('Couldn’t delete that video.'); }
  };

  const label = step?.stage === 'shrink'
    ? `Shrinking video ${Math.round((step.progress ?? 0) * 100)}%`
    : step ? 'Uploading video…' : null;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>
        {info.emoji} {info.title} {videos.length ? <span style={{ color: 'var(--sea)' }}>✓</span> : null}
      </div>
      {!videos.length && (
        <p className="note" style={{ margin: '0 0 10px' }}>
          Anyone in the group can {info.film} and upload it here. Up to {formatDuration(PITCH_MAX_SECONDS)}.
        </p>
      )}

      {videos.map((v) => (
        <div key={v.id} style={{ marginBottom: 10 }}>
          {v.src ? (
            <video src={v.src} poster={v.thumb ?? undefined} controls playsInline preload="none"
              style={{ display: 'block', width: '100%', maxHeight: 360, borderRadius: 8, border: 'var(--line)', background: '#000' }} />
          ) : (
            <p className="note" style={{ margin: 0 }}>Video saved — no signal to show it right now.</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12, color: 'var(--ink-soft)' }}>
            <span>{shortName(v.uploader_name)}{v.duration ? ` · ${formatDuration(v.duration)}` : ''}</span>
            {canUpload && me && v.uploader_id === me && (
              <button type="button" onClick={() => remove(v)} onBlur={() => setConfirmDel(null)}
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: '700 12px var(--body)', color: 'var(--red)' }}>
                {confirmDel === v.id ? 'Tap again to delete' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      ))}

      {canUpload && (
        <label className="btn block" style={{
          justifyContent: 'center', cursor: step ? 'wait' : 'pointer', opacity: step ? 0.6 : 1,
          ...(videos.length ? { background: 'var(--card)', color: 'var(--ink)' } : {}),
        }}>
          {label ?? (videos.length ? 'Upload another video' : `Record or upload the ${info.video}`)}
          <input type="file" accept="video/*" className="sr-only" disabled={Boolean(step)}
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      )}
      {error && <p role="alert" style={{ margin: '8px 0 0', color: 'var(--red)', fontSize: 14 }}>{error}</p>}
    </div>
  );
}
