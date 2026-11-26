// FleetFlow routing engine: geocoding, real-road geometry (OSRM) and route helpers.
// Road geometry is fetched from OSRM; strategy evaluation is done by the backend
// (/api/routes/optimize) with a compact local fallback below for when the API is unreachable.

export const DEFAULT_COORDS = [12.9716, 77.5946];

export const KNOWN_LOCATIONS = {
  whitefield: [12.9698, 77.75],
  koramangala: [12.9352, 77.6245],
  peenya: [13.0285, 77.5197],
  yeshwanthpur: [13.0285, 77.5407],
  indiranagar: [12.9784, 77.6408],
  jayanagar: [12.925, 77.5838],
  'electronic city': [12.8452, 77.6602],
  hebbal: [13.0358, 77.597],
  'mg road': [12.9751, 77.6068],
  depot: [12.9716, 77.5946],
  'service centre': [12.9611, 77.6387],
  bengaluru: [12.9716, 77.5946],
  bangalore: [12.9716, 77.5946],
  hyderabad: [17.385, 78.4867],
  vijayawada: [16.5062, 80.648],
  guntur: [16.3067, 80.4365],
  mangalagiri: [16.4307, 80.5535],
  navuluru: [16.4085, 80.548],
  amaravati: [16.5131, 80.5165],
  chennai: [13.0827, 80.2707]
};

const OSRM_BASES = [
  'https://router.project-osrm.org/route/v1/driving',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving'
];

/** Most specific known hub. The first comma-separated part wins ("Navuluru, Mangalagiri" -> Navuluru). */
export function lookupKnownCoords(name) {
  const text = String(name || '').toLowerCase().trim();
  if (!text) return null;
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  for (const part of parts.length ? parts : [text]) {
    let best = null;
    let bestLen = 0;
    for (const [key, coords] of Object.entries(KNOWN_LOCATIONS)) {
      if (part.includes(key) && key.length > bestLen) {
        best = coords;
        bestLen = key.length;
      }
    }
    if (best) return [...best];
  }
  return null;
}

// ---------- Geocoding (known hubs -> cache -> Nominatim, rate limited) ----------
const GEO_STORE = 'fleetflow-geocache-v2';
const geocodeCache = new Map();
try {
  const saved = JSON.parse(localStorage.getItem(GEO_STORE) || '{}');
  Object.entries(saved).forEach(([k, v]) => geocodeCache.set(k, v));
} catch {
  /* storage unavailable */
}
function persistGeocache() {
  try {
    localStorage.setItem(GEO_STORE, JSON.stringify(Object.fromEntries(geocodeCache)));
  } catch {
    /* ignore */
  }
}

