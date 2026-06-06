// =============================================================================
// Realtime resume on visibility / network change
// =============================================================================
// supabase-js has its own retry loop, but channels stay dead after a >30s
// disconnect — common when a worker's phone has been in their pocket on 3G
// for hours, or backgrounded on iOS. Manually nudge the realtime client when
// we're sure the app should reconnect: foreground transition + network up.
//
// Hooked into the app via `installRealtimeResume()` from App.tsx once.
// =============================================================================

import { supabase } from '@/integrations/supabase/client';

function isNativePlatform(): boolean {
  const cap = (globalThis as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

let installed = false;

/**
 * Wire visibility + network listeners to force a Supabase realtime reconnect.
 * Idempotent — calling twice is a no-op.
 */
export function installRealtimeResume(): () => void {
  if (installed) return () => undefined;
  installed = true;

  const reconnect = () => {
    try {
      // disconnect()+connect() forces a fresh handshake; existing channels
      // are kept and will rejoin automatically.
      supabase.realtime.disconnect();
      supabase.realtime.connect();
    } catch (err) {
      console.warn('[realtime-resume] reconnect failed:', err);
    }
  };

  // Web-side hooks
  const onVisibility = () => {
    if (document.visibilityState === 'visible') reconnect();
  };
  const onOnline = () => reconnect();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);

  // Native-side hooks (Capacitor App + Network plugins). Dynamic import keeps
  // the bundle slim on web — these only load inside a Capacitor WebView.
  let nativeCleanup: (() => void) | null = null;
  if (isNativePlatform()) {
    (async () => {
      const [{ App }, { Network }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/network'),
      ]);
      const appSub = await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) reconnect();
      });
      const netSub = await Network.addListener('networkStatusChange', (status) => {
        if (status.connected) reconnect();
      });
      nativeCleanup = () => {
        appSub.remove();
        netSub.remove();
      };
    })().catch((err) => {
      console.warn('[realtime-resume] native listener install failed:', err);
    });
  }

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
    nativeCleanup?.();
    installed = false;
  };
}
