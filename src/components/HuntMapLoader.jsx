import { Component, Suspense } from 'react';
import { lazyChunk } from '../lib/chunk';

/* Leaflet is heavy; only fetch it when someone opens the map. */
const HuntMap = lazyChunk(() => import('./HuntMap'));

/* If the chunk still won't load after the reload in lib/chunk — the
   usual reason being no signal — say so instead of letting the throw
   unmount the whole app. Losing the map on a train platform is
   survivable; losing the itinerary and the emergency numbers with it
   is not. */
class MapBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] grid place-items-center bg-paper px-6">
        <div className="max-w-[22rem] text-center">
          <p className="font-display text-xl tracking-wide">Map didn’t load</p>
          <p className="text-sm text-gray-500 leading-relaxed mt-2">
            It needs signal the first time you open it. Everything else in the app still works offline.
          </p>
          <div className="flex gap-2 justify-center mt-5">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-10 px-4 rounded-lg bg-ink dark:bg-flame text-white text-sm font-medium cursor-pointer"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.props.onClose}
              className="h-10 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium text-ink cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/** The hunt map, loaded on demand and safe across a deploy. */
export default function HuntMapLoader({ map, onClose }) {
  return (
    <MapBoundary onClose={onClose}>
      <Suspense fallback={<div className="fixed inset-0 z-[90] grid place-items-center bg-paper note">Loading map…</div>}>
        <HuntMap map={map} onClose={onClose} />
      </Suspense>
    </MapBoundary>
  );
}
