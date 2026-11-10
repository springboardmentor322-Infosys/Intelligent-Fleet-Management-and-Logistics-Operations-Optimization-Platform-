import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, getToken, API_URL, WS_URL } from "../api";
import { EtaLine, fmtTime } from "../ui";

const STALE_MS = 2 * 60 * 1000; // no ping for 2 minutes = no signal

const isOnline = (v, now) =>
  v.last_seen != null && now - new Date(v.last_seen).getTime() < STALE_MS;

function ago(iso, now) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const fmtMin = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
const TRAFFIC_COLORS = { Light: "#16a34a", Moderate: "#f59e0b", Heavy: "#dc2626", Unknown: "#6b7280" };

// Which returned route is the shortest / the fastest (they can be the same road).
function routeStyles(r) {
  const shortest = r.routes.find((x) => x.tags.includes("shortest"));
  const fastest = r.routes.find((x) => x.tags.includes("fastest"));
  return { shortest, fastest, same: shortest === fastest };
}

// DOM nodes (not HTML strings) so registration numbers can never inject markup.
function markerIcon(v, online, selected) {
  const el = document.createElement("div");
  el.className = `gps-marker ${online ? "online" : "offline"}${selected ? " selected" : ""}`;
  el.textContent = v.registration_number;
  return L.divIcon({ className: "gps-icon", html: el, iconSize: [92, 26], iconAnchor: [46, 13] });
}

function popupEl(v, now) {
  const el = document.createElement("div");
  const lines = [
    [v.registration_number, true],
    [`${v.vehicle_type} · ${v.status}`],
    [`Driver: ${v.driver_name || "—"}`],
    [v.speed_kmh != null ? `Speed: ${Math.round(v.speed_kmh)} km/h` : "Speed: —"],
    [v.trip ? `Trip #${v.trip.id}: ${v.trip.origin} → ${v.trip.destination}` : "No trip in progress"],
    v.trip && v.trip.eta
      ? [`ETA ${fmtTime(v.trip.eta)}${v.trip.delayed ? ` (${v.trip.late_minutes} min late)` : ""}`]
      : null,
    [`Last seen: ${ago(v.last_seen, now)}`],
  ];
  lines.filter(Boolean).forEach(([text, bold]) => {
    const p = document.createElement(bold ? "b" : "div");
    p.textContent = text;
    el.appendChild(p);
  });
  return el;
}

