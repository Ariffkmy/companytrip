-- ══════════════════════════════════════════════════════════════════════
-- Announcements: the committee's alerts to everyone
-- ══════════════════════════════════════════════════════════════════════
--
-- An admin writes a message (Admin → Announce) and it pops up at once on
-- every phone with the app open, through Supabase Realtime. Phones that
-- were closed see it the next time the app opens (src/lib/announcements.js
-- shows anything from the last 24 hours that phone hasn't dismissed).
--
-- level: 'info' for a notice, 'urgent' for an emergency (red, louder).
--
-- Safe to re-run.

create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  level       text not null default 'info' check (level in ('info', 'urgent')),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  author_name text,
  created_at  timestamptz not null default now()
);

create index if not exists announcements_created on public.announcements (created_at desc);

comment on table public.announcements is
  'Committee alerts, shown as a popup on every member''s phone (Admin → Announce).';

-- Who sent it and when come from the server, not the phone.
create or replace function public.announcements_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  new.author_name := (select p.full_name from public.profiles p where p.id = auth.uid());
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists announcements_stamp on public.announcements;
create trigger announcements_stamp
  before insert on public.announcements
  for each row execute function public.announcements_stamp();

alter table public.announcements enable row level security;

drop policy if exists "Announcements: members read" on public.announcements;
create policy "Announcements: members read"
  on public.announcements for select to authenticated
  using (true);

drop policy if exists "Announcements: admins send" on public.announcements;
create policy "Announcements: admins send"
  on public.announcements for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "Announcements: admins delete" on public.announcements;
create policy "Announcements: admins delete"
  on public.announcements for delete to authenticated
  using ((select public.is_admin()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'announcements'
  ) then
    alter publication supabase_realtime add table public.announcements;
  end if;
end;
$$;

notify pgrst, 'reload schema';
