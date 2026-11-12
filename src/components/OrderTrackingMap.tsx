import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Navigation } from 'lucide-react';
import {
  bearingDegrees,
  estimateDriveMinutes,
  fetchOsrmRoute,
  formatDistance,
  haversineDistanceKm,
  isValidGeoPoint,
  type GeoPoint,
  type RouteGeometry,
} from '../lib/geo';

interface OrderTrackingMapProps {
  /** Restaurant / trailer coordinates */
  storePoint?: GeoPoint | null;
  storeLabel?: string;
  /** Customer delivery / pickup coordinates */
  destinationPoint?: GeoPoint | null;
  destinationLabel?: string;
  /** Real-time driver GPS coordinates */
  driverPoint?: GeoPoint | null;
  driverLabel?: string;
  /** When provided, clicking the map or dragging the primary pin updates coordinates */
  onSelectPoint?: (point: GeoPoint) => void;
  /** Which pin is draggable when onSelectPoint is provided */
  editablePin?: 'destination' | 'store';
  /** Height class for the map viewport */
  heightClassName?: string;
  /** Optional surface style */
  surface?: 'store' | 'admin';
  /** Show route polyline and distance/ETA telemetry bar */
  showRoute?: boolean;
}

const DEFAULT_CENTER: GeoPoint = { lat: 37.7749, lng: -122.4194 };

function createPinIcon(kind: 'store' | 'destination' | 'driver', headingDeg?: number | null) {
  if (kind === 'driver') {
    const rot = typeof headingDeg === 'number' && Number.isFinite(headingDeg) ? Math.round(headingDeg) : 0;
    return L.divIcon({
      className: 'osm-custom-pin',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      html: `
        <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
          <span style="position:absolute;inset:2px;border-radius:9999px;background:rgba(16,185,129,0.28);animation:ping 1.8s cubic-bezier(0,0,0.2,1) infinite;"></span>
          <div style="position:relative;width:32px;height:32px;border-radius:9999px;background:#059669;border:2.5px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center;color:#ffffff;transform:rotate(${rot}deg);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
            </svg>
          </div>
        </div>
      `,
    });
  }

  if (kind === 'store') {
    return L.divIcon({
      className: 'osm-custom-pin',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      html: `
        <div style="width:34px;height:34px;border-radius:9999px;background:#1A211A;border:2.5px solid #ffffff;box-shadow:0 4px 10px rgba(0,0,0,0.22);display:flex;align-items:center;justify-content:center;color:#ffffff;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </div>
      `,
    });
  }

  return L.divIcon({
    className: 'osm-custom-pin',
    iconSize: [36, 42],
    iconAnchor: [18, 38],
    html: `
      <div style="position:relative;width:36px;height:42px;display:flex;flex-direction:column;align-items:center;">
        <div style="width:32px;height:32px;border-radius:9999px;background:#E11D48;border:2.5px solid #ffffff;box-shadow:0 4px 10px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:#ffffff;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
        </div>
        <div style="width:6px;height:6px;border-radius:9999px;background:#E11D48;margin-top:2px;"></div>
      </div>
    `,
  });
}

