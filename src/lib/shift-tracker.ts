// =============================================================================
// Shift tracker — unified geolocation polling/streaming for web + native
// =============================================================================
// Web: visibility-aware setInterval calling getCurrentPositionAccurate.
//   30s when visible, 5min when hidden. The browser throttles background
//   timers anyway, and accurate GPS in a hidden tab is unreliable. This is
//   the existing behaviour and what worked (poorly) before native.
//
// Native (Capacitor + @capacitor-community/background-geolocation):
//   addWatcher with a foreground service / iOS location-updates background
//   mode. The plugin pushes location events whenever the OS reports a
//   meaningful change (distanceFilter: 25m). Persistent notification keeps
//   the shift active when the phone is locked / app is in background.
//
// Both modes call the same `onLocation` callback with `{ lat, lon, accuracy }`.
// The caller (Me.tsx) does the evaluateRadius + auto-pause/resume work — this
// module knows nothing about shifts, only about getting a fix to the caller.
// =============================================================================

import { getCurrentPositionAccurate } from './geo';

export interface TrackerLocation {
  lat: number;
  lon: number;
  accuracy: number;
}

export interface TrackerOptions {
  siteName: string;
  onLocation: (loc: TrackerLocation) => void;
  onError?: (err: unknown) => void;
}

export interface TrackerHandle {
  stop: () => Promise<void>;
}

function isNativePlatform(): boolean {
  const cap = (globalThis as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

interface BgGeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}
interface BgGeoPlugin {
  addWatcher(
    options: {
      backgroundMessage: string;
      backgroundTitle: string;
      requestPermissions: boolean;
      stale: boolean;
      distanceFilter: number;
    },
    callback: (location: BgGeoLocation | null, error?: { code: string; message: string }) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}

async function startNative(opts: TrackerOptions): Promise<TrackerHandle> {
  // The community plugin ships only native code + a .d.ts — there's no JS
  // module entry. Use `registerPlugin` (which is what the plugin would do
  // internally if it had a wrapper) to bind to the native implementation.
  const { registerPlugin } = await import('@capacitor/core');
  const BgGeo = registerPlugin<BgGeoPlugin>('BackgroundGeolocation');
  const watcherId = await BgGeo.addWatcher(
    {
      backgroundMessage: 'Закройте уведомление чтобы остановить отслеживание',
      backgroundTitle: `GeoTime: смена на «${opts.siteName}»`,
      requestPermissions: true,
      stale: false,
      distanceFilter: 25,
    },
    (loc, err) => {
      if (err) {
        if (opts.onError) opts.onError(err);
        else console.error('[shift-tracker:native]', err);
        return;
      }
      if (loc) {
        opts.onLocation({
          lat: loc.latitude,
          lon: loc.longitude,
          accuracy: loc.accuracy,
        });
      }
    },
  );
  return {
    async stop() {
      try {
        await BgGeo.removeWatcher({ id: watcherId });
      } catch (err) {
        console.warn('[shift-tracker:native] removeWatcher failed:', err);
      }
    },
  };
}

function startWeb(opts: TrackerOptions): TrackerHandle {
  let interval: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const sample = async () => {
    if (stopped) return;
    try {
      const pos = await getCurrentPositionAccurate({
        targetAccuracyM: 30,
        maxSamples: 2,
        timeoutMs: 7000,
      });
      if (!stopped) opts.onLocation({ lat: pos.lat, lon: pos.lon, accuracy: pos.accuracy });
    } catch (err) {
      if (opts.onError) opts.onError(err);
    }
  };

  const restartInterval = () => {
    if (interval) clearInterval(interval);
    const ms = document.visibilityState === 'hidden' ? 5 * 60 * 1000 : 30 * 1000;
    interval = setInterval(sample, ms);
  };

  const onVisibility = () => {
    restartInterval();
    if (document.visibilityState === 'visible') sample();
  };

  restartInterval();
  sample(); // initial fix
  document.addEventListener('visibilitychange', onVisibility);

  return {
    async stop() {
      stopped = true;
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

/**
 * Start tracking the worker's location for the active shift. Returns a handle
 * with `.stop()` — call when the shift ends or the component unmounts.
 *
 * On native the persistent notification keeps the shift alive when the phone
 * is in the worker's pocket. On web this falls back to a visibility-aware
 * setInterval (the browser will not deliver reliable updates from background).
 */
export async function startShiftTracker(opts: TrackerOptions): Promise<TrackerHandle> {
  if (isNativePlatform()) {
    return startNative(opts);
  }
  return startWeb(opts);
}
