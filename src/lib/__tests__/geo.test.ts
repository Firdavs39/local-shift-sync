import { describe, it, expect } from 'vitest';
import { getDistance, evaluateRadius } from '../geo';

describe('getDistance (Haversine)', () => {
  it('is 0 for identical points', () => {
    expect(getDistance(41.3, 69.2, 41.3, 69.2)).toBeCloseTo(0, 1);
  });

  it('approximates a known short distance', () => {
    // ~111m per 0.001° latitude near the equator-ish; in Tashkent latitude
    // 0.001° lat ≈ 111m. Allow generous tolerance.
    const d = getDistance(41.300, 69.200, 41.301, 69.200);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(125);
  });

  it('is symmetric', () => {
    const a = getDistance(41.3, 69.2, 41.31, 69.25);
    const b = getDistance(41.31, 69.25, 41.3, 69.2);
    expect(a).toBeCloseTo(b, 5);
  });
});

describe('evaluateRadius', () => {
  const site = { lat: 41.300, lon: 69.200, radius: 100 };

  it('inside: at center with good accuracy', () => {
    const e = evaluateRadius(41.300, 69.200, site.lat, site.lon, site.radius, 10, 60);
    expect(e.verdict).toBe('inside');
  });

  it('outside: far away even with buffer', () => {
    // ~1km north
    const e = evaluateRadius(41.310, 69.200, site.lat, site.lon, site.radius, 20, 60);
    expect(e.verdict).toBe('outside');
  });

  it('uncertain: on the edge within the GPS error band', () => {
    // ~90m out with 60m accuracy → 90-60=30 < 100 and 90+60=150 > 100 → uncertain
    const e = evaluateRadius(41.30081, 69.200, site.lat, site.lon, site.radius, 60, 60);
    expect(e.verdict).toBe('uncertain');
  });

  it('strict mode (cap 0) ignores accuracy buffer', () => {
    // 90m out, accuracy 60 but cap 0 → raw 90 <= 100 → inside
    const e = evaluateRadius(41.30081, 69.200, site.lat, site.lon, site.radius, 60, 0);
    expect(e.verdict).toBe('inside');
  });

  it('caps accuracy at accuracyCapM', () => {
    // 150m out, huge reported accuracy 500 but cap 60 → 150-60=90 < 100,
    // 150+60=210 > 100 → uncertain (not inside, because cap limits the buffer)
    const e = evaluateRadius(41.30135, 69.200, site.lat, site.lon, site.radius, 500, 60);
    expect(e.verdict).not.toBe('inside');
  });
});
