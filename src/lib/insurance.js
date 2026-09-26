/* ═══════════════════════════════════════════════════
   Travel insurance — the member's own policy
   ═══════════════════════════════════════════════════

   One row per member in public.insurance_policies, readable only by
   that member (and admins) under RLS. The certificate PDF sits in the
   private `insurance` bucket, so it is fetched through a signed URL
   minted at the moment someone taps download.

   The policy numbers are what you read out to an insurer's hotline
   after an accident, which is exactly when there is no signal — so the
   row is kept on the device and shown before the network is asked.
*/

import { supabase } from './supabase';

const BUCKET = 'insurance';
const URL_TTL = 60; // seconds — the link is used immediately or not at all
const cacheKey = (userId) => `olc-insurance:${userId}`;

const COLUMNS =
  'product, master_policy_no, reference_no, booking_no, destination, plan_type, effective_date, expiry_date, pdf_path';

/** The policy as last seen on this phone, or null. */
export function cachedPolicy(userId) {
  if (!userId) return null;
  try {
    return JSON.parse(localStorage.getItem(cacheKey(userId)) || 'null');
  } catch (e) {
    return null;
  }
}

/** The member's own policy, or null if the committee has not loaded it yet. */
export async function fetchMyPolicy(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('insurance_policies')
    .select(COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;

  try {
    if (data) localStorage.setItem(cacheKey(userId), JSON.stringify(data));
    else localStorage.removeItem(cacheKey(userId));
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
