-- ═══════════════════════════════════════════════════
-- Photo bingo: any number of tiles, not just nine
-- ═══════════════════════════════════════════════════
--
-- A team's card is however many reference photos the committee uploads
-- (hunt_config, teams.<team>.bingo), up to 30. Tiles are numbered from 0, so the
-- database accepts 0–29. Keep this in step with BINGO_MAX in
-- src/lib/huntConfig.js.

alter table public.bingo_shots drop constraint bingo_shots_tile_check;
alter table public.bingo_shots add constraint bingo_shots_tile_check check (tile between 0 and 29);

-- Same signature, so the bingo_shots and storage policies keep working.
create or replace function public.can_upload_bingo(p_team text, p_tile text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_tile ~ '^([0-9]|[12][0-9])$', false) and public.can_see_bingo(p_team);
$$;
