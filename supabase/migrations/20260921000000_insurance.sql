-- ═══════════════════════════════════════════════════
-- Travel insurance: one policy per trip member
-- ═══════════════════════════════════════════════════
--
-- The committee buys the cover and holds every certificate, so rows and
-- PDFs are written by admins only; a member can read their own policy
-- and nobody else's. That is stricter than the album (which the whole
-- trip can see) because a certificate carries personal details.
--
-- The PDF lives in the private `insurance` bucket at
-- `<member uid>/<anything>.pdf`, mirroring the album's folder-per-user
-- convention, and is served through a short-lived signed URL.
--
-- Load policies with (SQL editor, service role):
--   insert into public.insurance_policies
--     (user_id, product, master_policy_no, reference_no, booking_no,
--      destination, plan_type, effective_date, expiry_date, pdf_path)
--   select p.id, 'AirAsia Travel Comprehensive Gold', '79-796-25-000505',
--          'MYO-PLUS-26-0016531', 'E7M74Y', 'Japan',
--          'Offline International (Area 3) Return (1-10 days)',
--          '2026-10-22', '2026-10-27', p.id || '/policy.pdf'
--   from public.profiles p where p.email = 'someone@orangeleaf.com';

create table public.insurance_policies (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references auth.users (id) on delete cascade,
  product           text not null default '',
  master_policy_no  text,
  reference_no      text,
  booking_no        text,
  destination       text,
  plan_type         text,
  effective_date    date,
  expiry_date       date,
  -- Null until the certificate is uploaded: the details are useful on
  -- their own, so the section shows them without a file.
  pdf_path          text unique,
  updated_at        timestamptz not null default now()
);

alter table public.insurance_policies enable row level security;

create policy "Members can read their own policy"
  on public.insurance_policies for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

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

create policy "Members can read their own certificate"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'insurance'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
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
