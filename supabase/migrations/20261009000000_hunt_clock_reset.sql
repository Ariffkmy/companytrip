-- ═══════════════════════════════════════════════════
-- Treasure hunt: the committee can restart the race clock
-- ═══════════════════════════════════════════════════
--
-- Team runs live on the players' phones, so the committee can't reach in
-- and change a timer. Instead it records when it restarted the clock.
-- Every phone whose run started before that moment gets a fresh race
-- clock, leaves the "Time's up" screen and keeps every stamp it has.
--
-- A column, not a key in hunt_config.config, for the same reason as
-- is_open: the editor saves config as a whole draft, and must not undo
-- a restart pressed while it was open.
--
-- The existing policies already let members read the row and admins
-- write it. Safe to re-run.

alter table public.hunt_config
  add column if not exists clock_reset_at timestamptz;

comment on column public.hunt_config.clock_reset_at is
  'When the committee last restarted the race clock for every team. Null if never.';
