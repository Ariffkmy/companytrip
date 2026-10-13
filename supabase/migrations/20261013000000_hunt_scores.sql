-- ══════════════════════════════════════════════════════════════════════
-- Treasure hunt: a scoreboard the committee can see from its own phone
-- ══════════════════════════════════════════════════════════════════════
--
-- A team's run lives on its leader's phone (localStorage), so Admin →
-- Organiser could only ever score the runs played on the admin's own
-- device. Each leader's phone now copies its run here as it plays — the
-- stamps, answers and photos (into hunt-photos) — and the organiser scores
-- every group from these rows.
--
-- Run after 20261012000000_hunt_leader.sql: writing a row is for the
-- group's hunt leader (is_hunt_leader) or an admin.
--
-- The committee's own calls — the judged awards, and marking the Look
-- around you answers the game can't check itself — go in
-- hunt_config.judging, a column like is_open and clock_reset_at, so the
-- editor's whole-draft save never undoes them.
--
-- Safe to re-run.

-- ── One row per group: its run as last synced ─────────────────────────
create table if not exists public.hunt_scores (
  team_id    text primary key,
  run        jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.hunt_scores is
  'Each hunt group''s run, copied from its leader''s phone with photo paths. Scored in the app against hunt_config.';

create or replace function public.touch_hunt_scores()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_hunt_scores on public.hunt_scores;
create trigger touch_hunt_scores
  before insert or update on public.hunt_scores
  for each row execute function public.touch_hunt_scores();

alter table public.hunt_scores enable row level security;

-- ── Publishing the results ────────────────────────────────────────────
-- Off until the committee publishes from Admin → Organiser. Then every
-- member sees every group's scores, answers and photos on Home.
alter table public.hunt_config
  add column if not exists results_published boolean not null default false;

comment on column public.hunt_config.results_published is
  'Committee switch. When true, every member can see every group''s hunt results.';

create or replace function public.hunt_results_published()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.results_published from public.hunt_config c where c.id = 'atami'), false);
$$;

revoke execute on function public.hunt_results_published() from public, anon;
grant execute on function public.hunt_results_published() to authenticated;

-- The leader sees its own group's row (an upsert needs to), admins see
-- all, and everyone sees all once the results are published.
drop policy if exists "Admins and the group leader can read hunt scores" on public.hunt_scores;
create policy "Admins and the group leader can read hunt scores"
  on public.hunt_scores for select to authenticated
  using ((select public.is_admin()) or public.is_hunt_leader(team_id) or (select public.hunt_results_published()));

drop policy if exists "The group leader can add its hunt score" on public.hunt_scores;
create policy "The group leader can add its hunt score"
  on public.hunt_scores for insert to authenticated
  with check ((select public.is_admin()) or public.is_hunt_leader(team_id));

drop policy if exists "The group leader can update its hunt score" on public.hunt_scores;
create policy "The group leader can update its hunt score"
  on public.hunt_scores for update to authenticated
  using ((select public.is_admin()) or public.is_hunt_leader(team_id))
  with check ((select public.is_admin()) or public.is_hunt_leader(team_id));

drop policy if exists "Admins can delete hunt scores" on public.hunt_scores;
create policy "Admins can delete hunt scores"
  on public.hunt_scores for delete to authenticated
  using ((select public.is_admin()));

grant select, insert, update, delete on public.hunt_scores to authenticated;

-- ── The committee's judging ───────────────────────────────────────────
-- { awards: { pose|buy: team_id }, first: team_id|null (null = automatic),
--   cp4: { team_id: { "0": true, … } } }
-- Covered by the existing hunt_config policies: members read, admins write.
alter table public.hunt_config
  add column if not exists judging jsonb not null default '{}'::jsonb;

comment on column public.hunt_config.judging is
  'Organiser calls: judged awards per group, and right/wrong marks on Look around you answers.';

-- ── The games' photos ─────────────────────────────────────────────────
-- Pose, selfie, Buy it try it and boss photos, uploaded by the leader's
-- phone at `<team_id>/<hash>.jpg` as it syncs. Private: the group's
-- leader and admins, and everyone once the results are published.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hunt-photos', 'hunt-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Hunt photos: leader, admins, or published" on storage.objects;
create policy "Hunt photos: leader, admins, or published"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'hunt-photos'
    and ((select public.is_admin())
      or public.is_hunt_leader((storage.foldername(name))[1])
      or (select public.hunt_results_published()))
  );

drop policy if exists "Hunt photos: the group leader uploads" on storage.objects;
create policy "Hunt photos: the group leader uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'hunt-photos'
    and ((select public.is_admin()) or public.is_hunt_leader((storage.foldername(name))[1]))
  );

drop policy if exists "Hunt photos: the group leader replaces" on storage.objects;
create policy "Hunt photos: the group leader replaces"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'hunt-photos'
    and ((select public.is_admin()) or public.is_hunt_leader((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'hunt-photos'
    and ((select public.is_admin()) or public.is_hunt_leader((storage.foldername(name))[1]))
  );

drop policy if exists "Hunt photos: admins delete" on storage.objects;
create policy "Hunt photos: admins delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'hunt-photos' and (select public.is_admin()));

-- ── Photo bingo, once published ───────────────────────────────────────
-- Normally a group only sees its own card (can_see_bingo). These add to
-- that: once the results are out, everyone sees every card.
drop policy if exists "Everyone sees bingo once results are published" on public.bingo_shots;
create policy "Everyone sees bingo once results are published"
  on public.bingo_shots for select to authenticated
  using ((select public.hunt_results_published()));

drop policy if exists "Everyone sees bingo files once results are published" on storage.objects;
create policy "Everyone sees bingo files once results are published"
  on storage.objects for select to authenticated
  using (bucket_id = 'bingo' and (select public.hunt_results_published()));

-- Let the API see the new table and columns straight away.
notify pgrst, 'reload schema';
