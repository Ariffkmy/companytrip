/* Hallmark · macrostructure: Workbench · tone: utilitarian travel-zine
 * fingerprint: bottom-aligned heading · asymmetric spans · negative-space
 * dividers · widgets stacked weather → money → photos
 */

import { useEffect, useState } from 'react';
import WeatherWidget from './Weather';
import ForexWidget from './ForexWidget';
import PhotoCarousel from './PhotoCarousel';
import groupRoster from '../data/groupRoster';
import { cachedPolicy, certificateUrl, fetchMyPolicy, formatDate } from '../lib/insurance';

/* Lead and JP Speaker are the two you need to find fast, so they are
   the only rows that carry a badge. */
const ROLE_STYLE = {
  'Team Lead': 'text-sea',
  'JP Speaker': 'text-gold',
};

/* ── Greeting ───────────────────────────────────────
   First name only. The roster carries everyone's full name further
   down, and a full Malaysian name wraps to three lines on a phone
   before you have read anything useful. */
function firstName(full, email) {
  const given = String(full ?? '').trim().split(/\s+/)[0];
  if (given) return given;
  /* No profile name yet — the part before the @ is closer to a name
     than the whole address is. */
  const local = String(email ?? '').split('@')[0].trim();
  return local || 'there';
}

function Greeting({ userName, userEmail }) {
  return (
    <section className="pt-7 pb-1">
      <h1 className="display text-3xl sm:text-4xl leading-[1.05]">
        Hi {firstName(userName, userEmail)}<span className="text-red">!</span>
      </h1>
    </section>
  );
}

