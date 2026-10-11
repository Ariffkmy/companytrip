-- ══════════════════════════════════════════════════════════════════════
-- Treasure hunt: one leader per group runs the games
-- ══════════════════════════════════════════════════════════════════════
--
-- The hunt is played in four groups (src/data/huntGroups.js). Each group
-- has one leader who runs its games: only the leader may edit or submit
-- anything in the Atami treasure hunt. Everyone else in the group can
-- look, but cannot start a game, answer, or fill a bingo tile.
--
-- The hunt leader is NOT the trip Team Lead. They are two different
-- people: the Team Lead (allowed_emails.role = 'Team Lead') leads the
-- trip team and plays in the hunt like anyone else; the hunt leader is a
-- separate flag on the same person's allowlist row. src/data/huntGroups.js
-- lists them (Group A Jay, B Raf, C Huai Yu, D Jord) and this migration
-- seeds from those names.
--
-- A flag, like is_admin, so there is one place to grant or revoke it:
-- the Admin → Trip members list (the "Leader" column), or the SQL editor.
--
-- Safe to re-run.

-- ── The flag ──────────────────────────────────────────────────────────
alter table public.allowed_emails
  add column if not exists hunt_leader boolean not null default false;

alter table public.profiles
  add column if not exists hunt_leader boolean not null default false;

comment on column public.allowed_emails.hunt_leader is
  'Runs this person''s hunt group''s games (src/data/huntGroups.js). Separate from role (the trip).';

-- ── The committee's leaders, matched on full name ─────────────────────
update public.allowed_emails a
set hunt_leader = true
from (values
  ('JAY ANIL SINGH SHEMAR'),   -- Group A
  ('RAF SWIGGERS'),            -- Group B
  ('KHAW HUAI YU'),            -- Group C
  ('JORD TEN BULTE')           -- Group D
) as v(full_name)
where upper(trim(a.full_name)) = v.full_name;

update public.profiles p
set hunt_leader = a.hunt_leader
from public.allowed_emails a
where a.email = p.email
  and p.hunt_leader is distinct from a.hunt_leader;

-- ── Keep profiles in step, for people who join later and for edits ────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, team, role, hunt_group, hunt_leader)
  select new.id, lower(new.email), a.full_name, a.team, coalesce(a.role, 'Member'), a.hunt_group, a.hunt_leader
  from public.allowed_emails a
  where a.email = lower(new.email);
  return new;
end;
$$;

create or replace function public.sync_profile_from_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set full_name   = new.full_name,
      team        = new.team,
      role        = new.role,
      hunt_group  = new.hunt_group,
      hunt_leader = new.hunt_leader
  where email = new.email;
  return new;
end;
$$;

drop trigger sync_profile_from_allowlist on public.allowed_emails;
create trigger sync_profile_from_allowlist
  after update of full_name, team, role, hunt_group, hunt_leader on public.allowed_emails
  for each row execute function public.sync_profile_from_allowlist();

-- ── Who may run a group's games ───────────────────────────────────────
-- True when the signed-in user is the leader of p_group. security definer
-- for the same reason as is_admin: profiles is readable, but the check
-- belongs to the app, not to a client-written policy.
create or replace function public.is_hunt_leader(p_group text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.hunt_group = p_group
      and p.hunt_leader
  );
$$;

revoke execute on function public.is_hunt_leader(text) from public, anon;
grant execute on function public.is_hunt_leader(text) to authenticated;

-- ── Photo bingo: only the group's leader may fill the card ────────────
-- Same signature, so the bingo_shots and storage policies follow. Seeing
-- a card is unchanged (can_see_bingo): the whole group can still watch.
-- Only admins and the group's own leader may add, replace or clear a tile.
create or replace function public.can_upload_bingo(p_team text, p_tile text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_tile ~ '^([0-9]|[12][0-9])$', false)
    and (public.is_admin() or public.is_hunt_leader(p_team));
$$;

comment on function public.can_upload_bingo(text, text) is
  'Admins and the group''s hunt leader may fill a bingo tile; the rest of the group may only watch.';
