-- ═══════════════════════════════════════════════════
-- Digital album: videos alongside photos
-- ═══════════════════════════════════════════════════
--
-- A video row is the same shape as a photo row: `path` is the MP4
-- (re-encoded to 720p on the phone before upload) and `thumb_path` is
-- a JPEG poster frame for the grid. Paths are `<uid>/<uuid>.mp4`.

alter table public.album_photos
  add column kind text not null default 'photo' check (kind in ('photo', 'video')),
  add column duration real;

-- 50 MB is the free plan's per-file ceiling. A re-encoded minute is
-- ~20 MB; the cap only bites when a phone can't re-encode and sends
-- the original.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm']
where id = 'album';
