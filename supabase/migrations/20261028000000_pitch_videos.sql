-- ══════════════════════════════════════════════════════════════════════
-- Treasure hunt: Buy it, try it — the video of the pitch
-- ══════════════════════════════════════════════════════════════════════
--
-- Any member of a group records the group selling its item to the
-- bosses and uploads it from the hunt page. The bosses watch it in the
-- Boss inbox next to the rating. A group's stamp needs a video and a
-- rating (20261027000000_pitch_ratings.sql).
--
-- Same shape as album_photos and stories (the app uploads all three the
-- same way), plus the group, which is taken from the uploader's
-- profile, never from the phone.
--
-- Run after 20261027000000_pitch_ratings.sql. Safe to re-run.

create table if not exists public.pitch_videos (
  id             uuid primary key default gen_random_uuid(),
  team           text not null check (team in ('group-a', 'group-b', 'group-c', 'group-d')),
  path           text not null unique,
  thumb_path     text not null unique,
  kind           text not null default 'video' check (kind in ('photo', 'video')),
  width          integer,
  height         integer,
  duration       real,
  uploader_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  uploader_name  text not null default '',
  created_at     timestamptz not null default now()
);

create index if not exists pitch_videos_team_created on public.pitch_videos (team, created_at);

comment on table public.pitch_videos is
  'Buy it, try it (treasure hunt): a group''s video of its pitch to the bosses.';

-- The uploader's group, from their profile. Runs before the insert
-- policy is checked, so the policy sees the group set here.
create or replace function public.pitch_videos_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.team := (select p.hunt_group from public.profiles p where p.id = auth.uid());
  if new.team is null then
    raise exception 'You are not in a hunt group' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists pitch_videos_team on public.pitch_videos;
create trigger pitch_videos_team
  before insert on public.pitch_videos
  for each row execute function public.pitch_videos_team();

-- Name and time come from the server, exactly as for album photos.
drop trigger if exists stamp_pitch_video on public.pitch_videos;
create trigger stamp_pitch_video
  before insert on public.pitch_videos
  for each row execute function public.stamp_album_photo();

alter table public.pitch_videos enable row level security;

drop policy if exists "Pitch videos: who can see" on public.pitch_videos;
create policy "Pitch videos: who can see"
  on public.pitch_videos for select to authenticated
  using (
    team = (select public.my_hunt_group())
    or (select public.is_hunt_boss())
    or (select public.is_admin())
    or (select public.hunt_results_published())
  );

drop policy if exists "Pitch videos: group members upload" on public.pitch_videos;
create policy "Pitch videos: group members upload"
  on public.pitch_videos for insert to authenticated
  with check (uploader_id = (select auth.uid()) and team = (select public.my_hunt_group()));

drop policy if exists "Pitch videos: uploader or admin deletes" on public.pitch_videos;
create policy "Pitch videos: uploader or admin deletes"
  on public.pitch_videos for delete to authenticated
  using (uploader_id = (select auth.uid()) or (select public.is_admin()));

-- ── Storage ───────────────────────────────────────────────────────────
-- Files are filed under the uploader's id, as in the album.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pitch-videos', 'pitch-videos', false, 52428800, array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

drop policy if exists "Pitch videos: members view files" on storage.objects;
create policy "Pitch videos: members view files"
  on storage.objects for select to authenticated
  using (bucket_id = 'pitch-videos');

drop policy if exists "Pitch videos: upload into own folder" on storage.objects;
create policy "Pitch videos: upload into own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pitch-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Pitch videos: uploader or admin deletes files" on storage.objects;
create policy "Pitch videos: uploader or admin deletes files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pitch-videos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

-- ── Live updates ──────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pitch_videos'
  ) then
    alter publication supabase_realtime add table public.pitch_videos;
  end if;
end;
$$;

-- ── Reset for the real game also clears the pitch videos ──────────────
-- (The files stay in the bucket; nothing lists them once the rows go.)
create or replace function public.reset_hunt()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_scores int := 0;
  n_bingo int := 0;
  n_boss int := 0;
  n_checkins int := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can reset the hunt' using errcode = '42501';
  end if;

  update public.hunt_config
  set is_open = false,
      stopped_at = null,
      clock_reset_at = null,
      results_published = false,
      judging = '{}'::jsonb,
      reset_at = now()
  where id = 'atami';

  if to_regclass('public.hunt_scores') is not null then
    delete from public.hunt_scores where true;
    get diagnostics n_scores = row_count;
  end if;
  if to_regclass('public.bingo_shots') is not null then
    delete from public.bingo_shots where true;
    get diagnostics n_bingo = row_count;
  end if;
  if to_regclass('public.boss_questions') is not null then
    delete from public.boss_questions where true;
    get diagnostics n_boss = row_count;
  end if;
  if to_regclass('public.boss_moves') is not null then
    delete from public.boss_moves where true;
  end if;
  if to_regclass('public.pitch_ratings') is not null then
    delete from public.pitch_ratings where true;
  end if;
  if to_regclass('public.pitch_videos') is not null then
    delete from public.pitch_videos where true;
  end if;
  if to_regclass('public.location_checkins') is not null then
    delete from public.location_checkins where true;
    get diagnostics n_checkins = row_count;
  end if;

  return jsonb_build_object(
    'scores', n_scores, 'bingo', n_bingo, 'boss', n_boss, 'checkins', n_checkins,
    'reset_at', (select c.reset_at from public.hunt_config c where c.id = 'atami')
  );
end;
$$;

revoke execute on function public.reset_hunt() from public, anon;
grant execute on function public.reset_hunt() to authenticated;

notify pgrst, 'reload schema';
