/* Hallmark · component: auth screen · genre: editorial · theme: project-owned
 * (Anton + Inter + JetBrains Mono · red/flame) — shares Home's Workbench fingerprint:
 * bottom-aligned heading · oversized solid CTA · no imagery
 * states: default · hover · focus · active · disabled · loading · error · success
 */

import { useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';

/* Supabase error text is written for developers. Each of these is what a
   participant can actually do next. */
function friendlyError(error) {
  const msg = error?.message ?? '';
  if (error?.name === 'AuthRetryableFetchError' || /fetch|network/i.test(msg)) {
    return 'No connection. Signing in needs internet the first time.';
  }
  if (/invalid login credentials/i.test(msg)) return 'Email or password doesn’t match.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first. The link is in your inbox.';
  if (/rate limit/i.test(msg)) return 'Too many attempts. Wait a few minutes and try again.';
  if (/same.*password|different from the old/i.test(msg)) return 'Pick a password you haven’t used here before.';
  if (/weak|at least/i.test(msg)) return 'Password is too weak. Use 8 or more characters.';
  return 'Something went wrong. Try again.';
}

const COPY = {
  signin: { title: 'Sign', accent: 'in', lede: 'Trip members only.', cta: 'Sign in', busy: 'Signing in…' },
  forgot: { title: 'Reset', accent: 'password', lede: 'We’ll email you a link to set a new one.', cta: 'Send reset link', busy: 'Sending…' },
  recovery: { title: 'New', accent: 'password', lede: 'Choose a new password for your account.', cta: 'Save password', busy: 'Saving…' },
  invite: { title: 'Welcome', accent: 'aboard', lede: 'You’re on the trip list. Set a password to finish your account.', cta: 'Set password', busy: 'Saving…' },
};

const inputCls =
  'w-full h-12 px-3.5 rounded-lg border bg-white text-[15px] text-ink placeholder:text-gray-400 ' +
  'outline-none transition-colors focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-red/40 ' +
  'disabled:opacity-50 aria-[invalid=true]:border-red';

function Field({ id, label, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <label htmlFor={id} className="font-mono text-[10px] tracking-[.18em] uppercase text-gray-500">
          {label}
        </label>
        {hint}
      </div>
      {children}
    </div>
  );
}

export default function Login({ setup = null, onPasswordSet, themeToggle }) {
  const [mode, setMode] = useState(setup ?? 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /* Set when an email has gone out — replaces the form with a
     confirmation, rather than a toast that disappears. */
  const [sent, setSent] = useState(null);

  const copy = COPY[mode];
  const choosingPassword = mode === 'recovery' || mode === 'invite';
  const needsEmail = !choosingPassword;
  const needsPassword = mode !== 'forgot';

  const switchTo = (next) => {
    setMode(next);
    setError('');
    setPassword('');
    setShowPw(false);
  };

  async function onSubmit(e) {
    e.preventDefault();
    if (busy || !supabase) return;
    setError('');

    const addr = email.trim().toLowerCase();
    if (needsPassword && mode !== 'signin' && password.length < 8) {
      setError('Use 8 or more characters.');
      return;
    }

    setBusy(true);
    try {
      const redirectTo = window.location.origin;

      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: addr, password });
        if (err) throw err;
        /* Success: useAuth sees the new session and App swaps screens. */
      } else if (mode === 'forgot') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo });
        if (err) throw err;
        setSent({ to: addr });
      } else if (choosingPassword) {
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) throw err;
        onPasswordSet?.();
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col max-w-[440px] mx-auto px-4">
      <div className="h-13 flex items-center justify-between gap-3">
        <span className="font-display text-sm tracking-wide text-ink">Orangeleaf · Japan 2026</span>
        {themeToggle}
      </div>

      {/* Pushes the block toward the lower-middle of a tall phone, where a
          thumb reaches the button without re-gripping. */}
      <div className="flex-1 flex flex-col justify-end sm:justify-center pb-10 pt-8">
        {sent ? (
          <section aria-live="polite">
            <h1 className="display text-[44px] leading-[.95] [overflow-wrap:anywhere]">
              Check your <span className="text-red">inbox</span>
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed mt-3">
              If that address has an account, a reset link is on its way to{' '}
              <span className="font-medium text-ink break-all">{sent.to}</span>.
            </p>
            <p className="note mt-2">Not there after a minute? Check spam.</p>
            <button
              type="button"
              onClick={() => { setSent(null); switchTo('signin'); }}
              className="mt-7 w-full h-13 rounded-lg bg-red text-paper font-display text-lg tracking-wide cursor-pointer transition-transform duration-100 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Back to sign in
            </button>
          </section>
        ) : (
          <section>
            <h1 className="display text-[52px] leading-[.95] [overflow-wrap:anywhere]">
              {copy.title} <span className="text-red">{copy.accent}</span>
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed mt-2.5">{copy.lede}</p>

            {!supabaseConfigured && (
              <p role="alert" className="mt-5 rounded-lg border border-gold bg-white px-3.5 py-3 text-sm text-gray-600 leading-relaxed">
                Sign-in isn’t connected yet. Set <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{' '}
                <code className="font-mono text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code className="font-mono text-xs">.env.local</code>.
              </p>
            )}

            <form onSubmit={onSubmit} noValidate={false} className="mt-7 space-y-4">
              {needsEmail && (
                <Field id="auth-email" label="Email">
                  <input
                    id="auth-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                    placeholder="you@company.com"
                    className={`${inputCls} border-gray-200`}
                  />
                </Field>
              )}

              {needsPassword && (
                <Field
                  id="auth-password"
                  label={choosingPassword ? 'New password' : 'Password'}
                  hint={mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => switchTo('forgot')}
                      className="font-mono text-[11px] text-gray-500 underline underline-offset-2 hover:text-red cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-red"
                    >
                      Forgot?
                    </button>
                  )}
                >
                  <div className="relative">
                    <input
                      id="auth-password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      required
                      minLength={mode === 'signin' ? undefined : 8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      aria-invalid={Boolean(error) && mode !== 'signin' && password.length < 8}
                      aria-describedby={mode !== 'signin' ? 'auth-pw-rule' : undefined}
                      className={`${inputCls} border-gray-200 pr-16`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-pressed={showPw}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-2.5 rounded-md font-mono text-[11px] uppercase tracking-wider text-gray-500 hover:text-ink cursor-pointer focus-visible:outline-2 focus-visible:outline-red"
                    >
                      {showPw ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {mode !== 'signin' && (
                    <p id="auth-pw-rule" className="note mt-1.5">8 or more characters.</p>
                  )}
                </Field>
              )}

              {error && (
                <p role="alert" className="text-sm text-red leading-snug">{error}</p>
              )}

              <button
                type="submit"
                disabled={busy || !supabaseConfigured}
                aria-busy={busy}
                className="w-full h-13 rounded-lg bg-red text-paper font-display text-lg tracking-wide whitespace-nowrap cursor-pointer transition-transform duration-100 active:translate-y-px hover:brightness-105 disabled:hover:brightness-100 disabled:cursor-not-allowed disabled:active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {busy ? copy.busy : copy.cta}
              </button>
            </form>

            {/* The one alternate path per screen, as plain text — never a
                second button competing with the CTA. */}
            <p className="text-sm text-gray-500 mt-6">
              {mode === 'forgot' && (
                <>Remembered it?{' '}
                  <AltLink onClick={() => switchTo('signin')}>Back to sign in</AltLink></>
              )}
            </p>
          </section>
        )}
      </div>

      <p className="note pb-5">Invite-only · stays signed in offline</p>
    </main>
  );
}

function AltLink({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-medium text-ink underline underline-offset-[3px] decoration-red decoration-2 hover:text-red cursor-pointer rounded-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-red"
    >
      {children}
    </button>
  );
}
