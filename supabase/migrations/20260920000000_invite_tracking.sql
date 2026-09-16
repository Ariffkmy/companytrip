-- ═══════════════════════════════════════════════════
-- Invites sent from the Admin page
-- ═══════════════════════════════════════════════════
--
-- Invite emails are sent by the `invite-members` Edge Function (it holds
-- the service-role key, which the app never sees). It stamps these
-- columns so admins can tell who has been invited, and when.

alter table public.allowed_emails
  add column invited_at   timestamptz,
  add column invite_count integer not null default 0;
