-- ══════════════════════════════════════════════════════════════════════
-- Treasure hunt: Find the boss, a live yes/no chat
-- ══════════════════════════════════════════════════════════════════════
--
-- In game 7 the bosses (Tim and Ellice) wait somewhere in the hunt area.
-- Groups find them by asking questions in the app; the bosses keep the
-- app open on their Boss inbox and may only answer Yes or No.
--
-- One row is one question and its answer. A group's members ask (any
-- member, not just the leader); a boss (or an admin, as a backup)
-- answers. New rows and answers reach every open phone through Supabase
-- Realtime, which honours the select policy below: a group only ever
-- receives its own questions.
--
-- Who is a boss: allowed_emails.hunt_boss, ticked in Admin → Trip
-- members (the "Boss" column), copied to profiles like hunt_leader.
--
-- Run after 20261013000000_hunt_scores.sql (hunt_results_published).
-- Safe to re-run.

-- ── The flag ──────────────────────────────────────────────────────────
alter table public.allowed_emails
  add column if not exists hunt_boss boolean not null default false;

alter table public.profiles
  add column if not exists hunt_boss boolean not null default false;

comment on column public.allowed_emails.hunt_boss is
  'Answers the groups'' yes/no questions in Find the boss (game 7).';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, team, role, hunt_group, hunt_leader, hunt_boss)
  select new.id, lower(new.email), a.full_name, a.team, coalesce(a.role, 'Member'), a.hunt_group, a.hunt_leader, a.hunt_boss
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
      hunt_leader = new.hunt_leader,
      hunt_boss   = new.hunt_boss
  where email = new.email;
  return new;
end;
$$;

drop trigger if exists sync_profile_from_allowlist on public.allowed_emails;
create trigger sync_profile_from_allowlist
  after update of full_name, team, role, hunt_group, hunt_leader, hunt_boss on public.allowed_emails
  for each row execute function public.sync_profile_from_allowlist();

-- The committee's bosses. Tim and Ellice are ticked in Admin → Trip
-- members once they are on the list.
update public.allowed_emails
set hunt_boss = true
where email in ('ariff@orangeleaf.consulting');

update public.profiles p
set hunt_boss = a.hunt_boss
from public.allowed_emails a
where a.email = p.email
  and p.hunt_boss is distinct from a.hunt_boss;

create or replace function public.is_hunt_boss()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.hunt_boss);
$$;

revoke execute on function public.is_hunt_boss() from public, anon;
grant execute on function public.is_hunt_boss() to authenticated;

-- The signed-in member's hunt group, for the policies below.
create or replace function public.my_hunt_group()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.hunt_group from public.profiles p where p.id = auth.uid();
$$;

revoke execute on function public.my_hunt_group() from public, anon;
grant execute on function public.my_hunt_group() to authenticated;

-- ── Questions and answers ─────────────────────────────────────────────
create table if not exists public.boss_questions (
  id          uuid primary key default gen_random_uuid(),
  team        text not null check (team in ('group-a', 'group-b', 'group-c', 'group-d')),
  asked_by    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  asker_name  text,
  question    text not null check (char_length(btrim(question)) between 1 and 200),
  answer      text check (answer in ('yes', 'no')),
  answered_by uuid references public.profiles (id) on delete set null,
  answer_name text,
  answered_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists boss_questions_team_created on public.boss_questions (team, created_at);

comment on table public.boss_questions is
  'Find the boss (game 7): a group''s question to the bosses, and their yes/no answer.';

-- Names come from profiles, not from the phone, so nobody can ask as
-- someone else; the answer's who and when are stamped the same way.
create or replace function public.boss_questions_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.asked_by := auth.uid();
    new.question := btrim(new.question);
    new.asker_name := (select p.full_name from public.profiles p where p.id = new.asked_by);
    new.answer := null;
    new.answered_by := null;
    new.answer_name := null;
    new.answered_at := null;
    new.created_at := now();
  else
    -- Only the answer may change; the question stays as it was asked.
    new.team := old.team;
    new.asked_by := old.asked_by;
    new.asker_name := old.asker_name;
    new.question := old.question;
    new.created_at := old.created_at;
    if new.answer is null then
      new.answered_by := null;
      new.answer_name := null;
      new.answered_at := null;
    elsif new.answer is distinct from old.answer then
      new.answered_by := auth.uid();
      new.answer_name := (select p.full_name from public.profiles p where p.id = auth.uid());
      new.answered_at := now();
    else
      new.answered_by := old.answered_by;
      new.answer_name := old.answer_name;
      new.answered_at := old.answered_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists boss_questions_stamp on public.boss_questions;
create trigger boss_questions_stamp
  before insert or update on public.boss_questions
  for each row execute function public.boss_questions_stamp();

alter table public.boss_questions enable row level security;

-- A group sees its own thread; bosses and admins see every group's;
-- everyone sees all of them once the results are published.
drop policy if exists "Boss questions: who can read" on public.boss_questions;
create policy "Boss questions: who can read"
  on public.boss_questions for select to authenticated
  using (
    team = (select public.my_hunt_group())
    or (select public.is_hunt_boss())
    or (select public.is_admin())
    or (select public.hunt_results_published())
  );

-- Any member of the group may ask for it. Publishing the results
-- doesn't end the game, so it doesn't stop the chat either.
drop policy if exists "Boss questions: group members ask" on public.boss_questions;
create policy "Boss questions: group members ask"
  on public.boss_questions for insert to authenticated
  with check (team = (select public.my_hunt_group()));

-- Only bosses and admins answer.
drop policy if exists "Boss questions: bosses answer" on public.boss_questions;
create policy "Boss questions: bosses answer"
  on public.boss_questions for update to authenticated
  using ((select public.is_admin()) or (select public.is_hunt_boss()))
  with check ((select public.is_admin()) or (select public.is_hunt_boss()));

-- Admins can clear the chat (a rehearsal, a restart).
drop policy if exists "Boss questions: admins delete" on public.boss_questions;
create policy "Boss questions: admins delete"
  on public.boss_questions for delete to authenticated
  using ((select public.is_admin()));

-- ── Live updates ──────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'boss_questions'
  ) then
    alter publication supabase_realtime add table public.boss_questions;
  end if;
end;
$$;

notify pgrst, 'reload schema';
