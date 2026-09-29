-- ═══════════════════════════════════════════════════
-- Sign-up pre-check: is this email free to sign up?
-- ═══════════════════════════════════════════════════
--
-- The sign-up page runs before anyone is signed in, and a client can't
-- read auth.users, so it asks this instead. It answers one of:
--
--   'not_listed' — not on the trip list; no email is sent
--   'registered' — already has an account; sign in instead
--   'ok'         — send the magic link
--
-- "Registered" means the account has been used: an address that asked
-- for a link but never opened it is still 'ok', so it can ask again.
--
-- It says yes or no about a single address and nothing else — the same
-- fact the sign-up errors already reveal — so it is callable signed out.

create function public.signup_status(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (
      select 1 from public.allowed_emails a where a.email = lower(trim(p_email))
    ) then 'not_listed'
    when exists (
      select 1 from auth.users u
      where lower(u.email) = lower(trim(p_email))
        and (u.email_confirmed_at is not null or u.last_sign_in_at is not null)
    ) then 'registered'
    else 'ok'
  end;
$$;

revoke execute on function public.signup_status(text) from public;
grant execute on function public.signup_status(text) to anon, authenticated;
