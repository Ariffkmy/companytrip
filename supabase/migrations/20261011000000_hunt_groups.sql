-- ═══════════════════════════════════════════════════
-- Treasure hunt groups, separate from the trip teams
-- ═══════════════════════════════════════════════════
--
-- The hunt is played in four groups (A–D, src/data/huntGroups.js), not
-- the five trip teams in allowed_emails.team, which stay for everything
-- else. allowed_emails.hunt_group says who plays in which group, and is
-- copied to profiles just as team is. Null means not playing: Ariff,
-- Carmen and Kevin are the committee.
--
-- Everything the hunt keys by team now keys by group: bingo shots and
-- who may see them, and whose colleague-quiz answers are about which
-- group. No bingo shots had been taken yet, so none are lost.

-- ── Who plays in which group ────────────────────────
alter table public.allowed_emails
  add column if not exists hunt_group text
  check (hunt_group is null or hunt_group in ('group-a', 'group-b', 'group-c', 'group-d'));

alter table public.profiles
  add column if not exists hunt_group text;

-- The committee's grouping, matched on full name (Aidan is LEE HOE JIN).
update public.allowed_emails a
set hunt_group = v.hunt_group
from (values
  ('HELMI PUTERA BIN NURNASHRIQ AZIZ', 'group-a'),  -- Helmi
  ('RUBY BALASINGAM', 'group-a'),  -- Ruby
  ('LEE HOE JIN', 'group-a'),  -- Aidan
  ('ASMA'' BINTI ZUBIR', 'group-a'),  -- Asma'
  ('JAY ANIL SINGH SHEMAR', 'group-a'),  -- Jay
  ('NUR AINA NAJWA BINTI NOR DAUMI', 'group-b'),  -- Aina
  ('ASHLEY ANG', 'group-b'),  -- Ashley
  ('MUHAMMAD HAIRULWAFIQ BIN HAIRUNIZAM', 'group-b'),  -- Hairul
  ('RAF SWIGGERS', 'group-b'),  -- Raf
  ('SHAHRULNIZAM BIN AHMAD SHAMSUDDIN', 'group-b'),  -- Shahrul
  ('MOHD AIMAN HAKIM BIN SHAMSUL KAHAR', 'group-c'),  -- Aiman
  ('KHAW HUAI YU', 'group-c'),  -- Huai Yu
  ('REGINA MOEY', 'group-c'),  -- Ragina
  ('ELEORA LINA SCHWARTZ', 'group-c'),  -- Eleora
  ('ONG YU HAN', 'group-c'),  -- Yu Han
  ('NICHOLAS (YAP WEI CHOONG)', 'group-d'),  -- Nicholas
  ('AMIR ARSHAD ABD AZIZ', 'group-d'),  -- Amir
  ('JORD TEN BULTE', 'group-d'),  -- Jord
  ('NUR LIYANA BINTI YAACOB', 'group-d'),  -- Liyana
  ('CHIEW SOW DING', 'group-d')  -- Chiew
) as v(full_name, hunt_group)
where upper(trim(a.full_name)) = v.full_name;

update public.profiles p
set hunt_group = a.hunt_group
from public.allowed_emails a
where a.email = p.email
  and p.hunt_group is distinct from a.hunt_group;

-- Keep profiles in step, for people who join later and for edits.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, team, role, hunt_group)
  select new.id, lower(new.email), a.full_name, a.team, coalesce(a.role, 'Member'), a.hunt_group
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
  set full_name  = new.full_name,
      team       = new.team,
      role       = new.role,
      hunt_group = new.hunt_group
  where email = new.email;
  return new;
end;
$$;

drop trigger sync_profile_from_allowlist on public.allowed_emails;
create trigger sync_profile_from_allowlist
  after update of full_name, team, role, hunt_group on public.allowed_emails
  for each row execute function public.sync_profile_from_allowlist();

-- ── Bingo: a group's card ───────────────────────────
alter table public.bingo_shots drop constraint bingo_shots_team_check;
alter table public.bingo_shots add constraint bingo_shots_team_check check (team in ('group-a', 'group-b', 'group-c', 'group-d'));

-- Same signature, so the bingo_shots and storage policies follow.
create or replace function public.can_see_bingo(p_team text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.hunt_group = p_team);
$$;

-- ── Know your colleagues: answers are about a group ─
alter table public.colleague_answers drop constraint colleague_answers_team_check;
alter table public.colleague_answers alter column team drop not null;

update public.colleague_answers c
set team = v.hunt_group
from (values
  ('Helmi', 'group-a'),
  ('Ruby', 'group-a'),
  ('Aidan', 'group-a'),
  ('Asma''', 'group-a'),
  ('Jay', 'group-a'),
  ('Aina', 'group-b'),
  ('Ashley', 'group-b'),
  ('Hairul', 'group-b'),
  ('Raf', 'group-b'),
  ('Shahrul', 'group-b'),
  ('Aiman', 'group-c'),
  ('Huai Yu', 'group-c'),
  ('Ragina', 'group-c'),
  ('Eleora', 'group-c'),
  ('Yu Han', 'group-c'),
  ('Nicholas', 'group-d'),
  ('Amir', 'group-d'),
  ('Jord', 'group-d'),
  ('Liyana', 'group-d'),
  ('Chiew', 'group-d')
) as v(person, hunt_group)
where c.person = v.person;

-- The committee answered too, but belongs to no group, so is never asked.
update public.colleague_answers
set team = null
where team not in ('group-a', 'group-b', 'group-c', 'group-d');

alter table public.colleague_answers
  add constraint colleague_answers_team_check check (team is null or team in ('group-a', 'group-b', 'group-c', 'group-d'));

comment on column public.colleague_answers.team is
  'Hunt group of the person who answered (src/data/huntGroups.js); null for the committee.';
