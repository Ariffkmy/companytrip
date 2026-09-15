-- ═══════════════════════════════════════════════════
-- Team assignment, managed by admins
-- ═══════════════════════════════════════════════════
--
-- allowed_emails.team is the single source of truth for which team a
-- person is on. It holds a team id matching src/data/groupRoster.js;
-- the treasure hunt reads it instead of asking people to pick a team.

-- Earlier setup notes used free-text teams ('Team 1', 'Committee').
-- Those can't map to a real team, so clear them; admins reassign in the
-- Admin tab.
update public.allowed_emails
set team = null
where team is not null
  and team not in ('team-ruby', 'team-sapphire', 'team-emerald', 'team-diamond', 'team-pearl');

alter table public.allowed_emails
  add constraint allowed_emails_team_valid
  check (team is null or team in ('team-ruby', 'team-sapphire', 'team-emerald', 'team-diamond', 'team-pearl'));

alter table public.allowed_emails
  add constraint allowed_emails_role_valid
  check (role in ('Team Lead', 'JP Speaker', 'Member'));

update public.profiles p
set team = a.team
from public.allowed_emails a
where a.email = p.email
  and p.team is distinct from a.team;

-- Keep each member's profile in step when an admin edits their row.
create function public.sync_profile_from_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set full_name = new.full_name,
      team      = new.team,
      role      = new.role
  where email = new.email;
  return new;
end;
$$;

create trigger sync_profile_from_allowlist
  after update of full_name, team, role on public.allowed_emails
  for each row execute function public.sync_profile_from_allowlist();

revoke execute on function public.sync_profile_from_allowlist() from public, anon, authenticated;
