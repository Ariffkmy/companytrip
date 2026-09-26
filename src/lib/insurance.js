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

/* A filename the member will recognise in their downloads folder,
   rather than the uuid-shaped storage path. */
function fileName(policy) {
  const tag = policy.reference_no || policy.master_policy_no || 'policy';
  return `Travel-Insurance-${tag.replace(/[^\w-]+/g, '-')}.pdf`;
}

/** A short-lived link that downloads the certificate. Throws if refused. */
export async function certificateUrl(policy) {
  if (!supabase || !policy?.pdf_path) throw new Error('no certificate');
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(policy.pdf_path, URL_TTL, { download: fileName(policy) });
  if (error) throw error;
  return data.signedUrl;
}

/** 2026-10-22 → 22 Oct 2026 */
export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
