import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bearingDegrees,
  estimateDriveMinutes,
  formatDistance,
  haversineDistanceKm,
  isValidGeoPoint,
  routeCacheKey,
  sanitizeGeoPoint,
  shouldPublishGpsUpdate,
} from './geo';

test('isValidGeoPoint and sanitizeGeoPoint validate WGS84 coordinates', () => {
  assert.equal(isValidGeoPoint({ lat: 37.7749, lng: -122.4194 }), true);
  assert.equal(isValidGeoPoint({ lat: 95, lng: 0 }), false);
  assert.equal(isValidGeoPoint({ lat: 0, lng: -190 }), false);
  assert.equal(isValidGeoPoint({ lat: NaN, lng: 10 }), false);
  assert.equal(isValidGeoPoint(null), false);

  const clean = sanitizeGeoPoint({
    lat: 37.7749295,
    lng: -122.4194155,
    accuracy: 14.6,
    heading: 182.4,
    speed: 8.345,
    updatedAt: 1700000000000,
    label: '  Market St  ',
  });
  assert.deepEqual(clean, {
    lat: 37.77493,
    lng: -122.419415,
    accuracy: 15,
    heading: 182,
    speed: 8.35,
    updatedAt: 1700000000000,
    label: 'Market St',
  });
});

test('haversineDistanceKm computes accurate great-circle distance', () => {
  const sf = { lat: 37.7749, lng: -122.4194 };
  const oakland = { lat: 37.8044, lng: -122.2712 };
  const dist = haversineDistanceKm(sf, oakland);
  assert.ok(dist > 13 && dist < 14, `expected ~13.4km, got ${dist}`);
  assert.equal(haversineDistanceKm(sf, sf), 0);
});

test('formatDistance formats meters and kilometers cleanly', () => {
  assert.equal(formatDistance(0.01), 'Nearby');
  assert.equal(formatDistance(0.342), '340 m');
  assert.equal(formatDistance(2.46), '2.5 km');
  assert.equal(formatDistance(14.6), '15 km');
});

test('estimateDriveMinutes computes realistic urban ETA', () => {
  assert.equal(estimateDriveMinutes(0.02), 1);
  // 2 km straight line -> ~2.6 km road -> ~6 mins at 28 km/h
  const eta = estimateDriveMinutes(2.0);
  assert.ok(eta >= 5 && eta <= 7, `expected 5-7 min, got ${eta}`);
  // With faster live speed (10 m/s = 36 km/h)
  const fastEta = estimateDriveMinutes(2.0, 10);
  assert.ok(fastEta <= eta);
});

test('bearingDegrees computes compass direction', () => {
  const origin = { lat: 0, lng: 0 };
  assert.equal(Math.round(bearingDegrees(origin, { lat: 1, lng: 0 })), 0); // North
  assert.equal(Math.round(bearingDegrees(origin, { lat: 0, lng: 1 })), 90); // East
  assert.equal(Math.round(bearingDegrees(origin, { lat: -1, lng: 0 })), 180); // South
  assert.equal(Math.round(bearingDegrees(origin, { lat: 0, lng: -1 })), 270); // West
});

test('shouldPublishGpsUpdate throttles tiny or rapid updates', () => {
  const base = { lat: 37.7749, lng: -122.4194, updatedAt: 1000 };
  assert.equal(shouldPublishGpsUpdate(null, base), true);
  // Too soon (only 2 seconds elapsed)
  assert.equal(
    shouldPublishGpsUpdate(base, { lat: 37.776, lng: -122.4194, updatedAt: 3000 }),
    false,
  );
  // Enough time (8s), but didn't move (< 2m)
  assert.equal(
    shouldPublishGpsUpdate(base, { lat: 37.774905, lng: -122.4194, updatedAt: 9000 }),
    false,
  );
  // Moved > 100m after 8s -> publish!
  assert.equal(
    shouldPublishGpsUpdate(base, { lat: 37.776, lng: -122.4194, updatedAt: 9000 }),
    true,
  );
});

test('routeCacheKey quantizes tiny GPS jitter into the same cache key', () => {
  const a1 = { lat: 37.774901, lng: -122.419401 };
  const a2 = { lat: 37.774904, lng: -122.419403 };
  const dest = { lat: 37.7849, lng: -122.4094 };
  assert.equal(routeCacheKey(a1, dest), routeCacheKey(a2, dest));
});

