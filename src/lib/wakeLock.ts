// WakeLock API utilities
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if ('wakeLock' in navigator) {
      return await navigator.wakeLock.request('screen');
    }
    return null;
  } catch (error) {
    console.error('Failed to request wake lock:', error);
    return null;
  }
}

export async function releaseWakeLock(wakeLock: WakeLockSentinel | null): Promise<void> {
  if (wakeLock) {
    try {
      await wakeLock.release();
    } catch (error) {
      console.error('Failed to release wake lock:', error);
    }
  }
}

export function isWakeLockSupported(): boolean {
  return 'wakeLock' in navigator;
}
