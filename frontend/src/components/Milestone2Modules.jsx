import React, { useEffect, useRef, useState } from 'react';
import FleetMap from './FleetMap';
import Tilt3DCard from './Tilt3DCard';
import { apiRequest } from '../api';
import {
  buildLocalRoutes,
  fetchRoadCandidates,
  geocodeAnyPlace,
  pathLengthKm,
  pointAtRoadFraction,
  simplifyPath
} from '../routingEngine';

const HUB_PRESETS = [
  { name: 'Whitefield Hub', lat: 12.9698, lng: 77.7500 },
  { name: 'Marathahalli Bridge', lat: 12.9569, lng: 77.7011 },
  { name: 'Indiranagar 100ft Rd', lat: 12.9784, lng: 77.6408 },
  { name: 'Koramangala Hub', lat: 12.9352, lng: 77.6245 },
  { name: 'Silk Board Junction', lat: 12.9177, lng: 77.6238 },
  { name: 'Electronic City Phase 1', lat: 12.8452, lng: 77.6602 },
  { name: 'Jayanagar 4th Block', lat: 12.9250, lng: 77.5838 },
  { name: 'Yeshwanthpur Depot', lat: 13.0285, lng: 77.5407 },
  { name: 'Hebbal Flyover', lat: 13.0358, lng: 77.5970 },
  { name: 'MG Road Central', lat: 12.9751, lng: 77.6068 }
];

