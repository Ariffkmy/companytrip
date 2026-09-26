-- ═══════════════════════════════════════════════════
-- Treasure hunt: the committee's switch
-- ═══════════════════════════════════════════════════
--
-- Teams cannot start the hunt until an admin opens it, so the briefing
-- happens before anyone is heads-down in their phone.
--
-- A column rather than a key inside hunt_config.config, because the
-- editor holds the config as a draft the admin saves when they are
-- finished. A switch has to take effect the moment it is flipped, and
-- must not be carried along by a save of half-finished content — nor
-- reverted by one.
--
-- Default false: a trip that has not thought about this yet is one
-- where the hunt has not started.
--
-- Safe to re-run.

alter table public.hunt_config
  add column if not exists is_open boolean not null default false;

comment on column public.hunt_config.is_open is
  'Committee switch. False until an admin opens the hunt; teams cannot start until it is true.';

-- Reading it is covered by the existing "Members can read the hunt
-- config" policy, and writing by "Admins can edit the hunt config" —
-- both are table-wide, so the column needs no policy of its own.
