-- ══════════════════════════════════════════════════════════════════════
-- Treasure hunt: Atami Video Challenge — two videos, two ratings
-- ══════════════════════════════════════════════════════════════════════
--
-- Game 4 was Buy it, try it: one pitch video, one rating. It is now the
-- Atami Video Challenge, with two parts:
--   pitch  Buy it, try it — buy anything, sell it to the bosses.
--   geo    Atami Geographic — a nature documentary about an animal
--          Atami is famous for, the group's choice.
-- Each part has its own video and its own 1–10 rating from the Boss
-- inbox, so both tables gain a `challenge` column. Rows from before
-- this migration are pitches.
--
-- pitch_ratings becomes one row per group per part: rating a part again
-- still replaces that part's rating.
--
-- Run after 20261028000000_pitch_videos.sql. Safe to re-run.

-- ── Ratings ───────────────────────────────────────────────────────────
alter table public.pitch_ratings
  add column if not exists challenge text not null default 'pitch';

alter table public.pitch_ratings drop constraint if exists pitch_ratings_challenge_check;
alter table public.pitch_ratings
  add constraint pitch_ratings_challenge_check check (challenge in ('pitch', 'geo'));

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pitch_ratings'::regclass and contype = 'p'
      and conname = 'pitch_ratings_pkey'
      and array_length(conkey, 1) = 1
  ) then
    alter table public.pitch_ratings drop constraint pitch_ratings_pkey;
    alter table public.pitch_ratings add constraint pitch_ratings_pkey primary key (team, challenge);
  end if;
end;
$$;

comment on table public.pitch_ratings is
  'Atami Video Challenge (treasure hunt): the bosses'' 1–10 rating of each group''s two videos (pitch = Buy it, try it; geo = Atami Geographic).';

-- ── Videos ────────────────────────────────────────────────────────────
alter table public.pitch_videos
  add column if not exists challenge text not null default 'pitch';

alter table public.pitch_videos drop constraint if exists pitch_videos_challenge_check;
alter table public.pitch_videos
  add constraint pitch_videos_challenge_check check (challenge in ('pitch', 'geo'));

create index if not exists pitch_videos_team_challenge_created
  on public.pitch_videos (team, challenge, created_at);

comment on table public.pitch_videos is
  'Atami Video Challenge (treasure hunt): a group''s videos (pitch = Buy it, try it; geo = Atami Geographic).';

notify pgrst, 'reload schema';
