-- ══════════════════════════════════════════════════════════════════════
-- Treasure hunt: Buy it, try it — the bosses rate the pitch from their inbox
-- ══════════════════════════════════════════════════════════════════════
--
-- A group buys something and tries to sell it to Tim and Ellice. The
-- boss who heard the pitch rates it 1 to 10 in the Boss inbox; the
-- group's phone hears the rating live and collects the stamp with it.
--
-- One row per group: rating again replaces it (a slip, a second pitch).
-- Who rated and when are stamped from profiles, not from the phone.
--
-- Run after 20261022000000_boss_moves.sql. Safe to re-run.

create table if not exists public.pitch_ratings (
  team        text primary key check (team in ('group-a', 'group-b', 'group-c', 'group-d')),
  rating      int  not null check (rating between 1 and 10),
  rated_by    uuid references public.profiles (id) on delete set null,
  rater_name  text,
  updated_at  timestamptz not null default now()
);

comment on table public.pitch_ratings is
  'Buy it, try it (treasure hunt): the bosses'' 1–10 rating of each group''s pitch.';

create or replace function public.pitch_ratings_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.rated_by := auth.uid();
  new.rater_name := (select p.full_name from public.profiles p where p.id = auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pitch_ratings_stamp on public.pitch_ratings;
create trigger pitch_ratings_stamp
  before insert or update on public.pitch_ratings
  for each row execute function public.pitch_ratings_stamp();

alter table public.pitch_ratings enable row level security;

-- A group sees its own rating; bosses and admins see every group's;
-- everyone sees them once the results are published.
drop policy if exists "Pitch ratings: who can read" on public.pitch_ratings;
create policy "Pitch ratings: who can read"
  on public.pitch_ratings for select to authenticated
  using (
    team = (select public.my_hunt_group())
    or (select public.is_hunt_boss())
    or (select public.is_admin())
    or (select public.hunt_results_published())
  );

-- Only bosses and admins rate.
drop policy if exists "Pitch ratings: bosses rate" on public.pitch_ratings;
create policy "Pitch ratings: bosses rate"
  on public.pitch_ratings for insert to authenticated
  with check ((select public.is_admin()) or (select public.is_hunt_boss()));

drop policy if exists "Pitch ratings: bosses change a rating" on public.pitch_ratings;
create policy "Pitch ratings: bosses change a rating"
  on public.pitch_ratings for update to authenticated
  using ((select public.is_admin()) or (select public.is_hunt_boss()))
  with check ((select public.is_admin()) or (select public.is_hunt_boss()));

drop policy if exists "Pitch ratings: admins delete" on public.pitch_ratings;
create policy "Pitch ratings: admins delete"
  on public.pitch_ratings for delete to authenticated
  using ((select public.is_admin()));

-- ── Live updates ──────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pitch_ratings'
  ) then
    alter publication supabase_realtime add table public.pitch_ratings;
  end if;
end;
$$;

-- ── Reset for the real game also clears the ratings ───────────────────
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
  if to_regclass('public.pitch_ratings') is not null then
    delete from public.pitch_ratings where true;
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
