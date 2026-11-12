export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  updatedAt?: number;
  label?: string;
}

export interface RouteGeometry {
  coordinates: [number, number][]; // [lat, lng][]
  distanceKm: number;
  durationMin: number;
}

const EARTH_RADIUS_KM = 6371;

export function isValidGeoPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.lat === 'number' &&
    Number.isFinite(v.lat) &&
    v.lat >= -90 &&
    v.lat <= 90 &&
    typeof v.lng === 'number' &&
    Number.isFinite(v.lng) &&
    v.lng >= -180 &&
    v.lng <= 180
  );
}

export function sanitizeGeoPoint(value: unknown): GeoPoint | null {
  if (!isValidGeoPoint(value)) return null;
  const v = value as GeoPoint;
  const clean: GeoPoint = {
    lat: Math.round(v.lat * 1e6) / 1e6,
    lng: Math.round(v.lng * 1e6) / 1e6,
  };
  if (typeof v.accuracy === 'number' && Number.isFinite(v.accuracy) && v.accuracy >= 0) {
    clean.accuracy = Math.round(v.accuracy);
  }
  if (typeof v.heading === 'number' && Number.isFinite(v.heading) && v.heading >= 0 && v.heading <= 360) {
    clean.heading = Math.round(v.heading);
  }
  if (typeof v.speed === 'number' && Number.isFinite(v.speed) && v.speed >= 0) {
    clean.speed = Number(v.speed.toFixed(2));
  }
  if (typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt) && v.updatedAt > 0) {
    clean.updatedAt = Math.round(v.updatedAt);
  }
  if (typeof v.label === 'string' && v.label.trim()) {
    clean.label = v.label.trim().slice(0, 200);
  }
  return clean;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance between two WGS84 coordinates in kilometers. */
export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  if (!isValidGeoPoint(a) || !isValidGeoPoint(b)) return 0;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return EARTH_RADIUS_KM * c;
}

/** Initial compass bearing (0-360 degrees) from point A to point B. */
export function bearingDegrees(from: GeoPoint, to: GeoPoint): number {
  if (!isValidGeoPoint(from) || !isValidGeoPoint(to)) return 0;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Formats a distance in km into a human-friendly label (e.g., "350 m" or "2.4 km"). */
export function formatDistance(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return '0 m';
  if (distanceKm < 0.05) return 'Nearby';
  if (distanceKm < 1) {
    return `${Math.max(50, Math.round((distanceKm * 1000) / 10) * 10)} m`;
  }
  return `${distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km`;
}

/**
 * Estimates urban delivery drive time in minutes from straight-line or route distance.
 * Uses a 1.3x street winding factor and ~28 km/h average urban delivery speed unless
 * live GPS speed (m/s) is available and reasonable.
 */
export function estimateDriveMinutes(distanceKm: number, speedMps?: number | null, isRouteDistance = false): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0.05) return 1;
  const effectiveKm = isRouteDistance ? distanceKm : distanceKm * 1.3;
  const liveKmh = typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps > 2 ? speedMps * 3.6 : null;
  const speedKmh = liveKmh ? Math.min(80, Math.max(15, liveKmh)) : 28;
  const minutes = Math.ceil((effectiveKm / speedKmh) * 60);
  return Math.max(1, Math.min(180, minutes));
}

/**
 * Decides whether a new GPS reading should be persisted to Firestore.
 * Publishes immediately if there is no previous point, or if at least `minIntervalMs`
 * has elapsed AND the driver moved at least `minDistanceMeters` (or 30s heartbeat).
 */
export function shouldPublishGpsUpdate(
  prev: GeoPoint | null | undefined,
  next: GeoPoint,
  minIntervalMs = 6000,
  minDistanceMeters = 12,
): boolean {
  if (!isValidGeoPoint(next)) return false;
  if (!prev || !isValidGeoPoint(prev)) return true;
  const now = next.updatedAt ?? Date.now();
  const last = prev.updatedAt ?? 0;
  const elapsed = now - last;
  if (elapsed < minIntervalMs) return false;
  const movedMeters = haversineDistanceKm(prev, next) * 1000;
  if (movedMeters >= minDistanceMeters) return true;
  // Heartbeat update every 30s if moved at least 3 meters
  return elapsed >= 30_000 && movedMeters >= 3;
}

// In-memory geocode cache so repeated renders never re-query Nominatim for the same address.
const geocodeCache = new Map<string, GeoPoint | null>();

/** Forward-geocodes a street address using OpenStreetMap Nominatim. */
export async function geocodeAddressNominatim(address: string, signal?: AbortSignal): Promise<GeoPoint | null> {
  const key = address.trim().toLowerCase();
  if (key.length < 4) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address.trim())}`;
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const first = data?.[0];
    if (!first?.lat || !first?.lon) {
      geocodeCache.set(key, null);
      return null;
    }
    const point = sanitizeGeoPoint({
      lat: Number(first.lat),
      lng: Number(first.lon),
      updatedAt: Date.now(),
      label: first.display_name,
    });
    geocodeCache.set(key, point);
    return point;
  } catch {
    return null;
  }
}

/** Reverse-geocodes WGS84 coordinates into a readable street address using OpenStreetMap Nominatim. */
export async function reverseGeocodeNominatim(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
  if (!isValidGeoPoint({ lat, lng })) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      display_name?: string;
      address?: {
        house_number?: string;
        road?: string;
        neighbourhood?: string;
        suburb?: string;
        city?: string;
        town?: string;
        village?: string;
        state?: string;
        postcode?: string;
      };
    };
    const a = data?.address;
    if (a) {
      const line1 = [a.house_number, a.road].filter(Boolean).join(' ') || a.neighbourhood || a.suburb || '';
      const locality = a.city || a.town || a.village || '';
      const short = [line1, locality, a.state, a.postcode].filter(Boolean).join(', ');
      if (short.length >= 5) return short.slice(0, 250);
    }
    return data?.display_name ? data.display_name.slice(0, 250) : null;
  } catch {
    return null;
  }
}

/** Fetches road route geometry and drive duration between two points from OSRM (OpenStreetMap Routing Machine). */
export async function fetchOsrmRoute(from: GeoPoint, to: GeoPoint, signal?: AbortSignal): Promise<RouteGeometry | null> {
  if (!isValidGeoPoint(from) || !isValidGeoPoint(to)) return null;
  const straightKm = haversineDistanceKm(from, to);
  if (straightKm < 0.02) {
    return {
      coordinates: [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ],
      distanceKm: straightKm,
      durationMin: 1,
    };
  }
  try {
    const coords = `${from.lng.toFixed(6)},${from.lat.toFixed(6)};${to.lng.toFixed(6)},${to.lat.toFixed(6)}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: [number, number][] };
      }>;
    };
    const route = data?.routes?.[0];
    const rawCoords = route?.geometry?.coordinates;
    if (!route || !Array.isArray(rawCoords) || rawCoords.length < 2) return null;
    const coordinates: [number, number][] = rawCoords.map(([lng, lat]) => [lat, lng]);
    const distanceKm = typeof route.distance === 'number' ? route.distance / 1000 : straightKm * 1.3;
    const durationMin =
      typeof route.duration === 'number' ? Math.max(1, Math.ceil(route.duration / 60)) : estimateDriveMinutes(distanceKm, null, true);
    return { coordinates, distanceKm, durationMin };
  } catch {
    return null;
  }
}
