-- ════════════════════════════════════════════════════════════════════
-- Hunt scores: every member sees their own group's stamps, live
-- ════════════════════════════════════════════════════════════════════
-- Only the leader's phone plays and writes the group's run. Until now
-- only the leader (and admins) could read it back, so the rest of the
-- group never saw a stamp land. Members may now read their own group's
-- row, and the table is on realtime so a stamp shows on their phones
-- as soon as the leader's phone syncs it.
--
-- Run after 20261013000000_hunt_scores.sql. Safe to run more than once.

drop policy if exists "Admins and the group leader can read hunt scores" on public.hunt_scores;
drop policy if exists "Hunt scores: who can read" on public.hunt_scores;
create policy "Hunt scores: who can read"
  on public.hunt_scores for select to authenticated
  using (
    (select public.is_admin())
    or public.is_hunt_leader(team_id)
    or team_id = (select public.my_hunt_group())
    or (select public.hunt_results_published())
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hunt_scores'
  ) then
    alter publication supabase_realtime add table public.hunt_scores;
  end if;
end;
$$;
