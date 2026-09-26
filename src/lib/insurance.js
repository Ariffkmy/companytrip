/* ═══════════════════════════════════════════════════
   Travel insurance — the member's own policy
   ═══════════════════════════════════════════════════

   One row per member in public.insurance_policies, readable only by
   that member (and admins) under RLS. Rows are keyed by email, because
   the committee loads them before most members have accepted their
   invite — so a policy is already waiting the first time someone signs
   in, with nothing to backfill. The certificate PDF sits in the private
   `insurance` bucket, so it is fetched through a signed URL minted at
   the moment someone taps download.

   The policy numbers are what you read out to an insurer's hotline
   after an accident, which is exactly when there is no signal — so the
   row is kept on the device and shown before the network is asked.
*/

import { supabase } from './supabase';

const BUCKET = 'insurance';
const URL_TTL = 60; // seconds — the link is used immediately or not at all
const cacheKey = (email) => `olc-insurance:${email}`;
const normalise = (email) => String(email ?? '').trim().toLowerCase();

const COLUMNS =
  'product, master_policy_no, reference_no, booking_no, destination, plan_type, effective_date, expiry_date, pdf_path';

/** The policy as last seen on this phone, or null. */
export function cachedPolicy(userEmail) {
  const email = normalise(userEmail);
  if (!email) return null;
  try {
    return JSON.parse(localStorage.getItem(cacheKey(email)) || 'null');
  } catch (e) {
    return null;
  }
}

/** The member's own policy, or null if the committee has not loaded it yet. */
export async function fetchMyPolicy(userEmail) {
  const email = normalise(userEmail);
  if (!supabase || !email) return null;
  /* Filtered explicitly rather than leaning on RLS alone: an admin can
     read every row, and this screen is only ever about your own. */
  const { data, error } = await supabase
    .from('insurance_policies')
    .select(COLUMNS)
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;

  try {
    if (data) localStorage.setItem(cacheKey(email), JSON.stringify(data));
    else localStorage.removeItem(cacheKey(email));
  } catch (e) { /* quota — the network copy still renders */ }

  return data;
}

/** A short-lived link that opens the certificate. Throws if refused.

    No download flag: the browser renders the PDF, and saving it is then
    the reader's call rather than something that happens to them. On a
    phone a forced download often lands in a folder they then have to go
    hunting for. */
export async function certificateUrl(policy) {
  if (!supabase || !policy?.pdf_path) throw new Error('no certificate');
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(policy.pdf_path, URL_TTL);
  if (error) throw error;
  return data.signedUrl;
}

/* ── Committee side ─────────────────────────────────
   Admins only. RLS and the storage policies enforce that; these just
   stop the Admin page having to know the shape of either. */

const ADMIN_COLUMNS = `email, ${COLUMNS}, updated_at`;

/** Every policy, for the admin list. Keyed by email. */
export async function listPolicies() {
  if (!supabase) return {};
  const { data, error } = await supabase.from('insurance_policies').select(ADMIN_COLUMNS);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.email, row]));
}

/** Upload or replace one member's certificate. Returns the saved row. */
export async function uploadCertificate(userEmail, file) {
  const email = normalise(userEmail);
  if (!supabase || !email) throw new Error('no member');
  if (file.type !== 'application/pdf') throw new Error('not a pdf');

  /* A readable folder so the bucket is navigable in the Supabase
     dashboard, and a uuid filename so replacing a certificate never
     collides with a signed URL still in flight for the old one. */
  const folder = email.replace(/[^a-z0-9]+/gi, '-');
  const path = `${folder}/${crypto.randomUUID()}.pdf`;

  /* Whatever they had before, so a replacement doesn't leave someone's
     old certificate sitting in the bucket for good. */
  const { data: previous } = await supabase
    .from('insurance_policies').select('pdf_path').eq('email', email).maybeSingle();

  const store = supabase.storage.from(BUCKET);
  const up = await store.upload(path, file, { contentType: 'application/pdf' });
  if (up.error) throw up.error;

  /* Upsert, not update: a certificate can arrive before the policy
     details have been loaded, and an uploaded file with no row pointing
     at it would be unreachable — nobody could ever read it. */
  const { data, error } = await supabase
    .from('insurance_policies')
    .upsert({ email, pdf_path: path }, { onConflict: 'email' })
    .select(ADMIN_COLUMNS)
    .single();
  if (error) {
    await store.remove([path]); // don't strand the file
    throw error;
  }

  /* Only once the row points at the new file: the old one stays
     readable until the moment it is replaced, never a gap. A failed
     delete leaves an orphan nobody can reach, which is the safe way
     round to fail. */
  if (previous?.pdf_path && previous.pdf_path !== path) {
    await store.remove([previous.pdf_path]);
  }
  return data;
}

/** Drop a member's certificate, keeping their policy details. */
export async function removeCertificate(policy) {
  if (!supabase || !policy?.pdf_path) return policy;
  const { data, error } = await supabase
    .from('insurance_policies')
    .update({ pdf_path: null })
    .eq('email', policy.email)
    .select(ADMIN_COLUMNS)
    .single();
  if (error) throw error;
  /* The row is the source of truth for access, so clear it first and
     delete the file after: a failed delete leaves an orphan, not a
     readable certificate. */
  await supabase.storage.from(BUCKET).remove([policy.pdf_path]);
  return data;
}

/** 2026-10-22 → 22 Oct 2026 */
export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
