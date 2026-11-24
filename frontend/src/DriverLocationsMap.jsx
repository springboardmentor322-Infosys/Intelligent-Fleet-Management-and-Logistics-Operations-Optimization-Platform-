
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  useMap
} from "react-leaflet";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import { formatISTTimestamp } from "./utils/dateUtils";

const defaultIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});



function MapFocus({ locations, selectedRoute, selectedTripId }) {
  const map = useMap();
  const lastFitKey = useRef(null);

  useEffect(() => {
    let points = [];

    // When a trip is selected, focus on its complete route.
    if (selectedRoute?.length >= 2) {
      points = selectedRoute;
    } else {
      // Otherwise, use available driver locations.
      points = locations
        .filter(location =>
          Number.isFinite(Number(location.latitude)) &&
          Number.isFinite(Number(location.longitude))
        )
        .map(location => [
          Number(location.latitude),
          Number(location.longitude)
        ]);
    }

    if (points.length === 0) return;

    // Identify the view using the selected trip,
    // NOT the continuously changing driver coordinates.
    const fitKey = selectedTripId != null
      ? `trip-${selectedTripId}`
      : "fleet-overview";

    // Only adjust the map when the selected trip changes.
    if (lastFitKey.current === fitKey) return;

    lastFitKey.current = fitKey;

    map.stop();

    if (points.length === 1) {
      map.setView(points[0], 12, {
        animate: true
      });
    } else {
      map.fitBounds(points, {
        padding: [40, 40],
        maxZoom: 13,
        animate: true
      });
    }

  }, [map, selectedTripId, selectedRoute, locations]);

  return null;
}


function getDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export default function DriverLocationsMap({
  locations = [],
  trips = [],
  selectedTripId,
  onSelectTrip
}) {
  const validLocations = locations.filter(location => {
    const lat = Number(location.latitude);
    const lon = Number(location.longitude);

    return (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    );
  });

  const selectedTrip = trips.find(
    trip => Number(trip.id) === Number(selectedTripId)
  );

  const selectedLocation = selectedTrip
    ? validLocations.find(
        location =>
          Number(location.driver_id) ===
          Number(selectedTrip.driver_id)
      )
    : null;

  const route = useMemo(() => {
    if (!selectedTrip) return null;

    const coordinates = selectedTrip.selected_route_coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return null;
    }

    const points = coordinates
      .filter(point =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1]))
      )
      .map(point => [Number(point[0]), Number(point[1])]);

    if (points.length < 2) return null;

    if (!selectedLocation) {
      return {
        travelled: [],
        remaining: points
      };
    }

    const current = [
      Number(selectedLocation.latitude),
      Number(selectedLocation.longitude)
    ];

    // Find the nearest point on the saved route.
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    points.forEach((point, index) => {
      const distance = getDistance(point, current);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    // Prefer backend simulation progress when available.
    let progress = Number(
      selectedLocation.progress_percentage
    );

    if (!Number.isFinite(progress)) {
      progress = points.length > 1
        ? (nearestIndex / (points.length - 1)) * 100
        : 0;
    }

    progress = Math.max(0, Math.min(100, progress));

    // The nearest route point helps keep the split aligned
    // with the actual driver's current position.
    const progressIndex = Math.round(
      (progress / 100) * (points.length - 1)
    );

    const splitIndex = Math.min(
      Math.max(progressIndex, nearestIndex),
      points.length - 1
    );

    const travelled = [
      ...points.slice(0, splitIndex + 1),
      current
    ];

    const remaining = [
      current,
      ...points.slice(splitIndex + 1)
    ];

    return {
      travelled,
      remaining,
      progress
    };
  }, [selectedTrip, selectedLocation]);

  const selectedRoute = selectedTrip
    ? selectedTrip.selected_route_coordinates
        ?.filter(point =>
          Array.isArray(point) && point.length >= 2
        )
        .map(point => [Number(point[0]), Number(point[1])])
    : null;

  const center = validLocations.length
    ? [
        Number(validLocations[0].latitude),
        Number(validLocations[0].longitude)
      ]
    : [10, 76];

  return (
    <div className="fleet-map-container">

      <div className="fleet-map-heading">
        <div>
          <h3>Fleet Location Map</h3>
          
        </div>
      </div>

    

      <MapContainer
        center={center}
        zoom={10}
        style={{
          height: "480px",
          width: "100%",
          borderRadius: "12px",
          zIndex: 0
        }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapFocus
          locations={validLocations}
          selectedRoute={selectedRoute}
          selectedTripId={selectedTripId}
        />

        {/* Complete route for selected trip */}
        {route && (
          <>
            {/* Travelled route */}
            {route.travelled.length >= 2 && (
              <Polyline
                positions={route.travelled}
                pathOptions={{
                  color: "#16a34a",
                  weight: 6,
                  opacity: 0.95
                }}
              />
            )}

            {/* Remaining route */}
            {route.remaining.length >= 2 && (
              <Polyline
                positions={route.remaining}
                pathOptions={{
                  color: "#2563eb",
                  weight: 6,
                  opacity: 0.85,
                  dashArray: "10, 8"
                }}
              />
            )}

            {/* Starting point */}
            <CircleMarker
              center={selectedRoute[0]}
              radius={9}
              pathOptions={{
                color: "#15803d",
                fillColor: "#22c55e",
                fillOpacity: 1
              }}
            >
              <Popup>Trip Origin</Popup>
            </CircleMarker>

            {/* Destination */}
            <CircleMarker
              center={selectedRoute[selectedRoute.length - 1]}
              radius={9}
              pathOptions={{
                color: "#b91c1c",
                fillColor: "#ef4444",
                fillOpacity: 1
              }}
            >
              <Popup>Trip Destination</Popup>
            </CircleMarker>
          </>
        )}

        {/* Driver markers */}
        {validLocations.map(location => {
          const selected =
            selectedTrip &&
            Number(location.driver_id) ===
            Number(selectedTrip.driver_id);

          return (
            <Marker
              key={location.driver_id}
              position={[
                Number(location.latitude),
                Number(location.longitude)
              ]}
              icon={defaultIcon}
              eventHandlers={{
                click: () => {
                  const driverTrip = trips.find(
                    trip =>
                      Number(trip.driver_id) ===
                      Number(location.driver_id) &&
                      ["assigned", "in_progress"].includes(trip.status)
                  );

                  if (driverTrip) {
                    onSelectTrip?.(driverTrip.id);
                  }
                }
              }}
            >
              <Popup>
                <strong>
                  Driver #{location.driver_id}
                </strong>

                <br />

                {selected ? "Selected Driver" : "Fleet Driver"}

                <br />

                Source: {location.is_simulated ? "Simulated" : "Live GPS"}

                <br />

                Updated: {location.updated_at
                  ? formatISTTimestamp(location.updated_at)
                  : "Unknown"}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {selectedTrip && (
        <div className="selected-route-summary">
          <h4>
            Trip #{selectedTrip.id} Journey
          </h4>

          <p>
            {selectedTrip.origin} → {selectedTrip.destination}
          </p>

          <div className="route-progress-track">
            <div
              className="route-progress-fill"
              style={{
                width: `${route?.progress ?? 0}%`
              }}
            />
          </div>

          <div className="route-progress-label">
            <strong>
              {route?.progress != null
                ? `${route.progress.toFixed(1)}% completed`
                : "Waiting for location updates"}
            </strong>
          </div>
        </div>
      )}

      

      {selectedTrip && !route && (
        <p className="map-instruction">
          Route coordinates are unavailable for this trip.
        </p>
      )}

    </div>
  );
}
