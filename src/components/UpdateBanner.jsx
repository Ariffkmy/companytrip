/* Picks up a new deploy without anyone having to hard refresh.

   The service worker only looks for a new version when told to, so we
   ask every few minutes and whenever the app comes back to the front.
   A new version is switched in by itself only at a safe moment — right
   after the app opened, or on return from a long absence — so nobody
   loses a half-picked photo or a quiz in progress. Otherwise a small
   bar offers the update. */

import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const CHECK_EVERY = 5 * 60 * 1000;
// Longer than a trip to the camera and back.
const AWAY_LONG_ENOUGH = 3 * 60 * 1000;
const JUST_ARRIVED = 15 * 1000;

let arrivedAt = Date.now();
let hiddenSince = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenSince = Date.now();
  } else {
    if (hiddenSince && Date.now() - hiddenSince >= AWAY_LONG_ENOUGH) arrivedAt = Date.now();
    hiddenSince = null;
  }
});
const justArrived = () => Date.now() - arrivedAt < JUST_ARRIVED;

export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
      setInterval(check, CHECK_EVERY);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  useEffect(() => {
    if (!needRefresh) return undefined;
    if (justArrived()) { updateServiceWorker(true); return undefined; }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && justArrived()) updateServiceWorker(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [needRefresh, updateServiceWorker]);

  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-0 z-50 px-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6 pointer-events-none">
      <div className="pointer-events-auto max-w-[640px] mx-auto flex items-center gap-3 rounded-lg bg-ink text-card px-3.5 py-2.5 shadow-lg">
        <span className="text-sm flex-1">A new version of the app is ready.</span>
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="shrink-0 rounded-md bg-red text-white text-sm font-semibold px-3 py-1.5 border-0 cursor-pointer"
        >
          Update
        </button>
      </div>
    </div>
  );
}