export const OrderTrackingMap: React.FC<OrderTrackingMapProps> = ({
  storePoint,
  storeLabel = 'Restaurant',
  destinationPoint,
  destinationLabel = 'Delivery address',
  driverPoint,
  driverLabel = 'Driver (live GPS)',
  onSelectPoint,
  editablePin = 'destination',
  heightClassName = 'h-64 sm:h-72',
  showRoute = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const hasAutoFittedRef = useRef(false);
  const onSelectRef = useRef(onSelectPoint);
  onSelectRef.current = onSelectPoint;

  const validStore = isValidGeoPoint(storePoint) ? storePoint : null;
  const validDest = isValidGeoPoint(destinationPoint) ? destinationPoint : null;
  const validDriver = isValidGeoPoint(driverPoint) ? driverPoint : null;

  // Active route origin is the driver's live GPS when available, otherwise the store.
  const routeOrigin = validDriver || validStore;
  const routeTarget = validDest;

  const [route, setRoute] = useState<RouteGeometry | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!validDriver?.updatedAt) return;
    const t = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, [validDriver?.updatedAt]);

  // Fetch street-level route via OSRM when origin & target exist
  useEffect(() => {
    if (!showRoute || !routeOrigin || !routeTarget) {
      setRoute(null);
      return;
    }
    const ctrl = new AbortController();
    fetchOsrmRoute(routeOrigin, routeTarget, ctrl.signal).then((r) => {
      if (!ctrl.signal.aborted) setRoute(r);
    });
    return () => ctrl.abort();
  }, [
    showRoute,
    routeOrigin?.lat,
    routeOrigin?.lng,
    routeTarget?.lat,
    routeTarget?.lng,
  ]);

  // Initialize Leaflet map once
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const initialCenter = validDriver || validDest || validStore || DEFAULT_CENTER;
    const map = L.map(el, {
      center: [initialCenter.lat, initialCenter.lng],
      zoom: 14,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!onSelectRef.current) return;
      onSelectRef.current({
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
        updatedAt: Date.now(),
      });
    });

    // Ensure proper sizing inside drawers/cards
    const timer = window.setTimeout(() => map.invalidateSize(), 120);

    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render markers & route polylines whenever points or route update
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsPoints: [number, number][] = [];

    // 1. Route polyline
    if (showRoute && routeOrigin && routeTarget) {
      const coords: [number, number][] =
        route && route.coordinates.length >= 2
          ? route.coordinates
          : [
              [routeOrigin.lat, routeOrigin.lng],
              [routeTarget.lat, routeTarget.lng],
            ];
      L.polyline(coords, {
        color: validDriver ? '#059669' : '#1A211A',
        weight: 4,
        opacity: 0.85,
        dashArray: route ? undefined : '6, 8',
      }).addTo(group);
    }

    // 2. Store marker
    if (validStore) {
      const draggable = !!onSelectPoint && editablePin === 'store';
      const marker = L.marker([validStore.lat, validStore.lng], {
        icon: createPinIcon('store'),
        draggable,
      })
        .bindTooltip(storeLabel, { direction: 'top', offset: [0, -14] })
        .addTo(group);

      if (draggable) {
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          onSelectRef.current?.({
            lat: Number(pos.lat.toFixed(6)),
            lng: Number(pos.lng.toFixed(6)),
            updatedAt: Date.now(),
          });
        });
      }
      boundsPoints.push([validStore.lat, validStore.lng]);
    }

    // 3. Destination marker
    if (validDest) {
      const draggable = !!onSelectPoint && editablePin === 'destination';
      const marker = L.marker([validDest.lat, validDest.lng], {
        icon: createPinIcon('destination'),
        draggable,
      })
        .bindTooltip(destinationLabel, { direction: 'top', offset: [0, -32] })
        .addTo(group);

      if (draggable) {
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          onSelectRef.current?.({
            lat: Number(pos.lat.toFixed(6)),
            lng: Number(pos.lng.toFixed(6)),
            updatedAt: Date.now(),
          });
        });
      }
      boundsPoints.push([validDest.lat, validDest.lng]);
    }

    // 4. Live Driver GPS marker + accuracy halo
    if (validDriver) {
      const heading =
        typeof validDriver.heading === 'number' && Number.isFinite(validDriver.heading)
          ? validDriver.heading
          : validDest
            ? bearingDegrees(validDriver, validDest)
            : 0;

      if (typeof validDriver.accuracy === 'number' && validDriver.accuracy > 5 && validDriver.accuracy < 500) {
        L.circle([validDriver.lat, validDriver.lng], {
          radius: validDriver.accuracy,
          color: '#10B981',
          fillColor: '#10B981',
          fillOpacity: 0.1,
          weight: 1,
        }).addTo(group);
      }

      L.marker([validDriver.lat, validDriver.lng], {
        icon: createPinIcon('driver', heading),
        zIndexOffset: 1000,
      })
        .bindTooltip(driverLabel, { direction: 'top', offset: [0, -18] })
        .addTo(group);

      boundsPoints.push([validDriver.lat, validDriver.lng]);
    }

    if (boundsPoints.length >= 2 && !hasAutoFittedRef.current) {
      hasAutoFittedRef.current = true;
      map.fitBounds(L.latLngBounds(boundsPoints), { padding: [38, 38], maxZoom: 16 });
    } else if (boundsPoints.length === 1 && !hasAutoFittedRef.current) {
      hasAutoFittedRef.current = true;
      map.setView(boundsPoints[0], 15);
    }
  }, [validStore, validDest, validDriver, route, showRoute, routeOrigin, routeTarget, storeLabel, destinationLabel, driverLabel, onSelectPoint, editablePin]);

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const pts: [number, number][] = [];
    if (validStore) pts.push([validStore.lat, validStore.lng]);
    if (validDest) pts.push([validDest.lat, validDest.lng]);
    if (validDriver) pts.push([validDriver.lat, validDriver.lng]);
    if (pts.length >= 2) {
      map.fitBounds(L.latLngBounds(pts), { padding: [38, 38], maxZoom: 16, animate: true });
    } else if (pts.length === 1) {
      map.setView(pts[0], 16, { animate: true });
    }
  };

  const telemetry = useMemo(() => {
    if (!showRoute || !routeOrigin || !routeTarget) return null;
    const straightKm = haversineDistanceKm(routeOrigin, routeTarget);
    const distanceKm = route ? route.distanceKm : straightKm * 1.25;
    const etaMin = route
      ? route.durationMin
      : estimateDriveMinutes(straightKm, validDriver?.speed ?? null, false);
    const ageSec = validDriver?.updatedAt ? Math.max(0, Math.round((nowMs - validDriver.updatedAt) / 1000)) : null;
    const ageLabel =
      ageSec === null
        ? null
        : ageSec < 10
          ? 'Updated just now'
          : ageSec < 60
            ? `Updated ${ageSec}s ago`
            : `Updated ${Math.round(ageSec / 60)}m ago`;
    return {
      distanceLabel: formatDistance(distanceKm),
      etaMin,
      ageLabel,
      isLiveDriver: !!validDriver,
    };
  }, [showRoute, routeOrigin, routeTarget, route, validDriver, nowMs]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-gray-200/80 bg-gray-100">
      {telemetry && (
        <div className="
          absolute top-3 left-3 right-14 z-[400]
          inline-flex flex-wrap items-center gap-x-3 gap-y-1
          rounded-xl bg-gray-900/90 backdrop-blur-md text-white
          px-3.5 py-2 text-xs font-medium shadow-md max-w-fit
        ">
          {telemetry.isLiveDriver ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live GPS
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-gray-300 font-semibold">
              <Navigation size={12} /> Route
            </span>
          )}
          <span className="font-mono tabular-nums font-bold">{telemetry.distanceLabel}</span>
          <span className="text-gray-400">·</span>
          <span className="font-mono tabular-nums font-semibold">~{telemetry.etaMin} min drive</span>
          {telemetry.ageLabel && (
            <>
              <span className="text-gray-400 hidden sm:inline">·</span>
              <span className="text-[11px] text-gray-300 hidden sm:inline">{telemetry.ageLabel}</span>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={recenter}
        title="Fit pins in view"
        aria-label="Center map on markers"
        className="absolute top-3 right-3 z-[400] w-9 h-9 rounded-xl bg-white/95 hover:bg-white text-gray-800 border border-gray-200 shadow-sm flex items-center justify-center transition"
      >
        <LocateFixed size={16} />
      </button>

      <div ref={containerRef} className={`w-full ${heightClassName} z-0`} />

      {onSelectPoint && (
        <div className="bg-white/95 border-t border-gray-200/80 px-3.5 py-2 text-[11px] text-gray-600 flex items-center justify-between gap-2">
          <span>Tap anywhere on the map or drag the pin to set the exact GPS spot.</span>
          {(validDest || validStore) && (
            <span className="font-mono tabular-nums text-gray-500 shrink-0">
              {((editablePin === 'store' ? validStore : validDest)?.lat ?? 0).toFixed(4)},{' '}
              {((editablePin === 'store' ? validStore : validDest)?.lng ?? 0).toFixed(4)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
