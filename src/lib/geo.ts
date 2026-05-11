// =============================================================================
// Geolocation utilities — Haversine distance + accuracy-aware radius checks
// =============================================================================

/**
 * Distance in meters between two coords (Haversine formula on WGS-84 sphere).
 * Accurate to within ~0.5% for distances under 1000 km.
 */
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Single-shot getCurrentPosition wrapped in a Promise.
 * Kept for backward compatibility — prefer getCurrentPositionAccurate for
 * code paths where accuracy matters (start/end shift, set site location).
 */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    });
  });
}

interface AccurateOptions {
  /** Cap on accuracy (meters). Will keep sampling while the GPS reports a worse number, up to maxAttempts. Default 50m. */
  targetAccuracyM?: number;
  /** Hard upper bound on accuracy; if even the best sample is worse, returns the best with rejected=false but caller may decide. Default 200m. */
  maxAcceptableAccuracyM?: number;
  /** Maximum number of samples to take. Default 3. */
  maxSamples?: number;
  /** Maximum wall-clock time (ms) before giving up. Default 12000. */
  timeoutMs?: number;
}

export interface AccuratePosition {
  lat: number;
  lon: number;
  accuracy: number;
  /** When the fix was taken */
  timestamp: number;
  /** Number of samples taken before picking this one */
  samples: number;
  /** True if best sample met targetAccuracyM */
  reachedTarget: boolean;
}

/**
 * Take multiple GPS samples and return the most accurate one.
 * Stops early once a sample beats targetAccuracyM, otherwise returns the best after maxSamples/timeoutMs.
 *
 * Why this matters: the very first getCurrentPosition() after a wake-up often
 * returns a stale or low-quality fix (especially on iOS Safari and cell-only
 * devices). The second/third sample is usually much better.
 */
export function getCurrentPositionAccurate(opts: AccurateOptions = {}): Promise<AccuratePosition> {
  const {
    targetAccuracyM = 50,
    maxAcceptableAccuracyM = 200,
    maxSamples = 3,
    timeoutMs = 12000,
  } = opts;

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported'));
      return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      reject(new Error('Geolocation requires HTTPS context'));
      return;
    }

    let bestSample: AccuratePosition | null = null;
    let samplesTaken = 0;
    let settled = false;
    const startedAt = Date.now();
    let watchId: number | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (watchId !== null) {
        try { navigator.geolocation.clearWatch(watchId); } catch { /* ignore */ }
        watchId = null;
      }
      if (hardTimer) {
        clearTimeout(hardTimer);
        hardTimer = null;
      }
    };

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (bestSample) {
        bestSample.samples = samplesTaken;
        bestSample.reachedTarget = bestSample.accuracy <= targetAccuracyM;
        resolve(bestSample);
      } else {
        reject(err ?? new Error('Could not get geolocation fix'));
      }
    };

    const onSuccess = (position: GeolocationPosition) => {
      samplesTaken++;
      const sample: AccuratePosition = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
        samples: samplesTaken,
        reachedTarget: false,
      };

      if (!bestSample || sample.accuracy < bestSample.accuracy) {
        bestSample = sample;
      }

      // Met the target — return immediately
      if (sample.accuracy <= targetAccuracyM) {
        finish();
        return;
      }
      // Took enough samples — return best so far
      if (samplesTaken >= maxSamples) {
        finish();
        return;
      }
      // Time's up
      if (Date.now() - startedAt >= timeoutMs) {
        finish();
        return;
      }
      // Otherwise watchPosition will keep firing onSuccess
    };

    const onError = (err: GeolocationPositionError) => {
      // If we already have at least one sample, ignore the error and use what we got
      if (bestSample) {
        finish();
        return;
      }
      finish(new Error(`Geolocation error code ${err.code}: ${err.message}`));
    };

    // watchPosition fires multiple times as GPS improves — perfect for "best of N"
    watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 0,
    });

    hardTimer = setTimeout(() => finish(), timeoutMs);

    // Mark maxAcceptableAccuracyM for caller; we still resolve with the best
    void maxAcceptableAccuracyM;
  });
}

export type RadiusVerdict = 'inside' | 'outside' | 'uncertain';

export interface RadiusEvaluation {
  verdict: RadiusVerdict;
  /** Center-to-user distance in meters (without accuracy buffer) */
  distance: number;
  /** Accuracy used for the check */
  accuracy: number;
  /** site radius */
  radius: number;
}

/**
 * Decide if a user is inside the site radius, taking GPS accuracy into account.
 *
 *   distance + accuracy <= radius  → 'inside'   (definitely inside)
 *   distance - accuracy >= radius  → 'outside'  (definitely outside)
 *   otherwise                       → 'uncertain' (within the GPS error band)
 *
 * Use 'uncertain' to suppress automatic actions (auto-pause / auto-resume) so
 * the worker doesn't flicker between paused/unpaused on the radius edge.
 */
export function evaluateRadius(
  userLat: number,
  userLon: number,
  siteLat: number,
  siteLon: number,
  radiusM: number,
  accuracyM: number
): RadiusEvaluation {
  const distance = getDistance(userLat, userLon, siteLat, siteLon);
  // Clamp accuracy to something sane to avoid huge edge buffers (e.g. accuracy=2000)
  const effectiveAccuracy = Math.max(0, Math.min(accuracyM ?? 0, 300));

  let verdict: RadiusVerdict;
  if (distance + effectiveAccuracy <= radiusM) {
    verdict = 'inside';
  } else if (distance - effectiveAccuracy >= radiusM) {
    verdict = 'outside';
  } else {
    verdict = 'uncertain';
  }

  return { verdict, distance, accuracy: effectiveAccuracy, radius: radiusM };
}

/**
 * Backward-compatible boolean check (no accuracy awareness).
 * Use evaluateRadius for new code paths that need to handle the edge band.
 */
export function isWithinRadius(
  userLat: number,
  userLon: number,
  siteLat: number,
  siteLon: number,
  radiusM: number
): boolean {
  const distance = getDistance(userLat, userLon, siteLat, siteLon);
  return distance <= radiusM;
}
