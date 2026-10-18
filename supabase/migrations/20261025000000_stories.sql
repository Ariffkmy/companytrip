-- ═══════════════════════════════════════════════════
-- Stories: short-lived photos and videos, apart from the album
-- ═══════════════════════════════════════════════════
--
-- Same shape as album_photos (the app uploads both the same way), but
-- its own table and its own private bucket, so a story never shows up
-- in the album. The app lists only the last 24 hours; older rows stay
-- in place until someone clears them.

create table public.stories (
  id             uuid primary key default gen_random_uuid(),
  path           text not null unique,
  thumb_path     text not null unique,
  kind           text not null default 'photo' check (kind in ('photo', 'video')),
  width          integer,
  height         integer,
  duration       real,
  uploader_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  uploader_name  text not null default '',
  created_at     timestamptz not null default now()
);

create index stories_created_at_idx on public.stories (created_at desc);

alter table public.stories enable row level security;

create policy "Members can see stories"
  on public.stories for select
  to authenticated
  using (true);

create policy "Members can post their own stories"
  on public.stories for insert
  to authenticated
  with check (uploader_id = (select auth.uid()));

create policy "Posters and admins can delete stories"
  on public.stories for delete
  to authenticated
  using (uploader_id = (select auth.uid()) or (select public.is_admin()));

-- Name and time come from the server, exactly as for album photos.
create trigger stamp_story
  before insert on public.stories
  for each row execute function public.stamp_album_photo();

-- ── Storage ─────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stories', 'stories', false, 52428800, array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

create policy "Members can view story files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'stories');

create policy "Members can upload into their own stories folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'stories'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Posters and admins can delete story files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'stories'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );
