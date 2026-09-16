// ═══════════════════════════════════════════════════
// invite-members — send trip invites from the Admin page
// ═══════════════════════════════════════════════════
//
// POST { emails: string[], redirectTo?: string }
//   → { results: [{ email, status, message? }] }
//   status: 'sent' | 'joined' | 'not_on_list' | 'error'
//
// Only admins (public.is_admin) may call it, and only emails already on
// public.allowed_emails are invited — the allowlist trigger would refuse
// anyone else anyway. Invites are sent one at a time so one bad address
// doesn't sink a bulk send.
//
// redirectTo must be listed under Authentication → URL Configuration →
// Redirect URLs, or Supabase falls back to the Site URL.
//
// Deploy: supabase functions deploy invite-members

import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_PER_CALL = 100;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Check the caller with their own token.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error: adminErr } = await caller.rpc('is_admin');
  if (adminErr || isAdmin !== true) return json({ error: 'not_admin' }, 403);

  let body: { emails?: unknown; redirectTo?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const emails = Array.isArray(body.emails)
    ? [...new Set(body.emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean))]
    : [];
  if (!emails.length) return json({ error: 'no_emails' }, 400);
  if (emails.length > MAX_PER_CALL) return json({ error: 'too_many', max: MAX_PER_CALL }, 400);
  const redirectTo = typeof body.redirectTo === 'string' && /^https?:\/\//.test(body.redirectTo) ? body.redirectTo : undefined;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const [{ data: listed, error: listErr }, { data: profiles, error: profErr }] = await Promise.all([
    admin.from('allowed_emails').select('email, full_name, invite_count').in('email', emails),
    admin.from('profiles').select('email').in('email', emails),
  ]);
  if (listErr || profErr) return json({ error: 'lookup_failed' }, 500);

  const onList = new Map((listed ?? []).map((r) => [r.email, r]));
  const joined = new Set((profiles ?? []).map((p) => p.email));

  const results = [];
  for (const email of emails) {
    const row = onList.get(email);
    if (!row) { results.push({ email, status: 'not_on_list' }); continue; }
    if (joined.has(email)) { results.push({ email, status: 'joined' }); continue; }

    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: row.full_name ? { full_name: row.full_name } : undefined,
    });
    if (error) {
      results.push({ email, status: 'error', message: error.message });
      continue;
    }
    await admin.from('allowed_emails')
      .update({ invited_at: new Date().toISOString(), invite_count: (row.invite_count ?? 0) + 1 })
      .eq('email', email);
    results.push({ email, status: 'sent' });
  }

  return json({ results });
});
