-- ═══════════════════════════════════════════════════
-- Photo bingo: one shared card per team, one snapper per tile
-- ═══════════════════════════════════════════════════
--
-- Each team has its own nine prompts (hunt_config). Who snaps each tile
-- is decided here, at random — not by an admin. The first time a team's
-- card is opened, bingo_card() shuffles the team's members over the nine
-- tiles, spread as evenly as possible (a 5-person team: four people snap
-- two, one snaps one; the Team Lead is the one who gets fewer). The draw
-- is kept, so everyone sees the same card; it is only redrawn if the
-- team's members change.
--
-- Members snap on their own phones, so the photos live here rather than
-- in one phone's localStorage. Who may put a photo on a tile:
--   · the member it was drawn for,
--   · the team's Team Lead, on any tile (backup when a member can't upload),
--   · an admin.
-- Team and role come from profiles, which members cannot edit.

-- ── Random assignment ───────────────────────────────
create table public.bingo_assignments (
  team   text not null,
  tile   smallint not null check (tile between 0 and 8),
  email  text not null,
  name   text not null,
  primary key (team, tile)
);

-- Read through bingo_card() only.
alter table public.bingo_assignments enable row level security;

-- ── Who may upload ──────────────────────────────────
-- Tile is text so storage policies can pass a path segment straight in.
create function public.can_upload_bingo(p_team text, p_tile text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me  public.profiles%rowtype;
begin
  if p_tile is null or p_tile !~ '^[0-8]$' then
    return false;
  end if;
  if public.is_admin() then
    return true;
  end if;

  select * into me from public.profiles where id = auth.uid();
  if not found or me.team is distinct from p_team then
    return false;
  end if;
  if me.role = 'Team Lead' then
    return true;
  end if;

  return exists (
    select 1 from public.bingo_assignments b
    where b.team = p_team and b.tile = p_tile::smallint and b.email = lower(me.email)
  );
end;
$$;

revoke execute on function public.can_upload_bingo(text, text) from public, anon;
grant execute on function public.can_upload_bingo(text, text) to authenticated;

-- Seeing a team's card: its own members, and admins.
create function public.can_see_bingo(p_team text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.team = p_team);
$$;

revoke execute on function public.can_see_bingo(text) from public, anon;
grant execute on function public.can_see_bingo(text) to authenticated;

-- The team's card: who snaps each tile. Draws it on first use, and
-- redraws only when the team's members no longer match the draw.
create function public.bingo_card(p_team text)
returns table (tile smallint, email text, name text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  stale boolean;
begin
  if not public.can_see_bingo(p_team) then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('bingo_card:' || p_team));

  with people as (
    select a.email from public.allowed_emails a where a.team = p_team
  ), drawn as (
    select b.email from public.bingo_assignments b where b.team = p_team
  )
  select
    (select count(*) from drawn) <> case when exists (select 1 from people) then 9 else 0 end
    or exists (select 1 from drawn d where d.email not in (select email from people))
    or ((select count(*) from people) <= 9
        and exists (select 1 from people p where p.email not in (select email from drawn)))
  into stale;

  if stale then
    delete from public.bingo_assignments b where b.team = p_team;

    insert into public.bingo_assignments (team, tile, email, name)
    with people as (
      select a.email,
             coalesce(nullif(trim(a.full_name), ''), split_part(a.email, '@', 1)) as name,
             row_number() over (order by (a.role = 'Team Lead'), random()) - 1 as k
      from public.allowed_emails a
      where a.team = p_team
    ), n as (
      select count(*) as c from people
    ), tiles as (
      select t::smallint as t, row_number() over (order by random()) - 1 as k
      from generate_series(0, 8) as t
    )
    select p_team, tiles.t, people.email, people.name
    from tiles
    cross join n
    join people on people.k = tiles.k % n.c
    where n.c > 0;
  end if;

  return query
    select b.tile, b.email, b.name from public.bingo_assignments b
    where b.team = p_team order by b.tile;
end;
$$;

revoke execute on function public.bingo_card(text) from public, anon;
grant execute on function public.bingo_card(text) to authenticated;

-- ── Shots ───────────────────────────────────────────
create table public.bingo_shots (
  team              text not null check (team in ('team-ruby', 'team-sapphire', 'team-emerald', 'team-diamond', 'team-pearl')),
  tile              smallint not null check (tile between 0 and 8),
  path              text not null unique,
  uploader_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  uploader_name     text not null default '',
  -- True when someone other than the member drawn for the tile uploaded it
  -- (a Team Lead covering for a member, or an admin).
  on_behalf         boolean not null default false,
  created_at        timestamptz not null default now(),
  primary key (team, tile)
);

alter table public.bingo_shots enable row level security;

create policy "Team members can see their bingo card"
  on public.bingo_shots for select
  to authenticated
  using ((select public.can_see_bingo(team)));

create policy "Assigned members can add a bingo shot"
  on public.bingo_shots for insert
  to authenticated
  with check ((select public.can_upload_bingo(team, tile::text)));

create policy "Assigned members can remove a bingo shot"
  on public.bingo_shots for delete
  to authenticated
  using ((select public.can_upload_bingo(team, tile::text)));

-- Uploader, time and the on-behalf flag come from the server.
create function public.stamp_bingo_shot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  public.profiles%rowtype;
begin
  select * into me from public.profiles where id = auth.uid();

  new.uploader_id := auth.uid();
  new.created_at := now();
  new.uploader_name := coalesce(nullif(trim(me.full_name), ''), split_part(me.email, '@', 1), 'Trip member');
  new.on_behalf := not exists (
    select 1 from public.bingo_assignments b
    where b.team = new.team and b.tile = new.tile and b.email = lower(me.email)
  );
  return new;
end;
$$;

create trigger stamp_bingo_shot
  before insert on public.bingo_shots
  for each row execute function public.stamp_bingo_shot();

revoke execute on function public.stamp_bingo_shot() from public, anon, authenticated;

-- ── Storage ─────────────────────────────────────────
-- Private bucket; paths are `<team>/<tile>/<uuid>.jpg`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bingo', 'bingo', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Team members can view bingo files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'bingo' and (select public.can_see_bingo((storage.foldername(name))[1])));

create policy "Assigned members can upload bingo files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bingo'
    and (select public.can_upload_bingo((storage.foldername(name))[1], (storage.foldername(name))[2]))
  );

create policy "Assigned members can delete bingo files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'bingo'
    and (select public.can_upload_bingo((storage.foldername(name))[1], (storage.foldername(name))[2]))
  );
