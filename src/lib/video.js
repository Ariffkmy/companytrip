/* ═══════════════════════════════════════════════════
   Videos — shrink on the phone before they go anywhere
   ═══════════════════════════════════════════════════

   A minute of phone video is 100–400 MB (1080p/4K). Re-encoding to
   720p H.264 with the phone's own hardware encoder (WebCodecs, via
   mediabunny) runs faster than real time and brings that minute to
   ~20 MB, so the upload is short even on roaming data. Phones that
   can't re-encode send the original, if it fits under the cap.

   mediabunny is only imported when someone actually picks a video. */

import { photoErrorMessage } from './photos';

export const VIDEO_MAX_SECONDS = 3 * 60;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024; // free-plan per-file ceiling
const LONG_SIDE = 1280;
const VIDEO_BITRATE = 2_500_000;
const THUMB_LONG_SIDE = 480;

export const isVideoFile = (f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name);

const fitLong = (w, h, max) => (w >= h ? { width: Math.min(w, max) } : { height: Math.min(h, max) });

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.72);
  });
}

/** A video File → { blob, contentType, ext, thumb, width, height, duration }.
    `onProgress(0..1)` follows the re-encode. */
export async function prepareVideo(file, onProgress = () => {}, { maxSeconds = VIDEO_MAX_SECONDS } = {}) {
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('not a video');

  const duration = await input.computeDuration();
  if (duration > maxSeconds + 1) throw new Error('video too long');
  const width = track.displayWidth;
  const height = track.displayHeight;

  /* Poster frame for the grid, a moment in so it isn't a black fade-in. */
  let thumb;
  try {
    const sink = new mb.CanvasSink(track, fitLong(width, height, THUMB_LONG_SIDE));
    const frame = await sink.getCanvas(Math.min(0.5, duration / 2)) ?? await sink.getCanvas(0);
    thumb = await canvasToJpeg(frame.canvas);
  } catch {
    /* This phone can't decode the clip: a plain dark tile stands in. */
    const c = document.createElement('canvas');
    Object.assign(c, { width: 16, height: 16 });
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, 16, 16);
    thumb = await canvasToJpeg(c);
  }

  let out = null;
  try {
    const output = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), // plays before it has fully downloaded
      target: new mb.BufferTarget(),
    });
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: { ...fitLong(width, height, LONG_SIDE), codec: 'avc', bitrate: VIDEO_BITRATE },
      /* Phone audio is already AAC, so this is usually a straight copy. */
      audio: { codec: 'aac' },
    });
    /* A dropped audio track would mean a silent video: send the original instead. */
    const lostAudio = conversion.discardedTracks.some((d) => d.track.type === 'audio');
    if (conversion.isValid && !lostAudio) {
      conversion.onProgress = onProgress;
      await conversion.execute();
      out = new Blob([output.target.buffer], { type: 'video/mp4' });
    }
  } catch (e) {
    console.warn('[album] video re-encode failed, sending the original', e);
  }

  /* Keep the original when this phone can't re-encode, or when it is
     already smaller (a short, low-res clip). */
  if (!out || out.size >= file.size) {
    if (file.size > VIDEO_MAX_BYTES) throw new Error('video too large');
    const mov = /quicktime/.test(file.type) || /\.mov$/i.test(file.name);
    return { blob: file, contentType: mov ? 'video/quicktime' : file.type || 'video/mp4', ext: mov ? 'mov' : 'mp4', thumb, width, height, duration };
  }
  if (out.size > VIDEO_MAX_BYTES) throw new Error('video too large');
  const scaled = Math.min(1, LONG_SIDE / Math.max(width, height));
  return {
    blob: out, contentType: 'video/mp4', ext: 'mp4', thumb,
    width: Math.round(width * scaled), height: Math.round(height * scaled), duration,
  };
}

/** A failed photo or video upload, in words. */
export function mediaErrorMessage(err, { maxSeconds = VIDEO_MAX_SECONDS } = {}) {
  const msg = err?.message ?? '';
  if (/video too long/.test(msg)) {
    const limit = maxSeconds >= 60 && maxSeconds % 60 === 0 ? `${maxSeconds / 60} minute${maxSeconds > 60 ? 's' : ''}` : `${maxSeconds} seconds`;
    return `Videos can be up to ${limit}. Trim it in your Photos app first.`;
  }
  if (/video too large/.test(msg)) return 'That video is too large for this phone to shrink. Try a shorter clip.';
  if (/not a video|unsupported|format/i.test(msg)) return 'That video’s format can’t be read here. Try one recorded with the phone camera.';
  return photoErrorMessage(err);
}

export function formatDuration(s) {
  if (s == null) return '';
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
