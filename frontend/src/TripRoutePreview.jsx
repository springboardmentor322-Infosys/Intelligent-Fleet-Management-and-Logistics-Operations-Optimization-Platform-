
import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import { apiRequest } from "./api";

function FitRoute({ coordinates }) {
  const map = useMap();

  useEffect(() => {
    if (coordinates.length > 0) {
      map.fitBounds(coordinates, { padding: [30, 30] });
    }
  }, [coordinates, map]);

  return null;
}


export default function TripRoutePreview({
  origin,
  destination,
  onRouteDurationChange,
  onSelectedRouteChange,
}) {
  const [route, setRoute] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
  const start = origin.trim();
  const end = destination.trim();

  const controller = new AbortController();

  let timer;

  if (!start || !end) {
    timer = window.setTimeout(() => {
      setRoute(null);
      setError("");
      setLoading(false);
      onRouteDurationChange(null);
      onSelectedRouteChange?.(null);
      setSelectedRouteId(0);
    }, 0);
  } else {
    async function loadRoute() {
      setLoading(true);
      setError("");
      setRoute(null);
      onSelectedRouteChange?.(null);
      setSelectedRouteId(0);

      try {
        const params = new URLSearchParams({
          origin: start,
          destination: end,
        });

        const data = await apiRequest(
          `/route-preview/?${params.toString()}`,
          { signal: controller.signal }
        );

        const routes =
          Array.isArray(data.routes) && data.routes.length
            ? data.routes
            : [{
                id: 0,
                distance_km: data.distance_km,
                duration_minutes: data.duration_minutes,
                coordinates: data.coordinates,
              }];

        if (controller.signal.aborted) return;

        setRoute({
          from: data.from,
          to: data.to,
          routes,
        });

        onRouteDurationChange(routes[0].duration_minutes);
        onSelectedRouteChange?.(routes[0]);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Unable to preview this route.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    timer = window.setTimeout(loadRoute, 0);
  }

  return () => {
    window.clearTimeout(timer);
    controller.abort();
  };
}, [
  origin,
  destination,
  onRouteDurationChange,
  onSelectedRouteChange,
]);

  if (!origin.trim() || !destination.trim()) {
    return <p>Enter an origin and destination to preview the road route.</p>;
  }

  if (loading) {
    return <p>Finding locations and calculating road routes...</p>;
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (!route) return null;

  const selectedRoute =
    route.routes.find((item) => item.id === selectedRouteId) ??
    route.routes[0];

  const shortestRoute = [...route.routes].sort(
    (a, b) => a.distance_km - b.distance_km
  )[0];

  const fastestRoute = [...route.routes].sort(
    (a, b) => a.duration_minutes - b.duration_minutes
  )[0];

  return (
    <section style={{ marginTop: 20 }}>
      <h3>Road Route Preview</h3>

      <label htmlFor="route-choice">
        Compare available driving routes
      </label>

      <select
        id="route-choice"
        value={selectedRoute.id}
        onChange={(event) => {
          const routeId = Number(event.target.value);
          setSelectedRouteId(routeId);

          const nextRoute = route.routes.find(
            (item) => item.id === routeId
          );

          onRouteDurationChange(nextRoute?.duration_minutes ?? null);
          onSelectedRouteChange?.(nextRoute ?? null);

        }}
      >
        {route.routes.map((item, index) => {
          const labels = [];

          if (item.id === shortestRoute.id) labels.push("Shortest available");
          if (item.id === fastestRoute.id) labels.push("Fastest available");

          return (
            <option key={item.id} value={item.id}>
              {`Route ${index + 1}${
                labels.length ? ` — ${labels.join(" / ")}` : ""
              }`}
            </option>
          );
        })}
      </select>

      <p>
        <strong>Distance:</strong>{" "}
        {selectedRoute.distance_km.toFixed(1)} km
      </p>

      <p>
        <strong>Estimated driving duration:</strong>{" "}
        {Math.round(selectedRoute.duration_minutes)} minutes
      </p>

      <MapContainer
        key={`${origin}-${destination}-${selectedRoute.id}`}
        center={selectedRoute.coordinates[0]}
        zoom={10}
        style={{
          height: "350px",
          width: "100%",
          borderRadius: "12px",
        }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitRoute coordinates={selectedRoute.coordinates} />

        <Polyline positions={selectedRoute.coordinates} />

        <Marker position={[route.from.lat, route.from.lon]}>
          <Popup>Origin: {route.from.label}</Popup>
        </Marker>

        <Marker position={[route.to.lat, route.to.lon]}>
          <Popup>Destination: {route.to.label}</Popup>
        </Marker>
      </MapContainer>

      <p style={{ fontSize: 13, color: "#64748b" }}>
        Routes and duration estimates come from the routing service.
        Shortest and fastest refer only to the alternatives returned.
        Live traffic and fuel consumption are not currently evaluated.
      </p>
    </section>
  );
}
