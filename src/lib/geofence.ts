// =============================================================================
// Geofence — JS bridge to the native GeofencePlugin (Android + iOS)
// =============================================================================
// On native, the OS monitors the registered circular regions even when the app
// is killed and fires a 'geofenceTransition' event on ENTER/EXIT. This module
// is a thin typed wrapper; it is a no-op on web (no native plugin), where the
// ambient location watcher in Me.tsx handles auto-attendance instead.
// =============================================================================

export interface GeofenceRegion {
  id: string;        // site id
  latitude: number;
  longitude: number;
  radius: number;    // meters — clamped to ≥100 for OS reliability
}

export interface GeofenceTransitionEvent {
  transition: 'enter' | 'exit';
  ids: string[];     // site ids that triggered
}

interface GeofencePluginShape {
  addGeofences(options: { geofences: GeofenceRegion[] }): Promise<void>;
  removeAllGeofences(): Promise<void>;
  addListener(
    eventName: 'geofenceTransition',
    listener: (event: GeofenceTransitionEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

function isNativePlatform(): boolean {
  const cap = (globalThis as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

let pluginPromise: Promise<GeofencePluginShape | null> | null = null;

async function getPlugin(): Promise<GeofencePluginShape | null> {
  if (!isNativePlatform()) return null;
  if (!pluginPromise) {
    pluginPromise = (async () => {
      try {
        const { registerPlugin } = await import('@capacitor/core');
        return registerPlugin<GeofencePluginShape>('Geofence');
      } catch (err) {
        console.warn('[geofence] plugin unavailable:', err);
        return null;
      }
    })();
  }
  return pluginPromise;
}

/**
 * Register OS-level geofences for the given sites. Radii below 100m are bumped
 * to 100m — native geofencing is unreliable below that. No-op on web.
 */
export async function registerGeofences(regions: GeofenceRegion[]): Promise<boolean> {
  const plugin = await getPlugin();
  if (!plugin || regions.length === 0) return false;
  const safe = regions.map(r => ({ ...r, radius: Math.max(100, r.radius) }));
  try {
    await plugin.removeAllGeofences();
    await plugin.addGeofences({ geofences: safe });
    return true;
  } catch (err) {
    console.warn('[geofence] register failed:', err);
    return false;
  }
}

/** Remove all registered geofences. No-op on web. */
export async function clearGeofences(): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.removeAllGeofences();
  } catch (err) {
    console.warn('[geofence] clear failed:', err);
  }
}

/**
 * Subscribe to OS geofence ENTER/EXIT transitions. Returns an unsubscribe fn.
 * No-op on web (returns a noop unsubscribe).
 */
export async function onGeofenceTransition(
  handler: (event: GeofenceTransitionEvent) => void,
): Promise<() => void> {
  const plugin = await getPlugin();
  if (!plugin) return () => undefined;
  try {
    const sub = await plugin.addListener('geofenceTransition', handler);
    return () => { sub.remove().catch(() => undefined); };
  } catch (err) {
    console.warn('[geofence] listener failed:', err);
    return () => undefined;
  }
}
