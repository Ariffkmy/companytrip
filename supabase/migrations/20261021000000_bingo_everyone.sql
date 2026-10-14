-- ══════════════════════════════════════════════════════════════════════
-- Photo bingo: every member of the group can fill the card again
-- ══════════════════════════════════════════════════════════════════════
--
-- 20261012000000_hunt_leader.sql made bingo leader-only. Bingo goes back
-- to the whole group: anyone in a group (and admins) can add, replace or
-- clear any tile of that group's card, from their own phone. Collecting
-- the stamp stays with the leader, as every other game does.
--
-- Same signature, so the bingo_shots and storage.objects policies that
-- call it follow without being touched. Tiles 0–29, as BINGO_MAX in
-- src/lib/huntConfig.js. Run after 20261020000000_hunt_reset.sql.
-- Safe to re-run.

create or replace function public.can_upload_bingo(p_team text, p_tile text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_tile ~ '^([0-9]|[12][0-9])$', false)
    and public.can_see_bingo(p_team);
$$;

comment on function public.can_upload_bingo(text, text) is
  'Admins and every member of the group may fill a bingo tile.';

notify pgrst, 'reload schema';
