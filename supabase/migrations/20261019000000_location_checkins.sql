-- ══════════════════════════════════════════════════════════════════════
-- Safety check-ins: where everyone is during the hunt
-- ══════════════════════════════════════════════════════════════════════
--
-- While the hunt is open (and not stopped), every member of a hunt group
-- gets a popup every 15 minutes asking them to share their location
-- (src/components/Checkins.jsx). Each answer is a row here: the
-- position, or why there isn't one (location blocked, or the phone
-- couldn't find it). Admin → Check-ins shows everyone's latest on a map
-- and flags anyone overdue.
--
-- Privacy: only admins read other people's rows; each person can read
-- their own. Nothing is collected outside the hunt. Admins can delete
-- all of it from the same page after the trip.
--
-- Safe to re-run.

create table if not exists public.location_checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  full_name  text,
  team       text,
  status     text not null default 'ok' check (status in ('ok', 'denied', 'unavailable')),
  lat        double precision check (lat between -90 and 90),
  lng        double precision check (lng between -180 and 180),
  accuracy   real,
  -- When the phone took the reading; it may send it later, out of signal.
  taken_at   timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint location_checkins_ok_has_position check (status <> 'ok' or (lat is not null and lng is not null))
);

create index if not exists location_checkins_user_taken on public.location_checkins (user_id, taken_at desc);
create index if not exists location_checkins_taken on public.location_checkins (taken_at desc);

comment on table public.location_checkins is
  'Hunt safety check-ins: each member''s shared location every 15 minutes. Admins read all; members their own.';

-- Who and which group come from the server, not the phone. A reading
-- can arrive late (no signal) but not from the future, nor from hours ago.
create or replace function public.location_checkins_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  select p.full_name, p.hunt_group into new.full_name, new.team
  from public.profiles p where p.id = new.user_id;
  new.created_at := now();
  new.taken_at := greatest(least(coalesce(new.taken_at, now()), now()), now() - interval '6 hours');
  return new;
end;
$$;

drop trigger if exists location_checkins_stamp on public.location_checkins;
create trigger location_checkins_stamp
  before insert on public.location_checkins
  for each row execute function public.location_checkins_stamp();

alter table public.location_checkins enable row level security;

drop policy if exists "Check-ins: members add their own" on public.location_checkins;
create policy "Check-ins: members add their own"
  on public.location_checkins for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Check-ins: admins read all, members their own" on public.location_checkins;
create policy "Check-ins: admins read all, members their own"
  on public.location_checkins for select to authenticated
  using ((select public.is_admin()) or user_id = (select auth.uid()));

drop policy if exists "Check-ins: admins delete" on public.location_checkins;
create policy "Check-ins: admins delete"
  on public.location_checkins for delete to authenticated
  using ((select public.is_admin()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'location_checkins'
  ) then
    alter publication supabase_realtime add table public.location_checkins;
  end if;
end;
$$;

notify pgrst, 'reload schema';