export function LiveTrackingConsole({
  state,
  wsConnected,
  wsLog = [],
  token,
  onRefresh,
  onToast
}) {
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    state.vehicles[0]?.id || 'VH-1042'
  );
  const [simLat, setSimLat] = useState(12.9569);
  const [simLng, setSimLng] = useState(77.7011);
  const [simSpeed, setSimSpeed] = useState(46);
  const [simLabel, setSimLabel] = useState('Marathahalli Bridge, Bengaluru');
  const [autoStream, setAutoStream] = useState(false);

  const selectedVehicle =
    state.vehicles.find((v) => v.id === selectedVehicleId) || state.vehicles[0];

  const handleSelectVehicle = (v) => {
    setSelectedVehicleId(v.id);
    if (typeof v.lat === 'number') setSimLat(v.lat);
    if (typeof v.lng === 'number') setSimLng(v.lng);
    setSimSpeed(v.speed || 42);
    setSimLabel(v.location || 'Bengaluru');
  };

  const sendSimulatedPing = async (customLat, customLng, customLabel, progress) => {
    if (!selectedVehicle) return;
    try {
      await apiRequest(
        '/api/gps/ping',
        {
          method: 'POST',
          body: JSON.stringify({
            vehicleId: selectedVehicle.id,
            deviceId: selectedVehicle.gpsDeviceId || `GPS-SIM-${selectedVehicle.id.slice(-4)}`,
            lat: Number(customLat ?? simLat),
            lng: Number(customLng ?? simLng),
            speed: Number(simSpeed),
            locationLabel: customLabel ?? simLabel,
            ...(progress !== undefined ? { progress } : {}),
            source: 'SIMULATED_TELEMATICS'
          })
        },
        token
      );
      await onRefresh();
    } catch (err) {
      onToast(err.message);
    }
  };

  // Auto-move: follow the vehicle's assigned road route (time-accelerated demo), else a gentle random walk.
  const tripsRef = useRef(state.trips);
  tripsRef.current = state.trips;
  const simRef = useRef({ lat: simLat, lng: simLng, speed: simSpeed });
  simRef.current = { lat: simLat, lng: simLng, speed: simSpeed };

  useEffect(() => {
    if (!autoStream || !selectedVehicle) return undefined;
    const timer = setInterval(() => {
      const trip = tripsRef.current.find(
        (t) => t.vehicle === selectedVehicle.id && ['In transit', 'Delayed'].includes(t.status)
      );
      const wps = trip?.waypoints;
      if (Array.isArray(wps) && wps.length >= 2) {
        const km = Number(trip.distanceKm) || pathLengthKm(wps);
        const speed = Math.max(20, Number(simRef.current.speed) || 40);
        const stepPct = Math.max(1, ((speed * (3.5 / 3600) * 25) / Math.max(km, 1)) * 100);
        const nextPct = Math.min(100, Math.round(Number(trip.progress || 0) + stepPct));
        const sample = pointAtRoadFraction(wps, nextPct / 100);
        if (sample) {
          setSimLat(Number(sample.pos[0].toFixed(5)));
          setSimLng(Number(sample.pos[1].toFixed(5)));
          sendSimulatedPing(sample.pos[0], sample.pos[1], `${trip.from} → ${trip.to} (${nextPct}%)`, nextPct);
        }
        if (nextPct >= 100) {
          setAutoStream(false);
          onToast(`${selectedVehicle.id} reached ${trip.to}. Mark the trip Delivered to finish.`);
        }
        return;
      }
      const nextLat = Number((Number(simRef.current.lat) + (Math.random() - 0.35) * 0.0045).toFixed(5));
      const nextLng = Number((Number(simRef.current.lng) + (Math.random() - 0.35) * 0.0045).toFixed(5));
      setSimLat(nextLat);
      setSimLng(nextLng);
      sendSimulatedPing(nextLat, nextLng, `Live Corridor (${nextLat.toFixed(4)}° N, ${nextLng.toFixed(4)}° E)`);
    }, 3500);
    return () => clearInterval(timer);
  }, [autoStream, selectedVehicleId]);

  const movingVehicles = state.vehicles.filter((v) => v.status === 'On route');
  const avgFleetSpeed = movingVehicles.length
    ? (
        movingVehicles.reduce((acc, v) => acc + Number(v.speed || 0), 0) /
        movingVehicles.length
      ).toFixed(1)
    : '0.0';

  return (
    <div className="live-tracking-page">
      {/* Modern Dark-Emerald Satellite Telemetry Command Banner */}
      <section className="gps-command-hero">
        <div className="gps-command-top">
          <div>
            <div className="gps-command-kicker">
              <span className="gps-sat-pulse" /> SATELLITE &amp; 4G LTE TELEMATICS COMMAND
            </div>
            <h1>Live GPS Tracking Console</h1>
            <p>
              Dedicated phone-independent vehicle GPS trackers streaming coordinates over cellular M2M SIM to FastAPI WebSockets.
            </p>
          </div>
          <div className="gps-command-badges">
            <span className={`ws-pill ${wsConnected ? 'online' : 'offline'}`}>
              {wsConnected ? '● WebSocket Stream Live' : '○ Reconnecting Stream…'}
            </span>
            <span className="gps-sim-tag">DEV MODE: SIMULATED TELEMETRY</span>
          </div>
        </div>

        <div className="gps-command-metrics">
          <div className="gps-kpi-tile">
            <span>Active GPS Trackers</span>
            <b>{state.vehicles.length} Units</b>
            <small>Hardwired OBD-II / 4G SIM</small>
          </div>
          <div className="gps-kpi-tile">
            <span>Vehicles Moving</span>
            <b>{movingVehicles.length} On Route</b>
            <small>Real-time satellite lock</small>
          </div>
          <div className="gps-kpi-tile">
            <span>Avg Corridor Speed</span>
            <b>{avgFleetSpeed} km/h</b>
            <small>Live telemetry velocity</small>
          </div>
          <div className="gps-kpi-tile">
            <span>Selected Unit</span>
            <b>{selectedVehicle?.id || '—'}</b>
            <small>{selectedVehicle?.gpsDeviceId || 'GPS-SIM-UNIT'}</small>
          </div>
        </div>
      </section>

      <div className="tracking-split-grid">
        {/* Left: Interactive Live Map + Hardware Pipeline Card */}
        <div className="tracking-main-col">
          <FleetMap
            vehicles={state.vehicles}
            trips={state.trips}
            selectedVehicleId={selectedVehicleId}
            activeCount={state.summary?.active ?? 0}
            availableCount={state.summary?.available ?? 0}
            wsConnected={wsConnected}
            onToast={onToast}
            tall={true}
          />

          <div className="panel gps-pipeline-strip">
            <div className="pipeline-node">
              <b>1. Vehicle GPS Unit</b>
              <small>Locks GPS satellites (No phone needed)</small>
            </div>
            <span className="pipeline-arrow">→</span>
            <div className="pipeline-node">
              <b>2. 4G M2M SIM Link</b>
              <small>POST /api/gps/ping (X-Device-Key)</small>
            </div>
            <span className="pipeline-arrow">→</span>
            <div className="pipeline-node">
              <b>3. FastAPI + WebSockets</b>
              <small>Broadcasts WS /ws/tracking &amp; updates ETA</small>
            </div>
          </div>
        </div>

        {/* Right: Sleek GPS Telemetry Simulator & Live Fleet Radar List */}
        <div className="tracking-side-stack">
          <Tilt3DCard as="section" className="panel padded-panel gps-sim-card" maxTilt={2.5}>
            <div className="panel-heading">
              <div>
                <span className="dialog-kicker">TELEMETRY INJECTION</span>
                <h2>GPS Device Simulator</h2>
                <p>Test live marker motion &amp; ETA recalculation without physical hardware.</p>
              </div>
              <button
                type="button"
                className={`button ${autoStream ? 'button-primary' : 'button-outline'}`}
                onClick={() => {
                  const next = !autoStream;
                  setAutoStream(next);
                  onToast(
                    next
                      ? `Auto-streaming simulated GPS pings for ${selectedVehicle?.id} every 3.5s`
                      : 'Stopped auto-stream.'
                  );
                }}
              >
                {autoStream ? '■ Stop Live Stream' : '▶ Auto-Move Vehicle'}
              </button>
            </div>

            <div className="sim-form-grid">
              <label>
                Target Vehicle &amp; Tracker
                <select
                  value={selectedVehicleId}
                  onChange={(e) => {
                    const v = state.vehicles.find((item) => item.id === e.target.value);
                    if (v) handleSelectVehicle(v);
                  }}
                >
                  {state.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id} · {v.name} ({v.gpsDeviceId || 'GPS-SIM'})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Bengaluru Waypoint Preset
                <select
                  value=""
                  onChange={(e) => {
                    const hub = HUB_PRESETS.find((h) => h.name === e.target.value);
                    if (hub) {
                      setSimLat(hub.lat);
                      setSimLng(hub.lng);
                      setSimLabel(`${hub.name}, Bengaluru`);
                    }
                  }}
                >
                  <option value="">Jump to hub location…</option>
                  {HUB_PRESETS.map((h) => (
                    <option key={h.name} value={h.name}>
                      {h.name} ({h.lat}, {h.lng})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Latitude (° N)
                <input
                  type="number"
                  step="0.0001"
                  value={simLat}
                  onChange={(e) => setSimLat(e.target.value)}
                />
              </label>

              <label>
                Longitude (° E)
                <input
                  type="number"
                  step="0.0001"
                  value={simLng}
                  onChange={(e) => setSimLng(e.target.value)}
                />
              </label>

              <label>
                Speed (km/h)
                <input
                  type="number"
                  min="0"
                  max="140"
                  value={simSpeed}
                  onChange={(e) => setSimSpeed(e.target.value)}
                />
              </label>

              <label>
                Corridor / Locality Label
                <input
                  value={simLabel}
                  onChange={(e) => setSimLabel(e.target.value)}
                />
              </label>
            </div>

            <div className="dialog-actions">
              <button
                type="button"
                className="button button-primary"
                style={{ width: '100%' }}
                onClick={() => {
                  sendSimulatedPing();
                  onToast(`GPS coordinates transmitted for ${selectedVehicle?.id}`);
                }}
              >
                📡 Transmit GPS Packet Now
              </button>
            </div>
          </Tilt3DCard>

          {/* Live Vehicle Radar Cards */}
          <section className="panel padded-panel">
            <div className="panel-heading">
              <div>
                <h2>Fleet Telemetry Radar</h2>
                <p>Select any vehicle to lock camera &amp; inspect live GPS coordinates.</p>
              </div>
            </div>
            <div className="telemetry-vehicle-list">
              {state.vehicles.map((v) => {
                const activeTrip = state.trips.find(
                  (t) => t.vehicle === v.id && ['In transit', 'Delayed'].includes(t.status)
                );
                return (
                  <button
                    key={v.id}
                    type="button"
                    className={`telemetry-vehicle-item ${selectedVehicleId === v.id ? 'selected' : ''}`}
                    onClick={() => handleSelectVehicle(v)}
                  >
                    <div className="tvi-left">
                      <div className="tvi-title-row">
                        <span className={`tvi-dot ${v.status === 'On route' ? 'moving' : 'idle'}`} />
                        <b>{v.id} · {v.name}</b>
                      </div>
                      <small>{v.driver} · {v.location}</small>
                      {activeTrip && (
                        <span className="tvi-trip-chip">
                          {activeTrip.id}: {activeTrip.from} → {activeTrip.to} (ETA {activeTrip.eta})
                        </span>
                      )}
                    </div>
                    <div className="tvi-right">
                      <span className={`status-pill ${v.status === 'In service' ? 'delayed' : 'available'}`}>
                        {Number(v.speed || 0).toFixed(1)} km/h
                      </span>
                      <code>
                        {Number(v.lat || 12.97).toFixed(4)}°N, {Number(v.lng || 77.59).toFixed(4)}°E
                      </code>
                    </div>
                  </button>
                );
              })}
            </div>

            {wsLog.length > 0 && (
              <div className="ws-stream-box">
                <small className="ws-stream-title">LIVE WEBSOCKET TELEMETRY LOG</small>
                {wsLog.slice(0, 4).map((entry, idx) => (
                  <div key={idx} className="ws-stream-row">
                    <span>{entry.type}</span>
                    <b>{entry.summary}</b>
                    <small>{entry.time}</small>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export function RoutePlannerPage({
  state,
  token,
  onRefresh,
  onToast
}) {
  const [selectedVehicleId, setSelectedVehicleId] = useState(state.vehicles?.[0]?.id || 'VH-1042');
  const [origin, setOrigin] = useState('Whitefield');
  const [destination, setDestination] = useState('Koramangala');
  const [alternatives, setAlternatives] = useState([]);
  const [selectedStrategy, setSelectedStrategy] = useState('Fastest Route');
  const [trafficAlert, setTrafficAlert] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assignedSummary, setAssignedSummary] = useState(null);
  const [geometryNote, setGeometryNote] = useState('');
  const lastQueryRef = useRef('');
  const requestIdRef = useRef(0);
  const candidatesRef = useRef([]);
  const coordsRef = useRef({ o: null, d: null });

  useEffect(() => {
    if (!selectedVehicleId && state.vehicles?.length) {
      setSelectedVehicleId(state.vehicles[0].id);
    }
  }, [state.vehicles, selectedVehicleId]);

  const syncWithVehicle = (vId) => {
    setSelectedVehicleId(vId);
    const veh = state.vehicles.find((v) => v.id === vId);
    if (!veh) return;
    const matchingTrip = state.trips.find((t) => t.vehicle === veh.id && t.status !== 'Delivered');
    const nextOrigin = matchingTrip?.from || veh.location || 'Whitefield';
    const nextDest =
      matchingTrip?.to ||
      (nextOrigin.toLowerCase().includes('mangalagiri')
        ? 'Vijayawada'
        : nextOrigin.toLowerCase().includes('whitefield')
        ? 'Koramangala'
        : 'Electronic City');
    setOrigin(nextOrigin);
    setDestination(nextDest);
    runOptimization(null, nextOrigin, nextDest);
  };

  const toApiCandidates = (list) =>
    (list || []).map((c) => ({
      distanceKm: c.distanceKm,
      durationMin: c.durationMin,
      waypoints: simplifyPath(c.waypoints, 400)
    }));

  const runOptimization = async (e, overrideOrig, overrideDest) => {
    if (e) e.preventDefault();
    const qOrig = String(overrideOrig ?? origin).trim();
    const qDest = String(overrideDest ?? destination).trim();
    if (!qOrig || !qDest) {
      onToast('Enter both Origin and Destination locations.');
      return;
    }
    const reqId = ++requestIdRef.current;
    lastQueryRef.current = `${qOrig}|${qDest}`;
    setLoading(true);
    try {
      const oCoords = await geocodeAnyPlace(qOrig);
      const dCoords = await geocodeAnyPlace(qDest);
      if (reqId !== requestIdRef.current) return;
      if (!oCoords || !dCoords) {
        onToast(`Could not locate "${!oCoords ? qOrig : qDest}". Try a more specific place name.`);
        return;
      }

      const candidates = await fetchRoadCandidates(oCoords, dCoords);
      if (reqId !== requestIdRef.current) return;
      candidatesRef.current = candidates;
      coordsRef.current = { o: oCoords, d: dCoords };

      let backendRes = null;
      try {
        backendRes = await apiRequest(
          '/api/routes/optimize',
          {
            method: 'POST',
            body: JSON.stringify({
              origin: qOrig,
              destination: qDest,
              originCoords: oCoords,
              destinationCoords: dCoords,
              candidates: toApiCandidates(candidates)
            })
          },
          token
        );
      } catch (err) {
        if (/locate/i.test(err.message)) {
          onToast(err.message);
          return;
        }
      }
      if (reqId !== requestIdRef.current) return;

      const routes = backendRes?.routes?.length ? backendRes.routes : buildLocalRoutes(oCoords, dCoords, candidates);
      setAlternatives(routes);
      setGeometryNote(
        routes.some((r) => r.geometrySource === 'estimated')
          ? 'Road network service unreachable — showing approximate corridors, not exact roads. Check your internet connection and recalculate.'
          : ''
      );
      setTrafficAlert(
        backendRes?.trafficAlert || {
          detected: true,
          corridor: `${qOrig} → ${qDest}`,
          message: 'Backend unavailable — routes evaluated locally using a time-of-day traffic model.',
          recommendedStrategy: 'Traffic-Avoidance Route'
        }
      );
      if (e) onToast(`Calculated 4 route options from ${qOrig} to ${qDest}.`);
    } catch (err) {
      if (reqId === requestIdRef.current) onToast(err.message);
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    runOptimization(null, origin, destination);
  }, []);

  const sameText = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

  const applyRouteOrDispatchVehicle = async () => {
    const veh = state.vehicles.find((v) => v.id === selectedVehicleId);
    if (!veh) {
      onToast('Please select a vehicle first.');
      return;
    }
    const ownTrip = state.trips.find(
      (t) => t.vehicle === veh.id && !['Delivered', 'Cancelled'].includes(t.status)
    );
    const driverName = veh.driver && veh.driver !== 'Unassigned' ? veh.driver : 'Unassigned';

    try {
      if (ownTrip) {
        if (!sameText(ownTrip.from, origin) || !sameText(ownTrip.to, destination)) {
          onToast(
            `${veh.id} is already on trip ${ownTrip.id} (${ownTrip.from} → ${ownTrip.to}). Use those endpoints to change its route, or pick an idle vehicle.`
          );
          return;
        }
        const updated = await apiRequest(
          `/api/trips/${encodeURIComponent(ownTrip.id)}/reroute`,
          { method: 'POST', body: JSON.stringify({ strategy: selectedStrategy }) },
          token
        );
        await onRefresh();
        setAssignedSummary({
          vehicleId: veh.id,
          driverName: ownTrip.driver || driverName,
          tripId: ownTrip.id,
          origin: ownTrip.from,
          destination: ownTrip.to,
          strategy: selectedStrategy,
          eta: updated?.trip?.eta || 'Updated'
        });
        onToast(`Applied ${selectedStrategy} to ${veh.id} (${ownTrip.id}) from its current position.`);
        return;
      }

      if (lastQueryRef.current !== `${origin.trim()}|${destination.trim()}` || !coordsRef.current.o) {
        onToast('Click "Calculate Routes" first so the road path matches this origin and destination.');
        return;
      }
      const { o, d } = coordsRef.current;
      const createdTrip = await apiRequest(
        '/api/trips',
        {
          method: 'POST',
          body: JSON.stringify({
            from: origin.trim(),
            to: destination.trim(),
            originLat: o[0],
            originLng: o[1],
            destLat: d[0],
            destLng: d[1],
            candidates: toApiCandidates(candidatesRef.current),
            driver: driverName,
            vehicle: veh.id,
            routeStrategy: selectedStrategy
          })
        },
        token
      );
      await onRefresh();
      setAssignedSummary({
        vehicleId: veh.id,
        driverName,
        tripId: createdTrip.id,
        origin,
        destination,
        strategy: selectedStrategy,
        eta: createdTrip.eta || 'Scheduled'
      });
      onToast(`Assigned ${createdTrip.id} (${origin} → ${destination}) to ${veh.id} (${driverName}).`);
    } catch (err) {
      onToast(err.message);
    }
  };

  const activeVehicleObj = state.vehicles.find((v) => v.id === selectedVehicleId) || null;
  const selectedVehicleOwnTrip = activeVehicleObj
    ? state.trips.find((t) => t.vehicle === activeVehicleObj.id && t.status !== 'Delivered')
    : null;
  const mapRoutes = alternatives.map((r) => ({
    ...r,
    selected: r.strategy === selectedStrategy
  }));

  return (
    <div className="route-planner-page">
      <div className="workspace-heading">
        <div>
          <span>GOOGLE-MAPS STYLE ROUTE OPTIMIZER &amp; VEHICLE-LOCKED DISPATCH</span>
          <h1>Route Optimization &amp; Traffic-Aware Planner</h1>
          <p>
            Select any vehicle &amp; driver, type or choose any origin/destination (e.g. Mangalagiri → Vijayawada), and assign routes strictly to that vehicle.
          </p>
        </div>
      </div>

      {/* Vehicle + Custom Origin/Destination Bar */}
      <form className="panel route-query-bar" onSubmit={(e) => runOptimization(e)}>
        <label>
          Select Target Vehicle &amp; Assigned Driver
          <select value={selectedVehicleId} onChange={(e) => syncWithVehicle(e.target.value)}>
            {state.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id} · {v.name} — Driver: {v.driver || 'Unassigned'} ({v.status})
              </option>
            ))}
          </select>
        </label>

        <label>
          Origin (Any City / Hub — e.g. Mangalagiri)
          <input
            list="fleet-hub-list"
            value={origin}
            placeholder="Type or select origin..."
            onChange={(e) => setOrigin(e.target.value)}
            onBlur={() => {
              if (lastQueryRef.current !== `${origin.trim()}|${destination.trim()}`) runOptimization(null, origin, destination);
            }}
          />
        </label>

        <label>
          Destination (Any City / Hub — e.g. Vijayawada)
          <input
            list="fleet-hub-list"
            value={destination}
            placeholder="Type or select destination..."
            onChange={(e) => setDestination(e.target.value)}
            onBlur={() => {
              if (lastQueryRef.current !== `${origin.trim()}|${destination.trim()}`) runOptimization(null, origin, destination);
            }}
          />
        </label>

        <datalist id="fleet-hub-list">
          {['Mangalagiri', 'Vijayawada', 'Guntur', 'Amaravati', 'Navuluru', 'Whitefield', 'Koramangala', 'Peenya', 'Yeshwanthpur', 'Indiranagar', 'Jayanagar', 'Electronic City', 'Hebbal', 'MG Road', 'Hyderabad', 'Chennai'].map((loc) => (
            <option key={loc} value={loc} />
          ))}
        </datalist>

        <div className="route-query-actions">
          {activeVehicleObj && (
            <span style={{ marginRight: 'auto', fontSize: '12px', color: '#4b554e' }}>
              Target Lock: <b>{activeVehicleObj.id}</b> ({activeVehicleObj.name}) · Driver: <b>{activeVehicleObj.driver || 'Unassigned'}</b> ·{' '}
              {selectedVehicleOwnTrip ? (
                <span className="status-pill available">Trip {selectedVehicleOwnTrip.id}</span>
              ) : (
                <span className="status-pill">Will Create Trip for {activeVehicleObj.id}</span>
              )}
            </span>
          )}
          <button type="submit" className="button button-outline" disabled={loading}>
            {loading ? 'Calculating Roads…' : '↻ Calculate Routes'}
          </button>
          <button type="button" className="button button-primary" onClick={applyRouteOrDispatchVehicle}>
            ✓ Apply Route to {activeVehicleObj?.id || 'Vehicle'}
          </button>
        </div>
      </form>

      {/* Assigned Route Confirmation Banner */}
      {assignedSummary && (
        <div className="traffic-alert-strip" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
          <div>
            <b>✓ Assigned Confirmed:</b> Vehicle <b>{assignedSummary.vehicleId}</b> (Driver: <b>{assignedSummary.driverName}</b>) · Trip <b>{assignedSummary.tripId}</b> · <b>{assignedSummary.origin} → {assignedSummary.destination}</b> ({assignedSummary.strategy} · ETA {assignedSummary.eta})
          </div>
          <span className="status-pill available">Assigned &amp; Synced</span>
        </div>
      )}

      {geometryNote && (
        <div className="traffic-alert-strip" style={{ background: '#fffbeb', borderColor: '#fcd34d', color: '#92400e' }}>
          <div><b>⚠ Approximate paths:</b> {geometryNote}</div>
        </div>
      )}

      {/* Traffic-Aware Alert Banner */}
      {trafficAlert && (
        <div className="traffic-alert-strip">
          <div>
            <b>⚠ Live Traffic Advisory ({trafficAlert.corridor}):</b> {trafficAlert.message}
          </div>
          <button
            type="button"
            className="inline-action"
            onClick={() => setSelectedStrategy(trafficAlert.recommendedStrategy)}
          >
            Select {trafficAlert.recommendedStrategy}
          </button>
        </div>
      )}

      {/* 4 Route Options Grid */}
      <div className="route-options-grid">
        {alternatives.map((rt) => {
          const isChosen = rt.strategy === selectedStrategy;
          return (
            <Tilt3DCard
              as="article"
              key={rt.id}
              className={`panel route-option-card ${isChosen ? 'chosen' : ''}`}
              maxTilt={2}
              onClick={() => setSelectedStrategy(rt.strategy)}
            >
              <div className="route-card-top">
                <span className="route-color-dot" style={{ background: rt.color }} />
                <span className="route-badge">{rt.badge}</span>
              </div>
              <h3>{rt.strategy}</h3>
              <p>{rt.summary}</p>
              {rt.sameRoadAs && <small className="route-same-note">Same road as {rt.sameRoadAs}</small>}
              <div className="route-metrics-row">
                <div>
                  <small>Distance</small>
                  <b>{rt.distanceKm} km</b>
                </div>
                <div>
                  <small>Est. Duration</small>
                  <b>{rt.durationMin} min</b>
                </div>
                <div>
                  <small>Updated ETA</small>
                  <b>{rt.etaDisplay}</b>
                </div>
              </div>
              <div className="route-foot-meta">
                <span>Traffic: <b>{rt.trafficLevel}</b></span>
                <span>Est. Fuel: <b>{rt.fuelLitres} L</b></span>
              </div>
            </Tilt3DCard>
          );
        })}
      </div>

      {/* Real-Road Route Comparison Map */}
      <div style={{ marginTop: '18px' }}>
        <FleetMap
          vehicles={state.vehicles}
          trips={state.trips}
          activeRoutes={mapRoutes}
          selectedVehicleId={selectedVehicleId}
          activeCount={state.summary?.active ?? 0}
          availableCount={state.summary?.available ?? 0}
          wsConnected={true}
          onToast={onToast}
          tall={true}
        />
      </div>
    </div>
  );
}

export function ShipmentManagementPage({
  state,
  activeUser,
  token,
  onRefresh,
  onToast
}) {
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedShipmentId, setSelectedShipmentId] = useState(
    state.shipments?.[0]?.id || 'SHP-501'
  );
  const [newCargo, setNewCargo] = useState('');
  const [newWeight, setNewWeight] = useState('450 kg');
  const [newOrigin, setNewOrigin] = useState('Whitefield');
  const [newDestination, setNewDestination] = useState('Koramangala');
  const [newTripId, setNewTripId] = useState('');
  const [recalculatingEta, setRecalculatingEta] = useState(false);

  const shipments = state.shipments || [];
  const filtered = shipments.filter(
    (s) => statusFilter === 'All' || s.status === statusFilter
  );
  const selectedShipment =
    shipments.find((s) => s.id === selectedShipmentId) || shipments[0] || null;
  const delayedShipments = shipments.filter((s) => s.status === 'Delayed');

  const canManage = ['admin', 'fleet_manager', 'dispatcher'].includes(activeUser?.role);

  const handleCreateShipment = async (e) => {
    e.preventDefault();
    if (!newCargo.trim()) return;
    try {
      const created = await apiRequest(
        '/api/shipments',
        {
          method: 'POST',
          body: JSON.stringify({
            cargo: newCargo,
            weight: newWeight,
            origin: newOrigin,
            destination: newDestination,
            tripId: newTripId || null
          })
        },
        token
      );
      setNewCargo('');
      setSelectedShipmentId(created.id);
      await onRefresh();
      onToast(`Shipment ${created.id} registered.`);
    } catch (err) {
      onToast(err.message);
    }
  };

  const handleStatusTransition = async (shipmentId, nextStatus) => {
    try {
      await apiRequest(
        `/api/shipments/${encodeURIComponent(shipmentId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: nextStatus,
            note: `Status updated to ${nextStatus} via Delivery Monitoring Console`
          })
        },
        token
      );
      await onRefresh();
      onToast(`Shipment ${shipmentId} marked ${nextStatus}.`);
    } catch (err) {
      onToast(err.message);
    }
  };

  const handleAssignTrip = async (shipmentId, tripId) => {
    try {
      await apiRequest(
        `/api/shipments/${encodeURIComponent(shipmentId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ tripId: tripId || null })
        },
        token
      );
      await onRefresh();
      onToast(`Shipment ${shipmentId} trip assignment updated.`);
    } catch (err) {
      onToast(err.message);
    }
  };

  const handleRecalculateEta = async (shipmentId) => {
    setRecalculatingEta(true);
    try {
      const res = await apiRequest(
        `/api/shipments/${encodeURIComponent(shipmentId)}/recalculate-eta`,
        { method: 'POST' },
        token
      );
      await onRefresh();
      onToast(`ETA recalculated to ${res.eta?.etaDisplay || 'updated time'}.`);
    } catch (err) {
      onToast(err.message);
    } finally {
      setRecalculatingEta(false);
    }
  };

  // Compute Feature 3 Stepper Stage & Feature 8 ETA Metrics for selectedShipment
  const linkedTrip = selectedShipment
    ? state.trips.find((t) => t.id === selectedShipment.tripId)
    : null;
  const linkedVehicle = selectedShipment
    ? state.vehicles.find((v) => v.id === selectedShipment.vehicleId)
    : null;

  const STAGES = ['Created', 'Assigned', 'In Transit', 'Delivered', 'Cancelled'];
  const getStageIndex = (status) => {
    if (status === 'Cancelled') return 4;
    if (status === 'Delivered') return 3;
    if (status === 'In Transit' || status === 'Delayed') return 2;
    if (status === 'Assigned') return 1;
    return 0;
  };

  const activeStageIdx = selectedShipment ? getStageIndex(selectedShipment.status) : 0;
  const stepperFillPct =
    selectedShipment?.status === 'Cancelled'
      ? 100
      : Math.min(100, Math.round((activeStageIdx / 3) * 100));

  const totalDistKm = Number(linkedTrip?.distanceKm || 16.4);
  const progressPct =
    selectedShipment?.status === 'Delivered'
      ? 100
      : selectedShipment?.status === 'Created'
      ? 0
      : Number(linkedTrip?.progress ?? 50);
  const remainingDistKm = Number(
    Math.max(0, totalDistKm * (1 - progressPct / 100)).toFixed(1)
  );
  const estDurationMin = Number(linkedTrip?.durationMin || 34);
  const remMinutes =
    selectedShipment?.status === 'Delivered'
      ? 0
      : Math.max(4, Math.round(estDurationMin * (1 - progressPct / 100)));
  const isDelayed =
    selectedShipment?.status === 'Delayed' ||
    Number(selectedShipment?.delayMinutes || 0) > 10;

  return (
    <div className="shipment-management-page">
      <div className="workspace-heading">
        <div>
          <span>MILESTONE 2 · DELIVERY STATUS MONITORING &amp; ETA ENGINE</span>
          <h1>Shipments, Delivery Status &amp; ETA</h1>
          <p>
            Animated shipment workflow (Created → Assigned → In Transit → Delivered), audit history, and real-time ETA calculation.
          </p>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="workspace-stats">
        <Tilt3DCard as="article">
          <span>Total Shipments</span>
          <b>{shipments.length}</b>
        </Tilt3DCard>
        <Tilt3DCard as="article">
          <span>In Transit</span>
          <b>{shipments.filter((s) => s.status === 'In Transit').length}</b>
        </Tilt3DCard>
        <Tilt3DCard as="article">
          <span>Delayed Alerts</span>
          <b style={{ color: delayedShipments.length ? '#c2410c' : undefined }}>
            {delayedShipments.length}
          </b>
        </Tilt3DCard>
        <Tilt3DCard as="article">
          <span>Delivered</span>
          <b>{shipments.filter((s) => s.status === 'Delivered').length}</b>
        </Tilt3DCard>
      </div>

      {/* Separate Delayed Shipments Alert Panel */}
      {delayedShipments.length > 0 && (
        <section className="panel delayed-shipments-banner">
          <div className="panel-heading">
            <div>
              <h2 style={{ color: '#9a3412' }}>⚠ Delayed Shipments Requiring Attention ({delayedShipments.length})</h2>
              <p>Shipments exceeding ETA threshold or affected by route congestion.</p>
            </div>
          </div>
          <div className="delayed-cards-row">
            {delayedShipments.map((ds) => (
              <div key={ds.id} className="delayed-chip-card" onClick={() => setSelectedShipmentId(ds.id)}>
                <b>{ds.id} · {ds.cargo}</b>
                <span>{ds.origin} → {ds.destination} · Driver: {ds.driverName}</span>
                <small>Revised ETA: {ds.eta} (+{ds.delayMinutes || 15} mins)</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Feature 3 (Animated Delivery Status Stepper) & Feature 8 (ETA Calculation & Delivery Progress) Showcase for Selected Shipment */}
      {selectedShipment && (
        <div className="m2-feature38-grid">
          {/* Card 3: Animated Delivery Status Monitoring Stepper */}
          <Tilt3DCard
            key={`status-${selectedShipment.id}-${selectedShipment.status}`}
            as="section"
            className="panel padded-panel delivery-stepper-card"
            maxTilt={2}
          >
            <div className="dsc-header">
              <div>
                <span className="dialog-kicker">3 · DELIVERY STATUS MONITORING</span>
                <div className="dsc-title-row">
                  <h2>{selectedShipment.id}</h2>
                  <span
                    className={`status-pill ${
                      selectedShipment.status === 'Delayed' || selectedShipment.status === 'Cancelled'
                        ? 'delayed'
                        : 'available'
                    }`}
                  >
                    {selectedShipment.status}
                  </span>
                </div>
                <p>
                  {selectedShipment.origin} → {selectedShipment.destination} ·{' '}
                  {selectedShipment.cargo} ({selectedShipment.weight})
                </p>
              </div>
              <div className="dsc-meta-box">
                <div>
                  <small>Assigned Trip</small>
                  <b>{selectedShipment.tripId || 'Unassigned'}</b>
                </div>
                <div>
                  <small>Vehicle</small>
                  <b>{selectedShipment.vehicleId || '—'}</b>
                </div>
                <div>
                  <small>Driver</small>
                  <b>{selectedShipment.driverName || 'Unassigned'}</b>
                </div>
                <div>
                  <small>ETA</small>
                  <b>{selectedShipment.eta}</b>
                </div>
              </div>
            </div>

            {/* Animated 5-Stage Horizontal Delivery Progress Stepper */}
            <div className="animated-stepper-wrap">
              <div className="stepper-track-bg">
                <div
                  className={`stepper-track-fill ${
                    selectedShipment.status === 'Cancelled'
                      ? 'is-cancelled'
                      : selectedShipment.status === 'Delayed'
                      ? 'is-delayed'
                      : ''
                  }`}
                  style={{ width: `${stepperFillPct}%` }}
                />
              </div>

              <div className="stepper-nodes-row">
                {STAGES.map((stage, idx) => {
                  const isCancelledStage = stage === 'Cancelled';
                  const isCompleted =
                    selectedShipment.status !== 'Cancelled' &&
                    !isCancelledStage &&
                    idx < activeStageIdx;
                  const isCurrent =
                    (selectedShipment.status === 'Cancelled' && isCancelledStage) ||
                    (selectedShipment.status !== 'Cancelled' &&
                      !isCancelledStage &&
                      idx === activeStageIdx);

                  const histMatch = (selectedShipment.history || []).find(
                    (h) =>
                      h.status === stage ||
                      (stage === 'In Transit' && h.status === 'Delayed')
                  );

                  return (
                    <button
                      key={stage}
                      type="button"
                      className={`stepper-node-btn ${isCompleted ? 'completed' : ''} ${
                        isCurrent ? 'current' : ''
                      } ${isCancelledStage ? 'cancel-node' : ''}`}
                      onClick={() => handleStatusTransition(selectedShipment.id, stage)}
                      title={`Set status to ${stage}`}
                    >
                      <span className="stepper-circle">
                        {isCompleted ? '✓' : isCurrent ? (isCancelledStage ? '✕' : '🚚') : idx + 1}
                        {isCurrent && <i className="stepper-pulse-ring" />}
                      </span>
                      <b>{stage}</b>
                      <small>
                        {histMatch
                          ? new Date(histMatch.timestamp).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : '—'}
                      </small>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Status Transition Pills */}
            <div className="dsc-quick-actions">
              <span>Transition Status:</span>
              {['Created', 'Assigned', 'In Transit', 'Delayed', 'Delivered', 'Cancelled'].map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    className={`inline-action ${selectedShipment.status === st ? 'active-chip' : ''}`}
                    onClick={() => handleStatusTransition(selectedShipment.id, st)}
                  >
                    {st}
                  </button>
                )
              )}
            </div>
          </Tilt3DCard>

          {/* Card 8: ETA Calculation & Delivery Progress Engine */}
          <Tilt3DCard
            key={`eta-${selectedShipment.id}-${selectedShipment.eta}`}
            as="section"
            className="panel padded-panel eta-engine-card"
            maxTilt={2}
          >
            <div className="eta-header-row">
              <div className="eta-truck-badge">🚚</div>
              <div style={{ flex: 1 }}>
                <span className="dialog-kicker">8 · ETA CALCULATION &amp; DELIVERY PROGRESS</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h2>{selectedShipment.id}</h2>
                  <span
                    className={`status-pill ${
                      selectedShipment.status === 'Delayed' ? 'delayed' : 'available'
                    }`}
                  >
                    {selectedShipment.status}
                  </span>
                </div>
                <p>
                  {selectedShipment.origin} → {selectedShipment.destination}
                </p>
              </div>
              <button
                type="button"
                className="button button-outline"
                disabled={recalculatingEta}
                onClick={() => handleRecalculateEta(selectedShipment.id)}
              >
                {recalculatingEta ? 'Calculating…' : '↻ Recalculate ETA'}
              </button>
            </div>

            <div className="eta-top-stats">
              <div>
                <small>Current Location</small>
                <b>{linkedVehicle?.location || selectedShipment.origin}</b>
              </div>
              <div>
                <small>Distance Remaining</small>
                <b>{remainingDistKm} km</b>
              </div>
              <div>
                <small>Estimated Arrival</small>
                <b style={{ color: isDelayed ? '#c2410c' : '#1e6b43' }}>
                  {selectedShipment.eta}{' '}
                  <span>({remMinutes > 0 ? `${remMinutes}m` : 'Arrived'})</span>
                </b>
              </div>
            </div>

            <div className="eta-route-progress-box">
              <div className="eta-rp-labels">
                <div>
                  <small>Planned Route</small>
                  <b>
                    {totalDistKm} km | {estDurationMin} mins (
                    {linkedTrip?.routeStrategy || 'Fastest Route'})
                  </b>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <small>Current Progress</small>
                  <b>{progressPct}%</b>
                </div>
              </div>
              <div className="eta-animated-bar-track">
                <div
                  className={`eta-animated-bar-fill ${isDelayed ? 'is-delayed' : ''}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="eta-bottom-comparison">
              <div>
                <small>Actual Departure</small>
                <b>
                  {linkedTrip?.scheduledDeparture
                    ? new Date(linkedTrip.scheduledDeparture).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : '09:00 AM'}
                </b>
              </div>
              <div>
                <small>
                  {selectedShipment.actualArrival ? 'Actual vs Expected' : 'Expected Delivery'}
                </small>
                <b>
                  {selectedShipment.actualArrival
                    ? `${selectedShipment.actualArrival} (Est: ${selectedShipment.eta})`
                    : selectedShipment.eta}
                </b>
              </div>
              <div>
                <small>Delay Status</small>
                <span className={`status-pill ${isDelayed ? 'delayed' : 'available'}`}>
                  {isDelayed
                    ? `Delayed (+${selectedShipment.delayMinutes || 15}m)`
                    : 'On Time'}
                </span>
              </div>
            </div>
          </Tilt3DCard>
        </div>
      )}

      {/* Register New Shipment Form */}
      {canManage && (
        <form className="panel shipment-create-form" onSubmit={handleCreateShipment}>
          <div className="panel-heading">
            <div>
              <h2>Register New Shipment</h2>
              <p>Create a consignment and optionally bind it to an active or scheduled trip.</p>
            </div>
          </div>
          <div className="sim-form-grid">
            <label>
              Cargo Description
              <input
                placeholder="e.g. Precision Medical Equipment"
                value={newCargo}
                onChange={(e) => setNewCargo(e.target.value)}
                required
              />
            </label>
            <label>
              Payload Weight
              <input
                placeholder="e.g. 450 kg"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
              />
            </label>
            <label>
              Origin
              <input
                value={newOrigin}
                onChange={(e) => setNewOrigin(e.target.value)}
                required
              />
            </label>
            <label>
              Destination
              <input
                value={newDestination}
                onChange={(e) => setNewDestination(e.target.value)}
                required
              />
            </label>
            <label>
              Assign to Trip (Optional)
              <select value={newTripId} onChange={(e) => setNewTripId(e.target.value)}>
                <option value="">Leave Unassigned (Status: Created)</option>
                {state.trips
                  .filter((t) => t.status !== 'Delivered')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id} · {t.from} → {t.to} ({t.vehicle})
                    </option>
                  ))}
              </select>
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" className="button button-primary" style={{ width: '100%' }}>
                ＋ Create Shipment
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Main Split: Shipments Table + Shipment Details & Status History */}
      <div className="shipment-split-grid">
        <section className="panel workspace-table">
          <div className="panel-heading">
            <div>
              <h2>All Shipments</h2>
              <p>Click any shipment row to inspect its animated delivery stepper, ETA &amp; audit history.</p>
            </div>
            <select
              className="page-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All statuses</option>
              <option value="Created">Created</option>
              <option value="Assigned">Assigned</option>
              <option value="In Transit">In Transit</option>
              <option value="Delayed">Delayed</option>
              <option value="Delivered">Delivered</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SHIPMENT ID</th>
                  <th>CARGO</th>
                  <th>ROUTE</th>
                  <th>ASSIGNED TRIP</th>
                  <th>ETA</th>
                  <th>STATUS</th>
                  <th>WORKFLOW ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className={`vehicle-row ${selectedShipment?.id === s.id ? 'selected-row' : ''}`}
                    onClick={() => setSelectedShipmentId(s.id)}
                  >
                    <td><b>{s.id}</b></td>
                    <td>
                      {s.cargo}
                      <small style={{ display: 'block', color: '#748078' }}>{s.weight}</small>
                    </td>
                    <td>{s.origin} → {s.destination}</td>
                    <td>
                      {canManage && s.status !== 'Delivered' && s.status !== 'Cancelled' ? (
                        <select
                          className="page-filter"
                          value={s.tripId || ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleAssignTrip(s.id, e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {state.trips.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.id} ({t.vehicle})
                            </option>
                          ))}
                        </select>
                      ) : (
                        s.tripId || 'Unassigned'
                      )}
                    </td>
                    <td>{s.eta}</td>
                    <td>
                      <span
                        className={`status-pill ${
                          s.status === 'Delayed' || s.status === 'Cancelled'
                            ? 'delayed'
                            : 'available'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className="page-filter"
                        value={s.status}
                        onChange={(e) => handleStatusTransition(s.id, e.target.value)}
                      >
                        <option value="Created">Created</option>
                        <option value="Assigned">Assigned</option>
                        <option value="In Transit">In Transit</option>
                        <option value="Delayed">Delayed</option>
                        <option value="Delivered">Delivered</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Shipment Details & History Timeline */}
        {selectedShipment && (
          <Tilt3DCard as="section" className="panel shipment-detail-card" maxTilt={2.5}>
            <span className="dialog-kicker">SHIPMENT DETAILS &amp; STATUS HISTORY</span>
            <h2>{selectedShipment.id} — {selectedShipment.cargo}</h2>
            <p>{selectedShipment.origin} → {selectedShipment.destination} ({selectedShipment.weight})</p>

            <dl className="dp-kv-list" style={{ marginTop: '12px' }}>
              <div><dt>Current Status</dt><dd><b>{selectedShipment.status}</b></dd></div>
              <div><dt>Assigned Trip</dt><dd>{selectedShipment.tripId || 'Not yet assigned'}</dd></div>
              <div><dt>Assigned Vehicle</dt><dd>{selectedShipment.vehicleId || '—'}</dd></div>
              <div><dt>Assigned Driver</dt><dd>{selectedShipment.driverName || 'Unassigned'}</dd></div>
              <div><dt>Estimated Arrival</dt><dd>{selectedShipment.eta}</dd></div>
              {selectedShipment.actualArrival && (
                <div><dt>Actual Delivery</dt><dd>{selectedShipment.actualArrival}</dd></div>
              )}
            </dl>

            <h3 style={{ marginTop: '18px', fontSize: '13px' }}>Status History</h3>
            <div className="shipment-timeline">
              {(selectedShipment.history || []).map((h, i) => (
                <div key={i} className="timeline-step timeline-step-anim" style={{ animationDelay: `${i * 0.08}s` }}>
                  <i className="timeline-dot" />
                  <div>
                    <b>{h.status}</b>
                    <p>{h.note}</p>
                    <small>{new Date(h.timestamp).toLocaleString('en-IN')}</small>
                  </div>
                </div>
              ))}
            </div>
          </Tilt3DCard>
        )}
      </div>
    </div>
  );
}
