-- ══════════════════════════════════════════════════════════════════════
-- Treasure hunt: publishing the results no longer ends the game
-- ══════════════════════════════════════════════════════════════════════
--
-- 20261014000000_hunt_results_lock.sql froze every group's hunt the
-- moment the results were published. Publishing only shows the results
-- on every member's Home; groups can still play, sync, and add or
-- replace photos afterwards. This drops those freeze policies. Who may
-- write is back to the permissive policies alone (each group's leader,
-- and admins).
--
-- Safe to re-run.

drop policy if exists "Hunt scores are frozen once published (insert)" on public.hunt_scores;
drop policy if exists "Hunt scores are frozen once published (update)" on public.hunt_scores;
drop policy if exists "Hunt scores are frozen once published (delete)" on public.hunt_scores;

drop policy if exists "Bingo is frozen once published (insert)" on public.bingo_shots;
drop policy if exists "Bingo is frozen once published (update)" on public.bingo_shots;
drop policy if exists "Bingo is frozen once published (delete)" on public.bingo_shots;

drop policy if exists "Hunt files are frozen once published (insert)" on storage.objects;
drop policy if exists "Hunt files are frozen once published (update)" on storage.objects;
drop policy if exists "Hunt files are frozen once published (delete)" on storage.objects;

notify pgrst, 'reload schema';
