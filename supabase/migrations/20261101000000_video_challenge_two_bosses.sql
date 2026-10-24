-- ══════════════════════════════════════════════════════════════════════
-- Treasure hunt: Atami Video Challenge — Tim and Ellice each rate
-- ══════════════════════════════════════════════════════════════════════
--
-- Each boss now gives every video their own 1–10 mark. A group's score
-- for a video is the average of the two, and its stamp lands once both
-- bosses have rated both videos (the app does the averaging).
--
-- So pitch_ratings becomes one row per group, per video, per rater.
-- A boss rating again replaces their own mark, never the other boss's.
--
-- Run after 20261031000000_video_challenge.sql. Safe to re-run.

-- A rating with no rater can't be told apart from the other boss's.
delete from public.pitch_ratings where rated_by is null;

alter table public.pitch_ratings alter column rated_by set default auth.uid();
alter table public.pitch_ratings alter column rated_by set not null;

-- The rater is part of the key now, so it can't be nulled out.
alter table public.pitch_ratings drop constraint if exists pitch_ratings_rated_by_fkey;
alter table public.pitch_ratings
  add constraint pitch_ratings_rated_by_fkey
  foreign key (rated_by) references public.profiles (id) on delete cascade;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pitch_ratings'::regclass and contype = 'p'
      and conname = 'pitch_ratings_pkey'
      and array_length(conkey, 1) = 2
  ) then
    alter table public.pitch_ratings drop constraint pitch_ratings_pkey;
    alter table public.pitch_ratings add constraint pitch_ratings_pkey primary key (team, challenge, rated_by);
  end if;
end;
$$;

comment on table public.pitch_ratings is
  'Atami Video Challenge (treasure hunt): each boss''s 1–10 mark for each group''s two videos (pitch = Buy it, try it; geo = Atami Geographic). The score is the average.';

-- The rater is whoever is signed in, fixed when the mark is first
-- given: changing a mark keeps who gave it.
create or replace function public.pitch_ratings_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.rated_by := auth.uid();
    new.rater_name := (select p.full_name from public.profiles p where p.id = auth.uid());
  else
    new.rated_by := old.rated_by;
    new.rater_name := old.rater_name;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- A boss changes only their own mark; admins can change any.
drop policy if exists "Pitch ratings: bosses change a rating" on public.pitch_ratings;
create policy "Pitch ratings: bosses change a rating"
  on public.pitch_ratings for update to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_hunt_boss()) and rated_by = (select auth.uid()))
  )
  with check (
    (select public.is_admin())
    or ((select public.is_hunt_boss()) and rated_by = (select auth.uid()))
  );

notify pgrst, 'reload schema';
