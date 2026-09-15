-- ═══════════════════════════════════════════════════
-- Admins: committee members who manage the trip list
-- ═══════════════════════════════════════════════════
--
-- Admin is a flag on the allowlist row, so there is one place to grant
-- or revoke it. It is separate from `role` (Team Lead / JP Speaker /
-- Member), which describes the trip, not app permissions.
--
-- Make someone an admin (SQL editor):
--   update public.allowed_emails set is_admin = true
--   where email = 'someone@company.com';

alter table public.allowed_emails
  add column is_admin boolean not null default false;

-- True when the signed-in user's email is an admin on the allowlist.
-- security definer: allowed_emails has no client-readable policies, so
-- the check must run with the owner's rights. Returns a boolean only,
-- never the list itself.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.allowed_emails a
    where a.email = lower((select auth.jwt()) ->> 'email')
      and a.is_admin
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Admins can read and manage the allowlist from the app. Everyone else
-- still gets nothing (RLS stays on; these are the only policies).
create policy "Admins can read the allowlist"
  on public.allowed_emails for select
  to authenticated
  using ((select public.is_admin()));

create policy "Admins can add to the allowlist"
  on public.allowed_emails for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins can edit the allowlist"
  on public.allowed_emails for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins can remove from the allowlist"
  on public.allowed_emails for delete
  to authenticated
  using ((select public.is_admin()));
