// =============================================================================
// Native-aware storage adapter
// =============================================================================
// On web: localStorage (sync, no awaiting). The Supabase auth client expects
//   a synchronous Storage interface (getItem/setItem/removeItem). localStorage
//   is exactly that — used as-is.
// On native (Capacitor): @capacitor/preferences is async. We wrap it to expose
//   a synchronous-looking Storage interface backed by an in-memory cache that
//   is hydrated from Preferences at app boot. Writes go to both immediately;
//   reads always hit the cache. This keeps supabase-js happy and survives
//   iOS's 7-day localStorage purge.
// =============================================================================

import { Preferences } from '@capacitor/preferences';

interface SyncStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isNativePlatform(): boolean {
  // Avoid pulling in @capacitor/core just for this check — read the global.
  const cap = (globalThis as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/**
 * Native storage adapter. Behaves synchronously by maintaining an in-memory
 * mirror of Preferences. Hydration is done eagerly via `hydrateNativeStorage`
 * before any `supabase` call needs it.
 */
class NativePreferencesStorage implements SyncStorage {
  private cache = new Map<string, string>();

  /** Pull all keys from Preferences into cache. Call once at app boot. */
  async hydrate(): Promise<void> {
    const { keys } = await Preferences.keys();
    for (const k of keys) {
      const { value } = await Preferences.get({ key: k });
      if (value !== null && value !== undefined) {
        this.cache.set(k, value);
      }
    }
  }

  getItem(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.cache.set(key, value);
    // Fire-and-forget; supabase-js doesn't await our setItem and won't notice.
    Preferences.set({ key, value }).catch((err) => {
      console.error('[native-storage] set failed:', key, err);
    });
  }

  removeItem(key: string): void {
    this.cache.delete(key);
    Preferences.remove({ key }).catch((err) => {
      console.error('[native-storage] remove failed:', key, err);
    });
  }
}

const nativeStore = new NativePreferencesStorage();

/**
 * Hydrate the native cache from Preferences before any Supabase call runs.
 * On web this is a no-op. Call once from `main.tsx` BEFORE rendering React.
 */
export async function hydrateNativeStorage(): Promise<void> {
  if (!isNativePlatform()) return;
  await nativeStore.hydrate();
}

/**
 * Storage instance to hand to `createClient({ auth: { storage } })`.
 * - Web: returns `window.localStorage` directly (no wrapper overhead).
 * - Native: returns the synchronous-looking Preferences-backed cache.
 */
export const authStorage: SyncStorage = isNativePlatform()
  ? nativeStore
  : (typeof localStorage !== 'undefined'
      ? localStorage
      : {
          // Last-resort fallback for non-browser non-native contexts (SSR).
          getItem: () => null,
          setItem: () => undefined,
          removeItem: () => undefined,
        });