/* ── Groups ───────────────────────────────────────── */
function Groups() {
  const [openGroups, setOpenGroups] = useState([]);

  const toggleGroup = (idx) => {
    setOpenGroups((prev) => prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]);
  };

  return (
    <section className="mt-9">
      <h2 className="font-mono text-[13px] font-bold tracking-[.14em] uppercase text-gray-700 mb-2.5">
        Teams
      </h2>
      <div className="space-y-2.5">
        {groupRoster.map((g, gi) => (
          <div key={g.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden transition-shadow hover:shadow-sm">
            <button
              onClick={() => toggleGroup(gi)}
              type="button"
              className="w-full flex items-center gap-3 px-4 py-3 text-left bg-transparent border-0 cursor-pointer"
            >
              <span className="font-display text-base tracking-wide">{g.name}</span>
              <span className="text-xs text-gray-400 font-mono">{g.members.length} pax</span>
              <span className={`ml-auto text-gray-400 text-xs transition-transform ${openGroups.includes(gi) ? 'rotate-90' : ''}`}>▶</span>
            </button>
            {openGroups.includes(gi) && (
              <div className="px-4 pb-3 border-t border-gray-100">
                {g.members.map((m) => (
                  <div key={m.name} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
                    <span className="text-sm font-medium leading-snug">
                      {m.name}
                      {ROLE_STYLE[m.role] && (
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ml-2 ${ROLE_STYLE[m.role]}`}>
                          {m.role}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Insurance ──────────────────────────────────────
   Your own policy, nobody else's. The numbers are printed large and
   selectable because the moment you need them is on the phone to a
   hotline, reading them out — the PDF is the slow path. */
function Field({ label, value, wide }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="font-mono text-[10px] tracking-[.14em] uppercase text-gray-400">{label}</dt>
      <dd className="text-sm text-ink leading-snug mt-0.5 select-all break-words">{value || '—'}</dd>
    </div>
  );
}

function Insurance({ userEmail }) {
  /* Show the phone's copy first: on a train platform in Atami there may
     never be a fresh one. */
  const [policy, setPolicy] = useState(() => cachedPolicy(userEmail));
  const [state, setState] = useState('loading'); // loading · ready · offline
  const [opening, setOpening] = useState(false);
  /* Only set when the browser refused the new tab: a real link the
     reader can tap, since their own tap is never blocked. */
  const [link, setLink] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userEmail) return undefined;
    let live = true;
    setPolicy(cachedPolicy(userEmail));
    fetchMyPolicy(userEmail)
      .then((row) => { if (live) { setPolicy(row); setState('ready'); } })
      .catch(() => { if (live) setState('offline'); });
    return () => { live = false; };
  }, [userEmail]);

  const view = async () => {
    setOpening(true);
    setError('');
    setLink(null);
    /* Opened before the await: a tab opened after one has lost the
       click that justified it, and the browser blocks it as a popup.
       Deliberately no 'noopener' feature — with it window.open returns
       null and there is nothing left to point at the PDF. The opener is
       severed by hand instead, while the tab is still blank and
       same-origin. */
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const url = await certificateUrl(policy);
      /* replace(), so Back from the PDF returns to the app rather than
         to the blank page the tab started as. */
      if (tab) tab.location.replace(url);
      /* Never navigate this tab: on an installed app that closes the
         app to show a PDF. Offer something to tap instead. */
      else setLink(url);
    } catch (e) {
      tab?.close();
      setError('Couldn’t open the certificate. Try again with signal.');
    } finally {
      setOpening(false);
    }
  };

  /* Nothing loaded yet is the normal state until the committee imports
     the policies, so it reads as a status, not a failure. */
  if (!policy) {
    if (state === 'loading') return null;
    return (
      <section className="mt-9" aria-labelledby="ins-h">
        <h2 id="ins-h" className="font-mono text-[13px] font-bold tracking-[.14em] uppercase text-gray-700 mb-2.5">
          Travel insurance
        </h2>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500 leading-relaxed">
            {state === 'offline'
              ? 'No saved copy on this phone yet — open this page once with signal.'
              : 'Your policy hasn’t been loaded yet. The committee will add it before departure.'}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-9" aria-labelledby="ins-h">
      <h2 id="ins-h" className="font-mono text-[13px] font-bold tracking-[.14em] uppercase text-gray-700 mb-2.5">
        Travel insurance
      </h2>
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="font-display text-base tracking-wide leading-snug">{policy.product || 'Travel cover'}</p>
          {policy.destination && (
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-sea">
              {policy.destination}
            </span>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-3 mt-3.5">
          <Field label="Master policy no." value={policy.master_policy_no} />
          <Field label="Reference no." value={policy.reference_no} />
          <Field label="Flight booking" value={policy.booking_no} />
          <Field label="Cover" value={`${formatDate(policy.effective_date)} – ${formatDate(policy.expiry_date)}`} />
          <Field label="Plan type" value={policy.plan_type} wide />
        </dl>

        <button
          type="button"
          onClick={view}
          disabled={!policy.pdf_path || opening}
          className="w-full mt-4 h-11 rounded-lg border border-gray-200 bg-white text-sm font-medium text-ink cursor-pointer transition-colors hover:border-gray-300 disabled:cursor-default disabled:text-gray-400 disabled:hover:border-gray-200"
        >
          {opening ? 'Opening…' : policy.pdf_path ? 'View certificate (PDF)' : 'Certificate not uploaded yet'}
        </button>

        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-2 text-sm font-medium text-ink underline underline-offset-2 decoration-red"
          >
            Your browser blocked the new tab — tap here to open it ↗
          </a>
        )}

        {error && <p className="text-xs text-red mt-2">{error}</p>}
        <p className="note mt-2 leading-relaxed">
          Saved on this phone so the numbers are readable offline. Opening the PDF needs signal — save it from there if you want it with you.
        </p>
      </div>
    </section>
  );
}

/* ── Jump ───────────────────────────────────────────
   Two-up, deliberately uneven in weight: Safety is the one you
   need under pressure, so it reads loudest. */
function Jump({ onGo, onOpenTreasureHunt }) {
  const items = [
    { label: 'Emergency', sub: 'Hospitals · 119 · phrases', go: () => onGo('safety'), urgent: true, wide: true },
    { label: 'Treasure Hunt', sub: 'Atami · Day 4', go: onOpenTreasureHunt },
  ];

  return (
    <section className="mt-9">
      <h2 className="font-mono text-[13px] font-bold tracking-[.14em] uppercase text-gray-700 mb-2.5">
        Jump to
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            onClick={it.go}
            className={`px-3.5 py-3 rounded-lg border text-left cursor-pointer transition-colors bg-white ${
              it.urgent ? 'border-red' : 'border-gray-200 hover:border-gray-300'
            } ${it.wide ? 'col-span-2' : ''}`}
          >
            <span className={`block text-sm font-medium leading-snug ${it.urgent ? 'text-red' : ''}`}>
              {it.label}
            </span>
            <span className="block text-xs text-gray-500 leading-snug mt-0.5">{it.sub}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Home({ onGo, onOpenTreasureHunt, userName, userEmail, isAdmin, onSignOut }) {
  return (
    <section>
      <Greeting userName={userName} userEmail={userEmail} />
      <PhotoCarousel onOpenAlbum={() => onGo('album')} />
      <WeatherWidget />
      <ForexWidget />
      <Insurance userEmail={userEmail} />
      <Jump onGo={onGo} onOpenTreasureHunt={onOpenTreasureHunt} />
      {/* Last: who is on which team is looked up once or twice a trip,
          while the weather, the rate and your policy are daily reads. */}
      <Groups />

      <div className="mt-10 pb-4 border-t border-gray-200 pt-4 space-y-1.5">
        <p className="note flex items-baseline gap-2 min-w-0">
          <span className="truncate">Signed in as {userEmail}</span>
          {isAdmin && (
            <span className="shrink-0 font-semibold uppercase tracking-wider text-red">Admin</span>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="shrink-0 underline underline-offset-2 hover:text-red cursor-pointer"
          >
            Sign out
          </button>
        </p>
        <p className="note">Works offline · add to your home screen before you fly</p>
      </div>
    </section>
  );
}
