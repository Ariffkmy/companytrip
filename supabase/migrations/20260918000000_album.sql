-- ═══════════════════════════════════════════════════
-- Digital album: trip photos shared by members
-- ═══════════════════════════════════════════════════
--
-- Each photo is stored twice in the private `album` bucket — a full
-- size copy and a small thumbnail — because image transforms are not
-- on the free plan and a grid of full-size photos burns roaming data.
-- Paths are `<uploader uid>/<uuid>.jpg` and `<uploader uid>/<uuid>_t.jpg`.

create table public.album_photos (
  id             uuid primary key default gen_random_uuid(),
  path           text not null unique,
  thumb_path     text not null unique,
  width          integer,
  height         integer,
  uploader_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  uploader_name  text not null default '',
  created_at     timestamptz not null default now()
);

create index album_photos_created_at_idx on public.album_photos (created_at desc);

alter table public.album_photos enable row level security;

create policy "Members can see the album"
  on public.album_photos for select
  to authenticated
  using (true);

create policy "Members can add their own photos"
  on public.album_photos for insert
  to authenticated
  with check (uploader_id = (select auth.uid()));

create policy "Uploaders and admins can delete photos"
  on public.album_photos for delete
  to authenticated
  using (uploader_id = (select auth.uid()) or (select public.is_admin()));

-- The uploader's name and the date come from the server, not the
-- client, so nobody can post a photo under someone else's name.
create function public.stamp_album_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.uploader_id := auth.uid();
  new.created_at := now();
  select coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1))
    into new.uploader_name
  from public.profiles p
  where p.id = auth.uid();
  new.uploader_name := coalesce(new.uploader_name, 'Trip member');
  return new;
end;
$$;

create trigger stamp_album_photo
  before insert on public.album_photos
  for each row execute function public.stamp_album_photo();

revoke execute on function public.stamp_album_photo() from public, anon, authenticated;

-- ── Storage ─────────────────────────────────────────
-- Private: photos of colleagues are only visible to signed-in members,
-- through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('album', 'album', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Members can view album files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'album');

create policy "Members can upload into their own album folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'album'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Uploaders and admins can delete album files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'album'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );
