/* ═══════════════════════════════════════════════════
   Lazy chunks across a deploy
   ═══════════════════════════════════════════════════

   Every build names its chunks by content hash, and the previous
   build's files stop being served once a new one goes out. A tab left
   open across a deploy — or the installed app woken from the service
   worker's cached shell — is still running the old build, so the first
   lazy import it attempts asks for a file that is no longer there and
   throws "Failed to fetch dynamically imported module".

   A new service worker cannot rescue a page that is already running:
   it only takes over the next navigation. But that is the whole fix —
   the newer shell is sitting there waiting, so reloading picks it up.

   Reload at most once in a short window. A chunk can also fail because
   the phone is in a tunnel, and that must not become a reload loop. If
   a second attempt fails the error is rethrown for an error boundary to
   show. Where sessionStorage is unavailable (private mode) there is
   nowhere to record that an attempt was made, so no reload happens at
   all and the boundary handles it — a dead map beats a reload loop.
*/

import { lazy } from 'react';

const KEY = 'olc-chunk-reload-at';
const QUIET_MS = 15000;

function reloadForNewBuild() {
  let store;
  try {
    store = window.sessionStorage;
    if (!store) return false;
  } catch (e) {
    return false; // storage blocked — fall through to the boundary
  }

  let last = 0;
  try {
    last = Number(store.getItem(KEY)) || 0;
    store.setItem(KEY, String(Date.now()));
  } catch (e) {
    return false; // can't record the attempt, so don't risk a loop
  }

  if (Date.now() - last < QUIET_MS) return false;
  window.location.reload();
  return true;
}

/** React.lazy that survives a deploy landing under an open tab. */
export function lazyChunk(load) {
  return lazy(() => load().catch((err) => {
    /* Left pending on purpose when a reload is under way: resolving or
       rejecting would flash an error in the moment before the page
       goes away. */
    if (reloadForNewBuild()) return new Promise(() => {});
    throw err;
  }));
}
