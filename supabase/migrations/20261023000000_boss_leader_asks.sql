-- ══════════════════════════════════════════════════════════════════════
-- Find the boss: only the group leader asks
-- ══════════════════════════════════════════════════════════════════════
--
-- 20261015000000_boss_chat.sql let any member of a group ask the bosses.
-- Now only the group's leader asks; the rest of the group still reads
-- the chat and the answers live (the select policy is unchanged).
-- Admins can still ask, for testing.
--
-- Run after 20261022000000_boss_moves.sql. Safe to re-run.

drop policy if exists "Boss questions: group members ask" on public.boss_questions;
drop policy if exists "Boss questions: group leader asks" on public.boss_questions;
create policy "Boss questions: group leader asks"
  on public.boss_questions for insert to authenticated
  with check (
    (team = (select public.my_hunt_group()) and public.is_hunt_leader(team))
    or (select public.is_admin())
  );

notify pgrst, 'reload schema';
