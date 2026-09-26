/* ═══════════════════════════════════════════════════
   Trip invites — sent by the `invite-members` Edge Function
   ═══════════════════════════════════════════════════

   Sending an invite needs the service-role key, so the app asks the
   function to do it. The function checks the caller is an admin and
   only invites emails already on the trip list.
*/

import { supabase } from './supabase';

const BATCH = 100;

/* Invite links must never point at a dev server: the person clicking is
   on their own phone, where localhost is their phone.

   Sent from the deployed app the live origin is by definition right,
   and it keeps working if the domain ever changes. Only a local dev
   server has to be told where the real site is, and the constant below
   is the last resort for that.

   Whatever this resolves to must also be listed under Supabase →
   Authentication → URL Configuration → Redirect URLs. An unlisted URL
   is not an error: Supabase quietly falls back to the project's Site
   URL, which is how an invite ends up pointing at localhost. */
const LIVE_SITE = 'https://olc-companytrip.vercel.app';
const onDevServer = /^(localhost|127\.|\[?::1)/i.test(globalThis.location?.hostname ?? '');
const SITE_URL = import.meta.env.VITE_SITE_URL
  || (onDevServer ? LIVE_SITE : globalThis.location?.origin)
  || LIVE_SITE;

/** Invite one or many emails. Resolves to [{ email, status, message? }]
    with status 'sent' | 'joined' | 'not_on_list' | 'error'. */
export async function sendInvites(emails, onProgress) {
  const redirectTo = SITE_URL;
  const results = [];
  for (let i = 0; i < emails.length; i += BATCH) {
    const chunk = emails.slice(i, i + BATCH);
    const { data, error } = await supabase.functions.invoke('invite-members', {
      body: { emails: chunk, redirectTo },
    });
    if (error) {
      let reason = error.message;
      try { reason = (await error.context?.json())?.error ?? reason; } catch { /* keep message */ }
      chunk.forEach((email) => results.push({ email, status: 'error', message: reason }));
    } else {
      results.push(...data.results);
    }
    onProgress?.(results.length, emails.length);
  }
  return results;
}

/* Supabase's messages, in words an admin can act on. */
export function inviteProblem(message = '') {
  if (/rate limit/i.test(message)) return 'Email limit reached — wait an hour or set up custom SMTP in Supabase.';
  if (/not_admin/i.test(message)) return 'Your account isn’t an admin.';
  if (/already been registered|already exists/i.test(message)) return 'Already has an account.';
  if (/Failed to send a request|fetch|network/i.test(message)) return 'Couldn’t reach the invite service — is it deployed?';
  return message || 'Couldn’t send.';
}
