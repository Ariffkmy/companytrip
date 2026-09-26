-- ═══════════════════════════════════════════════════
-- Travel insurance: one policy per trip member
-- ═══════════════════════════════════════════════════
--
-- Keyed by email, not by user id, because the committee buys the cover
-- and loads these rows long before most members accept their invite.
-- An auth.users row only exists once someone has signed up, so keying
-- on it would mean loading nothing now and backfilling each person as
-- they join. Email is what public.allowed_emails already uses — the
-- fixed list of who is coming — so a policy loaded today simply starts
-- resolving the moment that person signs in. Nothing to backfill and no
-- trigger to keep in step.
--
-- Rows and PDFs are written by admins only; a member reads their own
-- policy and nobody else's. That is stricter than the album (which the
-- whole trip can see) because a certificate carries personal details.
-- Identity is the signed-in email, matching public.is_admin().
--
-- Load policies with (SQL editor, service role):
--   insert into public.insurance_policies
--     (email, product, master_policy_no, reference_no, booking_no,
--      destination, plan_type, effective_date, expiry_date, pdf_path)
--   values
--     ('someone@orangeleaf.com', 'AirAsia Travel Comprehensive Gold',
--      '79-796-25-000505', 'MYO-PLUS-26-0016531', 'E7M74Y', 'Japan',
--      'Offline International (Area 3) Return (1-10 days)',
--      '2026-10-22', '2026-10-27', 'MYO-PLUS-26-0016531.pdf');

create table public.insurance_policies (
  -- References the allowlist so a policy cannot be loaded against an
  -- address that is not on the trip: a typo fails loudly here rather
  -- than silently never showing up for anyone.
  email             text primary key
                    check (email = lower(email))
                    references public.allowed_emails (email)
                    on update cascade on delete cascade,
  product           text not null default '',
  master_policy_no  text,
  reference_no      text,
  booking_no        text,
  destination       text,
  plan_type         text,
  effective_date    date,
  expiry_date       date,
  -- The object name in the private `insurance` bucket. Null until the
  -- certificate is uploaded: the numbers are useful on their own, so
  -- the app shows them without a file. Naming is free — who may read a
  -- file is decided by this table, not by the path.
  pdf_path          text unique,
  updated_at        timestamptz not null default now()
);

alter table public.insurance_policies enable row level security;

create policy "Members can read their own policy"
  on public.insurance_policies for select
  to authenticated
  using (
    email = lower((select auth.jwt()) ->> 'email')
    or (select public.is_admin())
  );

create policy "Admins manage policies"
  on public.insurance_policies for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create function public.touch_insurance_policy()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_insurance_policy
  before update on public.insurance_policies
  for each row execute function public.touch_insurance_policy();

revoke execute on function public.touch_insurance_policy() from public, anon, authenticated;

-- ── Storage ─────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('insurance', 'insurance', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Ownership of a certificate is whatever the table says, so the file
-- can be named anything and uploaded before its owner has an account.
-- Security definer: it answers one yes/no question about the caller and
-- one object, so it does not need the caller to be able to read the
-- table itself.
create function public.owns_insurance_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.insurance_policies ip
    where ip.pdf_path = object_name
      and ip.email = lower((select auth.jwt()) ->> 'email')
  );
$$;

revoke execute on function public.owns_insurance_file(text) from public, anon;
grant execute on function public.owns_insurance_file(text) to authenticated;

create policy "Members can read their own certificate"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'insurance'
    and (public.owns_insurance_file(name) or (select public.is_admin()))
  );

create policy "Admins can upload certificates"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'insurance' and (select public.is_admin()));

create policy "Admins can replace certificates"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'insurance' and (select public.is_admin()))
  with check (bucket_id = 'insurance' and (select public.is_admin()));

create policy "Admins can delete certificates"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'insurance' and (select public.is_admin()));
