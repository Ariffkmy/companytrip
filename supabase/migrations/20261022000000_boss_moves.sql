-- ══════════════════════════════════════════════════════════════════════
-- Find the boss: two questions per group until the bosses move
-- ══════════════════════════════════════════════════════════════════════
--
-- A group may ask the bosses only 2 questions. When the bosses walk to a
-- new spot, one of them taps "We're moving" in the Boss inbox: that adds
-- a row here, and every group gets 2 fresh questions.
--
-- The limit is kept here, in the database, as well as on the phone, so a
-- second phone in the same group can't get round it.
--
-- Run after 20261021000000_bingo_everyone.sql. Safe to re-run.

create table if not exists public.boss_moves (
  id          uuid primary key default gen_random_uuid(),
  moved_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  mover_name  text,
  created_at  timestamptz not null default now()
);

comment on table public.boss_moves is
  'Find the boss: each time the bosses move to a new spot. Every group''s question allowance starts again from the latest.';

create or replace function public.boss_moves_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.moved_by := auth.uid();
  new.mover_name := (select p.full_name from public.profiles p where p.id = auth.uid());
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists boss_moves_stamp on public.boss_moves;
create trigger boss_moves_stamp
  before insert on public.boss_moves
  for each row execute function public.boss_moves_stamp();

alter table public.boss_moves enable row level security;

drop policy if exists "Boss moves: everyone reads" on public.boss_moves;
create policy "Boss moves: everyone reads"
  on public.boss_moves for select to authenticated
  using (true);

drop policy if exists "Boss moves: bosses add" on public.boss_moves;
create policy "Boss moves: bosses add"
  on public.boss_moves for insert to authenticated
  with check ((select public.is_hunt_boss()) or (select public.is_admin()));

drop policy if exists "Boss moves: admins delete" on public.boss_moves;
create policy "Boss moves: admins delete"
  on public.boss_moves for delete to authenticated
  using ((select public.is_admin()));

-- ── The limit ─────────────────────────────────────────────────────────
-- Same stamp as before, plus: a group that has already asked 2 since the
-- bosses last moved can't ask a third. Keep 2 in step with QUESTION_LIMIT
-- in src/lib/bossChat.js.
create or replace function public.boss_questions_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  since timestamptz;
  used  int;
begin
  if tg_op = 'INSERT' then
    select max(m.created_at) into since from public.boss_moves m;
    select count(*) into used from public.boss_questions q
      where q.team = new.team and (since is null or q.created_at > since);
    if used >= 2 then
      raise exception 'Question limit reached until the bosses move' using errcode = 'P0001';
    end if;
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

-- ── Reset for the real game also clears the moves ─────────────────────
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
  if to_regclass('public.boss_moves') is not null then
    delete from public.boss_moves where true;
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

-- ── Live updates ──────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'boss_moves'
  ) then
    alter publication supabase_realtime add table public.boss_moves;
  end if;
end;
$$;

notify pgrst, 'reload schema';