let geocodeChain = Promise.resolve();
function throttledNominatim(raw) {
  const run = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(raw)}`;
      const resp = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!resp.ok) return null;
      const results = await resp.json();
      const lat = Number(results?.[0]?.lat);
      const lng = Number(results?.[0]?.lon);
      return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      await new Promise((r) => setTimeout(r, 1000)); // Nominatim usage policy: max 1 request/second
    }
  };
  const next = geocodeChain.then(run, run);
  geocodeChain = next.catch(() => null);
  return next;
}

/** Resolve any place name to [lat, lng]. Returns null when it cannot be located (never a fake position). */
export async function geocodeAnyPlace(placeName) {
  const raw = String(placeName || '').trim();
  if (!raw) return null;
  const known = lookupKnownCoords(raw);
  if (known) return known;
  const key = raw.toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  const coords = await throttledNominatim(raw);
  if (coords) {
    geocodeCache.set(key, coords);
    persistGeocache();
  }
  return coords;
}

/** Synchronous best-effort lookup (known hubs or cached geocodes). null when unknown. */
export function resolveHubCoords(name) {
  const known = lookupKnownCoords(name);
  if (known) return known;
  const cached = geocodeCache.get(String(name || '').trim().toLowerCase());
  return cached ? [...cached] : null;
}

// ---------- Geometry helpers ----------
export function segmentMeters(a, b) {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function pathLengthKm(points) {
  let m = 0;
  for (let i = 0; i < (points?.length || 0) - 1; i++) m += segmentMeters(points[i], points[i + 1]);
  return m / 1000;
}

/** Ramer–Douglas–Peucker simplification (keeps the road shape, drops redundant points). */
export function simplifyPath(points, maxPoints = 400) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points;
  const kx = 111.32 * Math.cos((points[0][0] * Math.PI) / 180);
  const xy = points.map((p) => [p[1] * kx, p[0] * 110.574]);
  const run = (tol) => {
    const keep = new Array(xy.length).fill(false);
    keep[0] = keep[xy.length - 1] = true;
    const stack = [[0, xy.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      const [ax, ay] = xy[s];
      const [bx, by] = xy[e];
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      let maxD = -1;
      let idx = -1;
      for (let i = s + 1; i < e; i++) {
        const [px, py] = xy[i];
        const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
        const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        if (d > maxD) {
          maxD = d;
          idx = i;
        }
      }
      if (idx !== -1 && maxD > tol) {
        keep[idx] = true;
        stack.push([s, idx], [idx, e]);
      }
    }
    return keep.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
  };
  let tol = 0.004;
  let kept = run(tol);
  while (kept.length > maxPoints && tol < 8) {
    tol *= 1.7;
    kept = run(tol);
  }
  return kept.map((i) => points[i]);
}

export function computeRoadBearing(a, b) {
  if (!a || !b) return 0;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function pointAtRoadFraction(waypoints, fraction) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return null;
  if (waypoints.length === 1) return { pos: waypoints[0], heading: 0, splitIndex: 0 };
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const cum = [0];
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    total += segmentMeters(waypoints[i], waypoints[i + 1]);
    cum.push(total);
  }
  if (total === 0) return { pos: waypoints[0], heading: 0, splitIndex: 0 };
  const target = f * total;
  let seg = 0;
  while (seg < cum.length - 2 && cum[seg + 1] < target) seg++;
  const segLen = Math.max(0.001, cum[seg + 1] - cum[seg]);
  const t = Math.max(0, Math.min(1, (target - cum[seg]) / segLen));
  const p1 = waypoints[seg];
  const p2 = waypoints[seg + 1];
  return {
    pos: [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t],
    heading: computeRoadBearing(p1, p2),
    splitIndex: seg
  };
}

// ---------- Real-road geometry (OSRM) ----------
const roadCache = new Map();
const inflight = new Map();

async function queryOsrm(coordsList) {
  const coordStr = coordsList.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
  for (const base of OSRM_BASES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const resp = await fetch(
        `${base}/${coordStr}?overview=full&geometries=geojson&alternatives=true&steps=false`,
        { signal: controller.signal }
      );
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data.code === 'Ok' && data.routes?.length) {
        return data.routes.map((r) => ({
          distanceKm: Number((r.distance / 1000).toFixed(1)),
          durationMin: Math.max(1, r.duration / 60),
          waypoints: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
          source: 'osrm'
        }));
      }
    } catch {
      /* try next server */
    } finally {
      clearTimeout(timer);
    }
  }
  return [];
}

function viaPoints(o, d) {
  const midLat = (o[0] + d[0]) / 2;
  const midLng = (o[1] + d[1]) / 2;
  const kx = 111.32 * Math.cos((midLat * Math.PI) / 180);
  const dx = (d[1] - o[1]) * kx;
  const dy = (d[0] - o[0]) * 110.574;
  const len = Math.hypot(dx, dy) || 1e-9;
  const off = Math.min(30, 0.2 * len);
  const ux = -dy / len;
  const uy = dx / len;
  return [1, -1].map((s) => [midLat + (s * uy * off) / 110.574, midLng + (s * ux * off) / kx]);
}

function dedupeCandidates(list) {
  const kept = [];
  for (const c of list) {
    const mid = c.waypoints[Math.floor(c.waypoints.length / 2)];
    const dup = kept.some((k) => {
      const kmid = k.waypoints[Math.floor(k.waypoints.length / 2)];
      const rel = Math.abs(c.distanceKm - k.distanceKm) / Math.max(c.distanceKm, k.distanceKm, 0.1);
      return rel < 0.02 && segmentMeters(mid, kmid) < 500;
    });
    if (!dup) kept.push(c);
  }
  return kept;
}

/** Distinct real driving geometries: OSRM alternatives + two via-point detours. Cached and de-duplicated. */
export function fetchRoadCandidates(o, d) {
  if (!o || !d) return Promise.resolve([]);
  const key = `${o[0].toFixed(3)},${o[1].toFixed(3)}>${d[0].toFixed(3)},${d[1].toFixed(3)}`;
  if (roadCache.has(key)) return Promise.resolve(roadCache.get(key));
  if (inflight.has(key)) return inflight.get(key);
  const [v1, v2] = viaPoints(o, d);
  const job = Promise.all([queryOsrm([o, d]), queryOsrm([o, v1, d]), queryOsrm([o, v2, d])])
    .then(([direct, a, b]) => {
      let cands = [...direct, ...[a, b].filter((r) => r.length).map((r) => r[0])];
      if (cands.length) {
        const best = Math.min(...cands.map((c) => c.distanceKm));
        cands = dedupeCandidates(cands.filter((c) => c.distanceKm <= best * 1.5));
        roadCache.set(key, cands);
      }
      return cands;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/** Single-pair road geometry used by the map for trips that only have sparse stored waypoints. */
export async function fetchRealRoadGeometry(o, d) {
  const cands = await fetchRoadCandidates(o, d);
  return cands.length ? cands : null;
}

// ---------- Local fallback (used only when the API is unreachable) ----------
function curvedCandidates(o, d) {
  const midLat = (o[0] + d[0]) / 2;
  const midLng = (o[1] + d[1]) / 2;
  const kx = 111.32 * Math.cos((midLat * Math.PI) / 180);
  const dx = (d[1] - o[1]) * kx;
  const dy = (d[0] - o[0]) * 110.574;
  const len = Math.hypot(dx, dy) || 1e-9;
  const ux = -dy / len;
  const uy = dx / len;
  const speed = len >= 45 ? 58 : 32;
  return [0.05, -0.11, 0, 0.14].map((bulge) => {
    const cLat = midLat + (uy * bulge * len * 2) / 110.574;
    const cLng = midLng + (ux * bulge * len * 2) / kx;
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      pts.push([
        (1 - t) ** 2 * o[0] + 2 * (1 - t) * t * cLat + t * t * d[0],
        (1 - t) ** 2 * o[1] + 2 * (1 - t) * t * cLng + t * t * d[1]
      ]);
    }
    const km = pathLengthKm(pts) * 1.18;
    return { distanceKm: Number(km.toFixed(1)), durationMin: (km / speed) * 60, waypoints: pts, source: 'estimated' };
  });
}

const STRATEGIES = [
  ['Fastest Route', 'FAST', 'Recommended · Traffic-Aware', '#1a73e8'],
  ['Traffic-Avoidance Route', 'TRAFFIC', 'Rerouted · Clears Bottlenecks', '#7c3aed'],
  ['Shortest Route', 'SHORT', 'Minimum Distance', '#d97706'],
  ['Fuel-Efficient Route', 'ECO', 'Eco Cruise · Lowest Fuel Burn', '#16a34a']
];

export function buildLocalRoutes(o, d, candidates) {
  const cands = candidates?.length ? candidates : curvedCandidates(o, d);
  const straightKm = pathLengthKm([o, d]);
  const hourIst = new Date(Date.now() + (new Date().getTimezoneOffset() + 330) * 60000).getHours();
  const amp = (hourIst >= 8 && hourIst < 11) || (hourIst >= 17 && hourIst < 21) ? 1 : hourIst >= 11 && hourIst < 17 ? 0.55 : 0.15;
  const dists = cands.map((c) => c.distanceKm);
  const dmin = Math.min(...dists);
  const span = Math.max(...dists) - dmin;
  const ev = cands.map((c) => {
    const free = Math.max(3, c.durationMin * 1.12);
    const rel = span < 0.5 ? 0.5 : (c.distanceKm - dmin) / span;
    const exposure = straightKm < 45 ? 0.05 + 0.3 * (1 - rel) : 0.02 + 0.1 * (1 - rel);
    const delay = free * amp * exposure;
    const total = free + delay;
    const v = Math.max(15, Math.min(100, c.distanceKm / (total / 60)));
    const fuel = c.distanceKm * 0.11 * (1 + 0.9 * ((v - 60) / 60) ** 2);
    const ratio = delay / free;
    return { ...c, delay, total, fuel, level: ratio >= 0.2 ? 'Heavy' : ratio >= 0.09 ? 'Moderate' : 'Low' };
  });
  const by = (fn) => ev.reduce((a, b) => (fn(b) < fn(a) ? b : a));
  const fast = by((c) => c.total);
  const short = by((c) => c.distanceKm * 1000 + c.total);
  const eco = by((c) => c.fuel);
  const others = ev.filter((c) => c !== fast && c.total <= fast.total * 1.25);
  let avoid = others.length ? others.reduce((a, b) => (b.delay < a.delay ? b : a)) : fast;
  if (avoid !== fast && avoid.delay >= fast.delay) avoid = fast;
  const picks = { 'Fastest Route': fast, 'Traffic-Avoidance Route': avoid, 'Shortest Route': short, 'Fuel-Efficient Route': eco };
  const seen = new Map();
  return STRATEGIES.map(([strategy, key, badge, color]) => {
    const c = picks[strategy];
    const minutes = Math.max(5, Math.round(c.total));
    const eta = new Date(Date.now() + minutes * 60000);
    const route = {
      id: `RT-${key}-LOCAL`,
      strategy,
      badge,
      color,
      summary: `${c.distanceKm} km · about ${minutes} min`,
      distanceKm: c.distanceKm,
      durationMin: minutes,
      trafficLevel: c.level,
      trafficDelayMin: Math.round(c.delay),
      fuelLitres: Number(c.fuel.toFixed(2)),
      co2Kg: Number((c.fuel * 2.68).toFixed(1)),
      waypoints: c.waypoints,
      geometrySource: c.source || 'osrm',
      sameRoadAs: seen.get(c) || null,
      etaDisplay: eta.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };
    if (!seen.has(c)) seen.set(c, strategy);
    return route;
  });
}

/** Pick the geometry matching a stored trip strategy (used to road-snap sparse seed trips on the map). */
export function pickRouteForStrategy(o, d, candidates, strategy) {
  const routes = buildLocalRoutes(o, d, candidates);
  return routes.find((r) => r.strategy === strategy) || routes[0];
}
