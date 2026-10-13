-- ══════════════════════════════════════════════════════════════════════
-- Treasure hunt: the committee can stop the game for everyone, now
-- ══════════════════════════════════════════════════════════════════════
--
-- Admin → Organiser → "Stop the game" records the moment here and sends
-- a "game over" announcement (20261017000000_announcements.sql) with
-- the committee's message, which pops up on every phone. Each leader's
-- phone then closes its run at that moment — anything sent in after it
-- doesn't count — and syncs its score straight away.
--
-- stopped_at is cleared by "Resume" and by restarting the clock.
-- stop_message is the last message used, offered again next time.
--
-- Columns, not keys in hunt_config.config, for the same reason as
-- clock_reset_at: the editor saves config as a whole draft.
--
-- Run after 20261017000000_announcements.sql. Safe to re-run.

alter table public.hunt_config
  add column if not exists stopped_at timestamptz,
  add column if not exists stop_message text;

comment on column public.hunt_config.stopped_at is
  'When the committee stopped the hunt for every group. Null while it runs.';
comment on column public.hunt_config.stop_message is
  'The game-over message shown to everyone when the hunt is stopped.';

-- The game-over popup is an announcement of its own kind.
alter table public.announcements drop constraint if exists announcements_level_check;
alter table public.announcements
  add constraint announcements_level_check check (level in ('info', 'urgent', 'gameover'));

notify pgrst, 'reload schema';
