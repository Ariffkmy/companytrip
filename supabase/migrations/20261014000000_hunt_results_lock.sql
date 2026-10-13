-- ══════════════════════════════════════════════════════════════════════
-- Treasure hunt: everything is read only once the results are published
-- ══════════════════════════════════════════════════════════════════════
--
-- Publishing the results (Admin → Organiser) ends the game. From then
-- on the app opens every group's game page read only, and these
-- policies make sure nothing can be changed behind it either: no group
-- leader can sync a run, upload or replace a game photo, or add or
-- remove a bingo shot. Admins still can. Unpublishing lifts the lock.
--
-- They are RESTRICTIVE policies: they don't grant anything, they are
-- ANDed onto the permissive ones that already exist, so who could write
-- before is unchanged while the results are unpublished.
--
-- Run after 20261013000000_hunt_scores.sql (hunt_results_published).
-- Safe to re-run.

-- ── Synced runs ───────────────────────────────────────────────────────
drop policy if exists "Hunt scores are frozen once published (insert)" on public.hunt_scores;
create policy "Hunt scores are frozen once published (insert)"
  on public.hunt_scores as restrictive for insert to authenticated
  with check ((select public.is_admin()) or not (select public.hunt_results_published()));

drop policy if exists "Hunt scores are frozen once published (update)" on public.hunt_scores;
create policy "Hunt scores are frozen once published (update)"
  on public.hunt_scores as restrictive for update to authenticated
  using ((select public.is_admin()) or not (select public.hunt_results_published()))
  with check ((select public.is_admin()) or not (select public.hunt_results_published()));

drop policy if exists "Hunt scores are frozen once published (delete)" on public.hunt_scores;
create policy "Hunt scores are frozen once published (delete)"
  on public.hunt_scores as restrictive for delete to authenticated
  using ((select public.is_admin()) or not (select public.hunt_results_published()));

-- ── Bingo shots ───────────────────────────────────────────────────────
drop policy if exists "Bingo is frozen once published (insert)" on public.bingo_shots;
create policy "Bingo is frozen once published (insert)"
  on public.bingo_shots as restrictive for insert to authenticated
  with check ((select public.is_admin()) or not (select public.hunt_results_published()));

drop policy if exists "Bingo is frozen once published (update)" on public.bingo_shots;
create policy "Bingo is frozen once published (update)"
  on public.bingo_shots as restrictive for update to authenticated
  using ((select public.is_admin()) or not (select public.hunt_results_published()))
  with check ((select public.is_admin()) or not (select public.hunt_results_published()));

drop policy if exists "Bingo is frozen once published (delete)" on public.bingo_shots;
create policy "Bingo is frozen once published (delete)"
  on public.bingo_shots as restrictive for delete to authenticated
  using ((select public.is_admin()) or not (select public.hunt_results_published()));

-- ── Photo files (bingo and the other games) ───────────────────────────
-- Restrictive policies on storage.objects apply to every bucket, so each
-- one lets anything outside the two hunt buckets straight through.
drop policy if exists "Hunt files are frozen once published (insert)" on storage.objects;
create policy "Hunt files are frozen once published (insert)"
  on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id not in ('bingo', 'hunt-photos')
    or (select public.is_admin())
    or not (select public.hunt_results_published())
  );

drop policy if exists "Hunt files are frozen once published (update)" on storage.objects;
create policy "Hunt files are frozen once published (update)"
  on storage.objects as restrictive for update to authenticated
  using (
    bucket_id not in ('bingo', 'hunt-photos')
    or (select public.is_admin())
    or not (select public.hunt_results_published())
  )
  with check (
    bucket_id not in ('bingo', 'hunt-photos')
    or (select public.is_admin())
    or not (select public.hunt_results_published())
  );

drop policy if exists "Hunt files are frozen once published (delete)" on storage.objects;
create policy "Hunt files are frozen once published (delete)"
  on storage.objects as restrictive for delete to authenticated
  using (
    bucket_id not in ('bingo', 'hunt-photos')
    or (select public.is_admin())
    or not (select public.hunt_results_published())
  );

notify pgrst, 'reload schema';
