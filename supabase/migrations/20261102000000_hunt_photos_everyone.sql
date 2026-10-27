-- ════════════════════════════════════════════════════════════════════
-- Hunt photos: every member sees every group's photos and videos
-- ════════════════════════════════════════════════════════════════════
-- The album shows the treasure hunt's photos beside the trip's
-- (src/lib/album.js): bingo shots, the games' photos and the challenge
-- videos. Every signed-in member may now see every group's, at any
-- time — not only their own group's, and not only once the results are
-- published.
--
-- The photos only. A group's run (stamps, answers, points) stays as
-- private as before: the album finds the games' photos through
-- hunt_album_photos(), which hands back each photo's path and nothing
-- else from the run.
--
-- These policies only add read access; who can upload, replace or
-- delete is unchanged.
--
-- Run after 20261101000000_video_challenge_two_bosses.sql. Safe to re-run.

-- ── Photo bingo ───────────────────────────────────────────────────────
drop policy if exists "Everyone signed in sees every bingo shot" on public.bingo_shots;
create policy "Everyone signed in sees every bingo shot"
  on public.bingo_shots for select to authenticated
  using (true);

drop policy if exists "Everyone signed in sees every bingo file" on storage.objects;
create policy "Everyone signed in sees every bingo file"
  on storage.objects for select to authenticated
  using (bucket_id = 'bingo');

-- ── The games' photos ─────────────────────────────────────────────────
drop policy if exists "Hunt photos: group, admins, or published" on storage.objects;
drop policy if exists "Everyone signed in sees every hunt photo" on storage.objects;
create policy "Everyone signed in sees every hunt photo"
  on storage.objects for select to authenticated
  using (bucket_id = 'hunt-photos');

-- Every game photo in every group's run: the group, its name, the
-- photo's path in hunt-photos, and when the game was sent (epoch ms).
create or replace function public.hunt_album_photos()
returns table (team_id text, team_name text, path text, sent_at bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct
    s.team_id,
    s.run ->> 'teamName',
    p.path #>> '{}',
    (sub.value ->> 'at')::numeric::bigint
  from public.hunt_scores s
  cross join lateral jsonb_each(coalesce(s.run -> 'subs', '{}'::jsonb)) as sub
  cross join lateral jsonb_path_query(sub.value, 'strict $.**.path ? (@.type() == "string")') as p(path)
  where jsonb_typeof(sub.value) = 'object'
    and (sub.value ->> 'at') ~ '^[0-9]+(\.[0-9]+)?$';
$$;

revoke execute on function public.hunt_album_photos() from public, anon;
grant execute on function public.hunt_album_photos() to authenticated;

-- ── Challenge videos ──────────────────────────────────────────────────
-- (Their files were already open to every member.)
drop policy if exists "Everyone signed in sees every challenge video" on public.pitch_videos;
create policy "Everyone signed in sees every challenge video"
  on public.pitch_videos for select to authenticated
  using (true);

notify pgrst, 'reload schema';