export default function LiveMap({ canEdit, setError }) {
  const [positions, setPositions] = useState({});
  const [now, setNow] = useState(Date.now());
  const [live, setLive] = useState(false);
  const [selected, setSelected] = useState(null);
  const [trail, setTrail] = useState([]);
  const [keyInfo, setKeyInfo] = useState(null);
  const [routes, setRoutes] = useState(null);
  const [routeTraffic, setRouteTraffic] = useState(null);
  const [saved, setSaved] = useState(null); // the route the vehicle is following

  const mapDiv = useRef(null);
  const map = useRef(null);
  const markers = useRef({});
  const trailLine = useRef(null);
  const routeLayer = useRef(null);
  const savedLayer = useRef(null);
  const fitted = useRef(false);
  const selectedRef = useRef(null);
  selectedRef.current = selected;

  async function load() {
    try {
      const list = await api("/tracking/vehicles");
      setPositions(Object.fromEntries(list.map((v) => [v.vehicle_id, v])));
    } catch (e) {
      setError(e.message);
    }
  }

  function applyPosition(v) {
    setPositions((p) => ({ ...p, [v.vehicle_id]: { ...p[v.vehicle_id], ...v } }));
    if (selectedRef.current === v.vehicle_id && v.lat != null) {
      setTrail((t) => [...t, [v.lat, v.lng]].slice(-1500));
    }
  }

  // Map is created once.
  useEffect(() => {
    const m = L.map(mapDiv.current).setView([22.5726, 88.3639], 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      markers.current = {};
      trailLine.current = null;
      routeLayer.current = null;
      savedLayer.current = null;
      fitted.current = false;
    };
  }, []);

  // Live WebSocket feed, with automatic reconnect.
  useEffect(() => {
    let ws, timer, tries = 0, closed = false;
    const connect = () => {
      ws = new WebSocket(`${WS_URL}/ws/tracking?token=${encodeURIComponent(getToken() || "")}`);
      ws.onopen = () => { tries = 0; setLive(true); load(); }; // reload to fill any gap
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "position") applyPosition(msg.vehicle);
        } catch { /* ignore malformed messages */ }
      };
      ws.onclose = () => {
        setLive(false);
        if (!closed) timer = setTimeout(connect, Math.min(10000, 1000 * 2 ** tries++));
      };
    };
    load();
    connect();
    return () => { closed = true; clearTimeout(timer); ws && ws.close(); };
  }, []);

  // Re-evaluate "no signal" and "x s ago" every 10 seconds.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  // Keep markers in sync with positions.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set();
    const points = [];
    Object.values(positions).forEach((v) => {
      if (v.lat == null) return;
      seen.add(v.vehicle_id);
      points.push([v.lat, v.lng]);
      const icon = markerIcon(v, isOnline(v, now), selected === v.vehicle_id);
      let mk = markers.current[v.vehicle_id];
      if (!mk) {
        mk = L.marker([v.lat, v.lng], { icon }).addTo(m);
        mk.on("click", () => setSelected(v.vehicle_id));
        markers.current[v.vehicle_id] = mk;
      } else {
        mk.setLatLng([v.lat, v.lng]);
        mk.setIcon(icon);
      }
      const popup = popupEl(v, now);
      if (mk.getPopup()) mk.setPopupContent(popup);
      else mk.bindPopup(popup);
    });
    Object.keys(markers.current).forEach((id) => {
      if (!seen.has(Number(id))) {
        markers.current[id].remove();
        delete markers.current[id];
      }
    });
    if (!fitted.current && points.length) {
      m.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
      fitted.current = true;
    }
  }, [positions, now, selected]);

  // Selecting a vehicle loads its recent trail.
  useEffect(() => {
    setTrail([]);
    if (selected == null) return;
    api(`/tracking/vehicles/${selected}/history?minutes=60`)
      .then((h) => setTrail(h.map((p) => [p.lat, p.lng])))
      .catch((e) => setError(e.message));
  }, [selected]);

  // Draw the trail.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (trailLine.current) { trailLine.current.remove(); trailLine.current = null; }
    if (trail.length > 1 && !(routes && routes.ok)) {
      // The route line already shows the path; the trail is only for vehicles without one.
      trailLine.current = L.polyline(trail, { color: "#2563eb", weight: 4, opacity: 0.7 }).addTo(m);
    }
  }, [trail, routes]);

  // Shortest / fastest routes for the selected vehicle's trip in progress.
  const selectedTripId = selected != null ? positions[selected]?.trip?.id ?? null : null;
  useEffect(() => {
    setRoutes(null);
    setRouteTraffic(null);
    if (selectedTripId == null) return;
    let cancelled = false;
    api(`/trips/${selectedTripId}/routes`)
      .then((r) => {
        if (cancelled) return null;
        setRoutes({ ok: true, ...r });
        return api(`/trips/${selectedTripId}/route-traffic`); // same cached routes
      })
      .then((t) => { if (t && !cancelled) setRouteTraffic(t); })
      .catch((e) => {
        if (!cancelled) setRoutes((cur) => (cur && cur.ok ? cur : { ok: false, error: e.message }));
      });
    return () => { cancelled = true; };
  }, [selectedTripId]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (routeLayer.current) { routeLayer.current.remove(); routeLayer.current = null; }
    if (!routes || !routes.ok) return;
    const { shortest, fastest, same } = routeStyles(routes);
    const g = L.layerGroup();
    const drawn = same
      ? [[shortest, "#16a34a", "Shortest & fastest route"]]
      : [[fastest, "#ea580c", "Fastest route"], [shortest, "#16a34a", "Shortest route"]];
    // Live traffic is drawn ON the route lines only: each section is coloured by
    // its current speed. The shortest route is dashed when it differs from the fastest.
    const flow = routeTraffic && routeTraffic.available ? routeTraffic.routes : null;
    drawn.forEach(([r, color, label]) => {
      if (!r) return;
      const dashed = !same && r === shortest;
      const style = { weight: dashed ? 4 : 7, opacity: 0.9, dashArray: dashed ? "10 8" : null };
      const segs = flow ? flow[String(routes.routes.indexOf(r))] : null;
      if (segs && segs.length) {
        segs.forEach((s) => {
          const speed = s.current_kmh != null ? ` (${Math.round(s.current_kmh)} km/h)` : "";
          L.polyline(r.geometry.slice(s.start, s.end + 1),
            { ...style, color: TRAFFIC_COLORS[s.level] || TRAFFIC_COLORS.Unknown })
            .bindTooltip(`${label}: ${s.level} traffic${speed}`, { sticky: true }).addTo(g);
        });
      } else {
        L.polyline(r.geometry, { ...style, color })
          .bindTooltip(label, { sticky: true }).addTo(g);
      }
    });
    [routes.origin, routes.destination].forEach((p, i) => {
      L.circleMarker([p.lat, p.lng], {
        radius: 7, color: "#fff", weight: 2, fillOpacity: 1,
        fillColor: i === 0 ? "#16a34a" : "#dc2626",
      }).bindTooltip(`${i === 0 ? "From" : "To"}: ${p.name}`).addTo(g);
    });
    g.addTo(m);
    routeLayer.current = g;
    if (savedLayer.current) savedLayer.current.bringToFront();
  }, [routes, routeTraffic]);

  // Zoom to the routes once, when they first load (not on every traffic refresh).
  useEffect(() => {
    const m = map.current;
    if (!m || !routes || !routes.ok) return;
    const all = routes.routes.flatMap((r) => r.geometry);
    if (all.length) m.fitBounds(L.latLngBounds(all), { padding: [40, 40] });
  }, [routes]);

  // The route the vehicle is really following: the one saved on the trip, which a reroute
  // replaces. Checked every 15 seconds so a reroute shows up without reloading.
  useEffect(() => {
    setSaved(null);
    if (selectedTripId == null) return;
    let cancelled = false;
    const fetchSaved = () =>
      api(`/trips/${selectedTripId}/route`)
        .then((r) => {
          if (!cancelled) setSaved((cur) => (cur && cur.version === r.version ? cur : r));
        })
        .catch(() => { /* the options above still show; nothing else to do */ });
    fetchSaved();
    const id = setInterval(fetchSaved, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [selectedTripId]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (savedLayer.current) { savedLayer.current.remove(); savedLayer.current = null; }
    if (!saved || !saved.has_route) return;
    savedLayer.current = L.polyline(saved.geometry, { color: "#0b1f44", weight: 3, opacity: 1 })
      .bindTooltip(`Route being followed (${saved.route_type})`, { sticky: true })
      .addTo(m);
  }, [saved]);

  function focus(v) {
    setSelected(v.vehicle_id);
    if (v.lat != null && map.current) {
      map.current.flyTo([v.lat, v.lng], Math.max(map.current.getZoom(), 14));
      markers.current[v.vehicle_id]?.openPopup();
    }
  }

  async function genKey(v) {
    if (!window.confirm(`Generate a new tracker key for ${v.registration_number}? Any existing key stops working.`)) return;
    setError("");
    try {
      const r = await api(`/vehicles/${v.vehicle_id}/tracker-key`, { method: "POST" });
      setKeyInfo({ reg: v.registration_number, key: r.tracker_key });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const list = Object.values(positions).sort((a, b) =>
    a.registration_number.localeCompare(b.registration_number));
  const online = list.filter((v) => isOnline(v, now)).length;
  const withFix = list.filter((v) => v.lat != null).length;

  return (
    <>
      <section className="page-toolbar">
        <div>
          <h2>Live Tracking</h2>
          <p>
            <span className={`live-dot ${live ? "on" : "off"}`} />
            {live ? "Live" : "Reconnecting..."} · {online} online · {withFix} located · {list.length} vehicles
          </p>
        </div>
      </section>

      {keyInfo && (
        <section className="panel">
          <h3>Tracker key for {keyInfo.reg}</h3>
          <p>Copy it now: it is shown only once. Configure the vehicle's GPS device to send HTTP POST requests to:</p>
          <pre className="key-box">{`POST ${API_URL}/tracking/ingest
X-Tracker-Key: ${keyInfo.key}
Content-Type: application/json

{"lat": 22.5726, "lng": 88.3639, "speed_kmh": 42, "heading": 90}`}</pre>
          <button className="secondary-button" onClick={() => setKeyInfo(null)}>I have saved it</button>
        </section>
      )}

      {selected != null && positions[selected] && (
        <section className="panel">
          {!positions[selected].trip ? (
            <p>{positions[selected].registration_number} has no trip in progress, so there is no route to show.</p>
          ) : !routes ? (
            <p>Loading routes...</p>
          ) : !routes.ok ? (
            <p>Routes unavailable: {routes.error}</p>
          ) : (() => {
            const { shortest, fastest, same } = routeStyles(routes);
            const flowOn = !!(routeTraffic && routeTraffic.available);
            const swatch = (color, label) => !flowOn ? { background: color }
              : label === "Shortest route" ? { height: 0, borderTop: "4px dashed #94a3b8" }
              : { background: "#94a3b8" };
            const rows = same
              ? [["#16a34a", "Shortest & fastest route", shortest]]
              : [["#16a34a", "Shortest route", shortest], ["#ea580c", "Fastest route", fastest]];
            return (
              <>
                <h3>{positions[selected].registration_number}: {routes.origin.name} → {routes.destination.name}</h3>
                {positions[selected].trip.eta && (
                  <p>
                    <b><EtaLine trip={positions[selected].trip} /></b>
                    <small> · planned {fmtTime(positions[selected].trip.planned_eta)}</small>
                  </p>
                )}
                {saved && saved.has_route && (
                  <p>
                    <span style={{ display: "inline-block", width: 28, height: 3, marginRight: 8, verticalAlign: "middle", background: "#0b1f44" }} />
                    Route being followed: {saved.route_type} · {saved.distance_km} km (thin dark line)
                  </p>
                )}
                {rows.map(([color, label, r]) => (
                  <p key={label}>
                    <span style={{ display: "inline-block", width: 28, height: 6, borderRadius: 3, marginRight: 8, ...swatch(color, label) }} />
                    {label}: {r.distance_km} km · {fmtMin(r.duration_min)}
                  </p>
                ))}
                {!routeTraffic ? (
                  <p><small>Loading live traffic...</small></p>
                ) : routeTraffic.available && routeTraffic.summary ? (
                  <p>
                    <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 6, marginRight: 8, background: TRAFFIC_COLORS[routeTraffic.summary.level] }} />
                    Live traffic on the fastest route: <b>{routeTraffic.summary.level}</b>{" "}
                    ({routeTraffic.summary.delay_min > 0 ? `about +${routeTraffic.summary.delay_min} min delay` : "no delay"} · about {fmtMin(routeTraffic.summary.travel_time_min)} with traffic)
                  </p>
                ) : (
                  <p><small>{routeTraffic.reason || "Live traffic is not available."}</small></p>
                )}
                {flowOn && (
                  <p>
                    {["Light", "Moderate", "Heavy"].map((l) => (
                      <span key={l} style={{ marginRight: 14 }}>
                        <span style={{ display: "inline-block", width: 14, height: 6, borderRadius: 3, marginRight: 6, background: TRAFFIC_COLORS[l] }} />
                        {l}
                      </span>
                    ))}
                    {!same && <small>· solid line = fastest, dashed line = shortest</small>}
                  </p>
                )}
              </>
            );
          })()}
        </section>
      )}

      <div className="live-layout">
        <aside className="panel live-list">
          {list.length === 0 && <p>No vehicles yet.</p>}
          {list.map((v) => {
            const on = isOnline(v, now);
            return (
              <div key={v.vehicle_id}
                className={`live-row ${selected === v.vehicle_id ? "active" : ""}`}
                onClick={() => focus(v)}>
                <div className="live-row-top">
                  <b>{v.registration_number}</b>
                  <span className={`live-badge ${on ? "on" : "off"}`}>
                    {on ? "Online" : v.lat != null ? "No signal" : "No GPS data"}
                  </span>
                </div>
                <small>
                  {v.vehicle_type} · {v.driver_name || "No driver"}
                  {on && v.speed_kmh != null ? ` · ${Math.round(v.speed_kmh)} km/h` : ""}
                </small>
                <small>
                  {v.trip ? `${v.trip.origin} → ${v.trip.destination}` : "No trip in progress"}
                  {v.last_seen ? ` · ${ago(v.last_seen, now)}` : ""}
                  {v.trip?.eta && <> · <EtaLine trip={v.trip} /></>}
                </small>
                {canEdit && (
                  <button className="secondary-button"
                    onClick={(e) => { e.stopPropagation(); genKey(v); }}>
                    {v.has_tracker ? "New tracker key" : "Set up tracker"}
                  </button>
                )}
              </div>
            );
          })}
        </aside>
        <div className="live-map" ref={mapDiv} />
      </div>
    </>
  );
}
