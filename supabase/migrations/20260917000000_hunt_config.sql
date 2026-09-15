-- ═══════════════════════════════════════════════════
-- Treasure hunt content, editable by admins
-- ═══════════════════════════════════════════════════
--
-- One JSON document holds every question, prompt and reference photo
-- URL for the Atami hunt. The app ships the original content as
-- defaults and merges this document over it, so an empty or partial
-- config still plays.

create table public.hunt_config (
  id          text primary key default 'atami' check (id = 'atami'),
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references auth.users (id) on delete set null
);

alter table public.hunt_config enable row level security;

-- Every trip member needs to read it to play.
create policy "Members can read the hunt config"
  on public.hunt_config for select
  to authenticated
  using (true);

create policy "Admins can create the hunt config"
  on public.hunt_config for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins can edit the hunt config"
  on public.hunt_config for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create function public.touch_hunt_config()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger touch_hunt_config
  before update on public.hunt_config
  for each row execute function public.touch_hunt_config();

-- ── Reference photos ────────────────────────────────
-- Public bucket: players' phones load these by URL (and the service
-- worker caches them for offline). File names are random UUIDs, so a
-- team can't browse to another team's spot photo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hunt-media', 'hunt-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Admins can upload hunt media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'hunt-media' and (select public.is_admin()));

create policy "Admins can replace hunt media"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'hunt-media' and (select public.is_admin()))
  with check (bucket_id = 'hunt-media' and (select public.is_admin()));

create policy "Admins can delete hunt media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'hunt-media' and (select public.is_admin()));
