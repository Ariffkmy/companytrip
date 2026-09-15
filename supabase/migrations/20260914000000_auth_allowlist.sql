-- ═══════════════════════════════════════════════════
-- Auth: invite-only sign-up for the trip app
-- ═══════════════════════════════════════════════════
--
-- Accounts are created by committee invite (dashboard → Invite user).
-- As a second lock, only emails in public.allowed_emails can exist at
-- all: a BEFORE INSERT trigger on auth.users refuses any other address,
-- whether it arrives via invite, the Admin API, or a sign-up call.
--
-- Add people with (SQL editor, service role):
--   insert into public.allowed_emails (email, full_name, team, role)
--   values ('someone@orangeleaf.com', 'Someone', 'Team 1', 'Member');

-- ── Allowlist ───────────────────────────────────────
create table public.allowed_emails (
  email      text primary key check (email = lower(email)),
  full_name  text,
  team       text,
  role       text not null default 'Member',
  added_at   timestamptz not null default now()
);

comment on table public.allowed_emails is
  'Emails permitted to sign up. Managed by the committee via the dashboard; never readable by clients.';

-- RLS on with no policies: anon and authenticated can neither read nor
-- write it, so the list cannot be used to enumerate participants.
alter table public.allowed_emails enable row level security;

-- ── Profiles ────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  team        text,
  role        text not null default 'Member',
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Any signed-in trip member can see the roster.
create policy "Members can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

-- Members may edit their own display name only; team and role stay
-- committee-controlled (column-level grant below).
create policy "Members can update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- ── Gate: refuse sign-up for emails not on the list ─
create function public.enforce_email_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.allowed_emails a
    where a.email = lower(new.email)
  ) then
    raise exception 'email_not_allowed'
      using errcode = 'P0001',
            hint = 'This email is not on the trip list.';
  end if;
  return new;
end;
$$;

create trigger enforce_email_allowlist
  before insert on auth.users
  for each row execute function public.enforce_email_allowlist();

-- ── Create a profile for every new user ─────────────
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, team, role)
  select new.id, lower(new.email), a.full_name, a.team, coalesce(a.role, 'Member')
  from public.allowed_emails a
  where a.email = lower(new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger functions are never meant to be called over the API.
revoke execute on function public.enforce_email_allowlist() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
