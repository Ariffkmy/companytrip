-- ══════════════════════════════════════════════════════════════════════
-- Treasure hunt: reset everything for the real game
-- ══════════════════════════════════════════════════════════════════════
--
-- Admin → Organiser → "Reset for the real game" calls reset_hunt(). It
-- wipes what rehearsals left behind and puts the hunt back to "not
-- started yet", without touching anything the committee configured.
--
-- Cleared: the open switch (closed until the briefing), a stop, the
-- clock restart, published results, judging, every synced run
-- (hunt_scores), bingo shots, boss chat questions and safety
-- check-ins. reset_at is set to now: each phone drops any run it
-- started before that and goes back to the start screen.
--
-- Kept: hunt_config.config (every game's text, questions, answers,
-- reference photos, points, map), colleague quiz answers, groups and
-- leaders, announcements.
--
-- The photo files themselves are removed by the app through the
-- Storage API (Supabase doesn't allow deleting them from SQL).
--
-- Run after 20261019000000_location_checkins.sql. Safe to re-run.

alter table public.hunt_config
  add column if not exists reset_at timestamptz;

comment on column public.hunt_config.reset_at is
  'When the committee last reset the hunt for the real game. Phones drop runs started before it.';

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
