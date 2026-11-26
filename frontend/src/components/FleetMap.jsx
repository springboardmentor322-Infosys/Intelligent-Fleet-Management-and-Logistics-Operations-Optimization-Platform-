import React, { useEffect, useRef, useState } from 'react';
import {
  fetchRoadCandidates,
  pickRouteForStrategy,
  pointAtRoadFraction,
  resolveHubCoords
} from '../routingEngine';

const MAP_STYLES = {
  google_road: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    options: {
      maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }
  },
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
    }
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    options: {
      maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }
  }
};

function resolveVehicleCoords(vehicle, index) {
  if (typeof vehicle.lat === 'number' && typeof vehicle.lng === 'number') {
    return [vehicle.lat, vehicle.lng];
  }
  const known = resolveHubCoords(vehicle.location);
  if (known) return known;
  const offset = (index % 7) * 0.003;
  return [12.9716 + offset, 77.5946 + offset];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

export default function FleetMap({
  vehicles = [],
  trips = [],
  activeRoutes = [],
  selectedVehicleId = null,
  activeCount = 0,
  availableCount = 0,
  wsConnected = false,
  onNavigate,
  onToast,
  isVisible = true,
  tall = false
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const baseLayerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const markerLayerRef = useRef(null);
  const markersMapRef = useRef(new Map());
  const snappedTripsRef = useRef({});
  const snapKeysRef = useRef({});
  const lastFitKeyRef = useRef('');
  const didInitialFitRef = useRef(false);
  const iconKeysRef = useRef(new Map());
  const [roadSnapVersion, setRoadSnapVersion] = useState(0);

  const [mapStyle, setMapStyle] = useState(() => {
    const saved = localStorage.getItem('fleetflow-map-style');
    return ['google_road', 'street', 'satellite', 'dark'].includes(saved) ? saved : 'google_road';
  });
  const [tilesLimited, setTilesLimited] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(null);

  const focusedVehicle =
    vehicles.find((v) => v.id === selectedVehicleId) ||
    vehicles.find((v) => v.status === 'On route') ||
    vehicles[0] ||
    null;

  const focusedTrip = focusedVehicle
    ? trips.find(
        (t) => t.vehicle === focusedVehicle.id && ['In transit', 'Delayed', 'Scheduled'].includes(t.status)
      )
    : trips.find((t) => ['In transit', 'Delayed'].includes(t.status)) || null;

  // Road path for a trip: stored dense geometry wins, then a snapped OSRM path, then sparse stored points.
  const tripPath = (t) => {
    const stored = Array.isArray(t.waypoints) ? t.waypoints : [];
    if (stored.length >= 25) return stored;
    const snapped = snappedTripsRef.current[t.id];
    if (snapped) return snapped;
    if (stored.length >= 2) return stored;
    const a = resolveHubCoords(t.from);
    const b = resolveHubCoords(t.to);
    return a && b ? [a, b] : [];
  };

  // Reset scrub preview when switching vehicles
  useEffect(() => {
    setPreviewProgress(null);
  }, [selectedVehicleId]);

  // Initialize Leaflet Map
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !window.L) return;

    if (!mapRef.current) {
      const map = window.L.map(host, {
        center: [12.955, 77.635],
        zoom: 12,
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: true
      });
      mapRef.current = map;
      map.on('click', () => map.scrollWheelZoom.enable());
      map.on('mouseout', () => map.scrollWheelZoom.disable());
      routeLayerRef.current = window.L.layerGroup().addTo(map);
      markerLayerRef.current = window.L.layerGroup().addTo(map);
      setTimeout(() => map.invalidateSize(), 180);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        baseLayerRef.current = null;
        routeLayerRef.current = null;
        markerLayerRef.current = null;
        markersMapRef.current.clear();
        iconKeysRef.current.clear();
        didInitialFitRef.current = false;
        lastFitKeyRef.current = '';
      }
    };
  }, []);

  // Switch Basemap Layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L || !MAP_STYLES[mapStyle]) return;
    localStorage.setItem('fleetflow-map-style', mapStyle);
    if (baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
    }
    const config = MAP_STYLES[mapStyle];
    const layer = window.L.tileLayer(config.url, config.options).addTo(map);
    layer.on('tileerror', () => setTilesLimited(true));
    layer.on('tileload', () => setTilesLimited(false));
    baseLayerRef.current = layer;
  }, [mapStyle]);

  // Snap trips that only have sparse stored waypoints (e.g. seed data) to real OSRM road geometry.
  useEffect(() => {
    let active = true;
    trips
      .filter((t) => ['In transit', 'Delayed', 'Scheduled'].includes(t.status))
      .forEach(async (t) => {
        const stored = Array.isArray(t.waypoints) ? t.waypoints : [];
        if (stored.length >= 25) return;
        const o = t.originCoords || (stored.length ? stored[0] : resolveHubCoords(t.from));
        const d = t.destCoords || (stored.length ? stored[stored.length - 1] : resolveHubCoords(t.to));
        if (!o || !d) return;
        const key = `${t.from}|${t.to}|${t.routeStrategy}`;
        if (snapKeysRef.current[t.id] === key) return;
        snapKeysRef.current[t.id] = key;
        const cands = await fetchRoadCandidates(o, d);
        if (active && cands.length) {
          snappedTripsRef.current[t.id] = pickRouteForStrategy(o, d, cands, t.routeStrategy || 'Fastest Route').waypoints;
          setRoadSnapVersion((v) => v + 1);
        } else if (!cands.length) {
          delete snapKeysRef.current[t.id]; // retry on next trips refresh
        }
      });
    return () => {
      active = false;
    };
  }, [trips]);

  // Draw Google-Maps-style Street Polylines (Completed Trail + Active Blue Corridor + A/B Pins)
  useEffect(() => {
    const routeLayer = routeLayerRef.current;
    if (!routeLayer || !window.L) return;

    routeLayer.clearLayers();

    const drawStreetCorridor = (
      waypoints,
      { isPrimary = true, isDelayed = false, progressFraction = null, label = '', meta = '' } = {}
    ) => {
      if (!Array.isArray(waypoints) || waypoints.length < 2) return;

      // Outer street border casing
      window.L.polyline(waypoints, {
        color: isPrimary ? (isDelayed ? '#b45309' : '#1557b0') : '#94a3b8',
        weight: isPrimary ? 8 : 5.5,
        opacity: isPrimary ? 0.92 : 0.6,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(routeLayer);

      // Inner solid Google Blue (#4285f4) or unselected grey corridor
      const coreLine = window.L.polyline(waypoints, {
        color: isPrimary ? (isDelayed ? '#fbbf24' : '#4285f4') : '#e2e8f0',
        weight: isPrimary ? 4.8 : 3.2,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        className: isPrimary ? 'gmaps-route-stroke-reveal' : ''
      });

      if (label) {
        coreLine.bindPopup(
          `<div class="fleet-popup"><b>${escapeHtml(label)}</b><span>${escapeHtml(meta)}</span></div>`
        );
      }
      coreLine.addTo(routeLayer);

      // If progressFraction is provided, overlay the traversed segment in subtle slate-blue
      if (isPrimary && typeof progressFraction === 'number' && progressFraction > 0.02) {
        const sample = pointAtRoadFraction(waypoints, progressFraction);
        if (sample && sample.splitIndex > 0) {
          const completedPts = [...waypoints.slice(0, sample.splitIndex + 1), sample.pos];
          window.L.polyline(completedPts, {
            color: '#93c5fd',
            weight: 4.8,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(routeLayer);
        }
      }

      if (isPrimary) {
        const startPt = waypoints[0];
        const endPt = waypoints[waypoints.length - 1];

        const originIcon = window.L.divIcon({
          html: `<div class="gmaps-endpoint-pin origin"><span>A</span></div>`,
          className: 'gps-div-icon-wrap',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        window.L.marker(startPt, { icon: originIcon, interactive: false }).addTo(routeLayer);

        const destIcon = window.L.divIcon({
          html: `<div class="gmaps-endpoint-pin dest"><span>B</span></div>`,
          className: 'gps-div-icon-wrap',
          iconSize: [28, 34],
          iconAnchor: [14, 32]
        });
        window.L.marker(endPt, { icon: destIcon, interactive: false }).addTo(routeLayer);
      }
    };

    if (activeRoutes && activeRoutes.length > 0) {
      // Draw unselected alternatives underneath
      activeRoutes
        .filter((r) => !r.selected)
        .forEach((rt) =>
          drawStreetCorridor(rt.waypoints, {
            isPrimary: false,
            label: rt.strategy,
            meta: `${rt.distanceKm} km · ${rt.durationMin} mins (ETA ${rt.etaDisplay || ''})`
          })
        );

      // Draw selected primary route on top
      const primaryRt = activeRoutes.find((r) => r.selected) || activeRoutes[0];
      if (primaryRt) {
        drawStreetCorridor(primaryRt.waypoints, {
          isPrimary: true,
          isDelayed: primaryRt.trafficLevel === 'Heavy',
          label: `${primaryRt.strategy} (${primaryRt.badge})`,
          meta: `${primaryRt.distanceKm} km · ${primaryRt.durationMin} mins · ETA ${primaryRt.etaDisplay || ''}`
        });

        if (mapRef.current && Array.isArray(primaryRt.waypoints) && primaryRt.waypoints.length >= 2) {
          const first = primaryRt.waypoints[0];
          const last = primaryRt.waypoints[primaryRt.waypoints.length - 1];
          const fitKey = `${first[0].toFixed(3)},${first[1].toFixed(3)}>${last[0].toFixed(3)},${last[1].toFixed(3)}`;
          if (lastFitKeyRef.current !== fitKey) {
            lastFitKeyRef.current = fitKey;
            mapRef.current.fitBounds(window.L.latLngBounds(primaryRt.waypoints), { padding: [46, 46] });
          }
        }
      }
    } else {
      const coveredVehicles = new Set();
      trips
        .filter((t) => ['In transit', 'Delayed'].includes(t.status))
        .forEach((t) => {
          if (t.vehicle) coveredVehicles.add(t.vehicle);
          const pts = tripPath(t);
          const isFocus = focusedTrip && t.id === focusedTrip.id;
          const progFrac =
            isFocus && previewProgress !== null
              ? previewProgress / 100
              : Number(t.progress || 0) / 100;

          drawStreetCorridor(pts, {
            isPrimary: isFocus || trips.length <= 2,
            isDelayed: t.status === 'Delayed',
            progressFraction: progFrac,
            label: `${t.id}: ${t.from} → ${t.to}`,
            meta: `${t.routeStrategy || 'Fastest Route'} · ETA ${t.eta} (${t.driver})`
          });
        });

      // Vehicles without an assigned trip remain at their current station/location without a synthetic trip path.
      void coveredVehicles;
    }
  }, [trips, activeRoutes, focusedTrip, roadSnapVersion, previewProgress]);

  // Strict Trip-Driven Vehicle Marker Positioning:
  // Each vehicle follows ONLY the trip assigned to it (trip.vehicle === vehicle.id) along that trip's street path & progress.
  useEffect(() => {
    const markerLayer = markerLayerRef.current;
    if (!markerLayer || !window.L) return;

    const activeIds = new Set(vehicles.map((v) => v.id));
    for (const [id, marker] of markersMapRef.current.entries()) {
      if (!activeIds.has(id)) {
        markerLayer.removeLayer(marker);
        markersMapRef.current.delete(id);
      }
    }

    vehicles.forEach((vehicle, index) => {
      const assignedTrip = trips.find(
        (t) => t.vehicle === vehicle.id && t.status !== 'Delivered' && t.status !== 'Cancelled'
      );

      let [lat, lng] = resolveVehicleCoords(vehicle, index);
      let heading = 0;

      if (assignedTrip) {
        const roadPts = tripPath(assignedTrip);
        if (roadPts && roadPts.length >= 2) {
          const isFocus = focusedVehicle && vehicle.id === focusedVehicle.id;
          const rawPct =
            isFocus && previewProgress !== null
              ? previewProgress
              : Number(assignedTrip.progress ?? (assignedTrip.status === 'Scheduled' ? 0 : 35));
          const frac = Math.min(1, Math.max(0, rawPct / 100));
          const sample = pointAtRoadFraction(roadPts, frac);
          const hasLiveFix =
            vehicle.lastPingAt && typeof vehicle.lat === 'number' && typeof vehicle.lng === 'number';
          const scrubbing = isFocus && previewProgress !== null;
          if (sample) {
            // A real GPS fix wins over the trip-progress estimate (unless the user is scrubbing the preview).
            if (!hasLiveFix || scrubbing) [lat, lng] = sample.pos;
            heading = sample.heading;
          }
        }
      }

      const isSelected = selectedVehicleId === vehicle.id;
      const statusClass =
        vehicle.status === 'On route'
          ? 'pin-moving'
          : vehicle.status === 'In service'
          ? 'pin-maint'
          : 'pin-idle';

      const speedVal = Math.round(Number(vehicle.speed || 0));

      const iconHtml = `
        <div class="gmaps-nav-marker ${statusClass} ${isSelected ? 'is-selected' : ''}">
          ${vehicle.status === 'On route' ? '<span class="gmaps-nav-halo"></span>' : ''}
          <div class="gmaps-nav-puck" style="transform: rotate(${Math.round(heading)}deg)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
            </svg>
          </div>
          <div class="gmaps-nav-pill">
            <b>${escapeHtml(vehicle.id)}</b>
            ${speedVal > 0 ? `<span>${speedVal} km/h</span>` : `<span>Idle</span>`}
          </div>
        </div>
      `;

      const makeIcon = () =>
        window.L.divIcon({
          html: iconHtml,
          className: 'gps-div-icon-wrap gmaps-smooth-glide-marker',
          iconSize: [104, 54],
          iconAnchor: [52, 22]
        });

      let marker = markersMapRef.current.get(vehicle.id);
      if (!marker) {
        marker = window.L.marker([lat, lng], { icon: makeIcon() }).addTo(markerLayer);
        markersMapRef.current.set(vehicle.id, marker);
        iconKeysRef.current.set(vehicle.id, iconHtml);
      } else {
        marker.setLatLng([lat, lng]);
        if (iconKeysRef.current.get(vehicle.id) !== iconHtml) {
          marker.setIcon(makeIcon());
          iconKeysRef.current.set(vehicle.id, iconHtml);
        }
      }

      const isHardware = vehicle.gpsSource === 'HARDWARE_GPS_SIM_DEVICE';
      const sourceBadge = isHardware ? 'Hardware 4G LTE GPS' : 'Simulated GPS Test Data';

      marker.bindPopup(
        `<div class="fleet-popup">
          <b>${escapeHtml(vehicle.name)} (${escapeHtml(vehicle.id)})</b>
          <span>${escapeHtml(vehicle.status)} · ${Number(vehicle.speed || 0).toFixed(1)} km/h</span>
          <small>${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E</small>
          <small>${assignedTrip ? `Trip ${escapeHtml(assignedTrip.id)}: ${escapeHtml(assignedTrip.from)} → ${escapeHtml(assignedTrip.to)} (ETA ${escapeHtml(assignedTrip.eta)})` : escapeHtml(vehicle.location || 'Bengaluru')}</small>
          <small style="color:${isHardware ? '#15803d' : '#b45309'};font-weight:600">${sourceBadge}</small>
        </div>`
      );
    });

    const map = mapRef.current;
    if (map && !didInitialFitRef.current && vehicles.length && !activeRoutes?.length) {
      didInitialFitRef.current = true;
      const pts = [...markersMapRef.current.values()].map((m) => m.getLatLng());
      if (pts.length) map.fitBounds(window.L.latLngBounds(pts), { padding: [60, 60], maxZoom: 13 });
    }
  }, [vehicles, trips, selectedVehicleId, roadSnapVersion, previewProgress, focusedVehicle]);

  // Pan to the selected vehicle only when the selection changes (not on every telemetry tick).
  useEffect(() => {
    if (!selectedVehicleId || !mapRef.current) return;
    const selMarker = markersMapRef.current.get(selectedVehicleId);
    if (selMarker) mapRef.current.panTo(selMarker.getLatLng(), { animate: true, duration: 0.7 });
  }, [selectedVehicleId]);

  useEffect(() => {
    if (isVisible && mapRef.current) {
      const timer = setTimeout(() => mapRef.current?.invalidateSize({ pan: false }), 320);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  const handleFitAll = () => {
    if (!mapRef.current || !window.L || !vehicles.length) return;
    const live = [...markersMapRef.current.values()].map((m) => m.getLatLng());
    const coords = live.length ? live : vehicles.map((v, i) => resolveVehicleCoords(v, i));
    const bounds = window.L.latLngBounds(coords);
    mapRef.current.fitBounds(bounds, { padding: [44, 44], maxZoom: 13 });
  };

  const handleLocate = () => {
    if (!navigator.geolocation) {
      onToast?.('Location is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.flyTo([position.coords.latitude, position.coords.longitude], 14, { duration: 0.8 });
      },
      () => onToast?.('Location permission was not granted.')
    );
  };

  const displayProgress =
    previewProgress !== null ? previewProgress : Number(focusedTrip?.progress ?? 45);

  return (
    <section className="panel map-panel">
      <div className="panel-heading map-heading">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            Live GPS Route Tracking
            <span className={`ws-pill ${wsConnected ? 'online' : 'offline'}`}>
              {wsConnected ? '● WS LIVE' : '○ RECONNECTING'}
            </span>
          </h2>
          <p>Real-road OSRM street geometry &amp; smooth GPS telemetry glide.</p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button className="map-locate" type="button" title="Fit all fleet vehicles" onClick={handleFitAll}>
            ⊞ <span>Fit Fleet</span>
          </button>
          <button className="map-locate" type="button" title="Show my location" onClick={handleLocate}>
            ◎ <span>Locate</span>
          </button>
        </div>
      </div>

      <div className="map-view-controls" role="group" aria-label="Map style">
        {[
          { id: 'google_road', label: 'Google Road' },
          { id: 'street', label: 'Standard' },
          { id: 'satellite', label: 'Satellite' },
          { id: 'dark', label: 'Night Nav' }
        ].map((style) => (
          <button
            key={style.id}
            className={`map-view ${mapStyle === style.id ? 'active' : ''}`}
            type="button"
            onClick={() => setMapStyle(style.id)}
          >
            {style.label}
          </button>
        ))}
      </div>

      <div className="gmaps-stage-wrapper">
        <div
          ref={hostRef}
          id="fleet-map"
          className={`fleet-map ${tall ? 'fleet-map-tall' : ''} ${tilesLimited ? 'map-tiles-limited' : ''}`}
          aria-label="Interactive Google-style live fleet tracking map"
        >
          {!window.L && (
            <div className="map-unavailable">The interactive map needs an internet connection to load.</div>
          )}
        </div>

        {/* Clean Google-Maps-style Live Navigation HUD + Interactive Road Scrubber */}
        {focusedTrip && !activeRoutes?.length && (
          <div className="gmaps-floating-hud">
            <div className="gmaps-hud-top-row">
              <div className="gmaps-hud-turn">
                <span className="gmaps-turn-arrow">↱</span>
                <div>
                  <small>{focusedTrip.id} · {focusedTrip.routeStrategy || 'Fastest Route'}</small>
                  <b>{focusedTrip.from} → {focusedTrip.to}</b>
                </div>
              </div>
              <div className="gmaps-hud-eta">
                <span className="gmaps-eta-time">{focusedTrip.eta}</span>
                <small>
                  {focusedTrip.distanceKm || 16.4} km · {displayProgress}% complete
                </small>
              </div>
            </div>
            <div className="gmaps-hud-scrubber">
              <span>Route Progress Preview:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={displayProgress}
                onChange={(e) => setPreviewProgress(Number(e.target.value))}
                aria-label="Preview vehicle progress along road"
              />
              {previewProgress !== null && (
                <button
                  type="button"
                  className="inline-action"
                  onClick={() => setPreviewProgress(null)}
                >
                  Live
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="map-pin-legend">
        <span><i className="gmaps-blue-line-swatch" />Real-Road Blue Route</span>
        <span><i className="pin-onroute" />Moving Vehicle</span>
        <span><i className="pin-available" />Idle / Available</span>
        <span className="sim-badge-legend">SIMULATED TEST TELEMETRY</span>
      </div>

      <div className="map-summary">
        <div>
          <span className="summary-dot moving" />
          <b>{activeCount}</b>
          <span>on route</span>
        </div>
        <div>
          <span className="summary-dot parked" />
          <b>{availableCount}</b>
          <span>available</span>
        </div>
        {onNavigate && (
          <a
            href="#tracking"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('tracking');
            }}
          >
            Open Live GPS Console <span>→</span>
          </a>
        )}
      </div>
    </section>
  );
}
