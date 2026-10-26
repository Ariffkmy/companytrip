-- ════════════════════════════════════════════════════════════════════
-- Hunt photos: every member sees their own group's game photos
-- ════════════════════════════════════════════════════════════════════
-- The album now shows the treasure hunt's photos beside the trip's
-- (src/lib/album.js): bingo shots, the games' photos and the challenge
-- videos. Members can already read their group's run
-- (20261029000000_hunt_scores_group_read.sql), but the game photos in
-- it were the leader's and admins' only. Members may now load their own
-- group's photos too. Other groups' stay hidden until the results are
-- published, as before.
--
-- Run after 20261029000000_hunt_scores_group_read.sql. Safe to re-run.

drop policy if exists "Hunt photos: leader, admins, or published" on storage.objects;
drop policy if exists "Hunt photos: group, admins, or published" on storage.objects;
create policy "Hunt photos: group, admins, or published"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'hunt-photos'
    and ((select public.is_admin())
      or public.is_hunt_leader((storage.foldername(name))[1])
      or (storage.foldername(name))[1] = (select public.my_hunt_group())
      or (select public.hunt_results_published()))
  );
