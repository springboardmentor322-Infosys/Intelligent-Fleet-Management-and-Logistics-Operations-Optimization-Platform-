import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./GPSTracking.css";

// SIMULATED GPS DATA — these are not live vehicle locations.
const initialVehicles = [
  {
    id: "TRK-101",
    latitude: 17.385,
    longitude: 78.4867,
    speed: 42,
    status: "In Transit",
    trip: "Hyderabad to Bengaluru",
  },
  {
    id: "TRK-102",
    latitude: 17.42,
    longitude: 78.4483,
    speed: 28,
    status: "In Transit",
    trip: "Hyderabad local delivery",
  },
  {
    id: "TRK-103",
    latitude: 17.36,
    longitude: 78.4744,
    speed: 0,
    status: "Stopped",
    trip: "No active trip",
  },
];

const vehicleIcon = L.divIcon({
  className: "vehicle-map-icon",
  html: "🚚",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});
function MapAutoCenter({ location }) {
  const map = useMap();

  useEffect(() => {
    if (location && location.latitude != null && location.longitude != null) {
      map.flyTo([location.latitude, location.longitude], 12, { duration: 1.5 });
    }
  }, [location, map]);

  return null;
}

export default function GPSTracking() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trips, setTrips] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [lastUpdated, setLastUpdated] = useState({});
  const [focusedLocation, setFocusedLocation] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    console.log("GPS token:", Boolean(token));

    async function loadVehicles() {
      try {
        const response = await fetch("http://127.0.0.1:8010/vehicles", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        console.log("GPS token exists:", Boolean(token));
        if (!response.ok) {
          throw new Error(`Could not load vehicles (${response.status})`);
        }

        const data = await response.json();

        // Real vehicle records; coordinates below are simulated.
        const locations = [
          { latitude: 17.385, longitude: 78.4867 },
          { latitude: 17.42, longitude: 78.4483 },
          { latitude: 17.36, longitude: 78.4744 },
        ];

        const mappedVehicles = data.map((vehicle) => {
          const hasStoredLocation =
            vehicle.latitude !== null &&
            vehicle.latitude !== undefined &&
            vehicle.longitude !== null &&
            vehicle.longitude !== undefined;

          return {
            ...vehicle,
            id: vehicle.id,
            latitude: hasStoredLocation
              ? vehicle.latitude
              : locations[0].latitude,
            longitude: hasStoredLocation
              ? vehicle.longitude
              : locations[0].longitude,
            locationSource: hasStoredLocation
              ? "Stored coordinates"
              : "Simulated",
            speed: vehicle.speed ?? null,
            status: vehicle.status === "Active" ? "In Transit" : "Stopped",
            trip: vehicle.driver
              ? `Assigned to ${vehicle.driver}`
              : "No driver assigned",
          };
        });
        console.log("GPS vehicles received:", data);
        console.log("GPS vehicles mapped:", mappedVehicles);

        setVehicles(mappedVehicles);
      } catch (err) {
        setError(err.message || "Unable to load vehicles.");
      } finally {
        setLoading(false);
      }
    }

    loadVehicles();
    loadTrips();
  }, []);
  // Receive vehicle location updates from the backend
  useEffect(() => {
    let socket;
    let reconnectTimer;
    let shouldReconnect = true;

    function connectGPS() {
      const token = localStorage.getItem("access_token");

      if (!token) {
        console.error("JWT token not found");
        return;
      }

      socket = new WebSocket("ws://127.0.0.1:8010/ws/gps");

      socket.onopen = () => {
        console.log("GPS WebSocket connected");
        socket.send(token);
        console.log("JWT token sent to GPS WebSocket");
      };

      socket.onmessage = (event) => {
        try {
          const location = JSON.parse(event.data);
          setFocusedLocation({
            latitude: location.latitude,
            longitude: location.longitude,
          });

          console.log("GPS location received:", location);

          setLastUpdated((previous) => ({
            ...previous,
            [location.vehicle_id]: new Date().toLocaleTimeString(),
          }));

          const updatedAt = location.location_updated_at
            ? new Date(location.location_updated_at).toLocaleString()
            : new Date().toLocaleString();

          setLastUpdated((previous) => ({
            ...previous,
            [location.vehicle_id]: updatedAt,
          }));

          setVehicles((previousVehicles) =>
            previousVehicles.map((vehicle) =>
              vehicle.id === location.vehicle_id
                ? {
                    ...vehicle,
                    latitude: location.latitude,
                    longitude: location.longitude,
                    speed: location.speed,
                    location_updated_at: location.location_updated_at,
                    locationSource: "Backend update",
                  }
                : vehicle,
            ),
          );
        } catch (error) {
          console.error("GPS update error:", error);
        }
      };

      socket.onerror = (error) => {
        console.error("GPS WebSocket error:", error);
      };

      socket.onclose = (event) => {
        console.log("GPS WebSocket disconnected");

        // Do not retry if the backend rejected authentication.
        if (event.code === 1008) {
          console.error(
            "GPS WebSocket authentication failed. Please log in again.",
          );
          return;
        }

        if (shouldReconnect) {
          console.log("Reconnecting GPS in 3 seconds...");

          reconnectTimer = setTimeout(() => {
            connectGPS();
          }, 3000);
        }
      };
    }

    connectGPS();

    return () => {
      shouldReconnect = false;
      clearTimeout(reconnectTimer);

      if (socket) {
        socket.close();
      }
    };
  }, []);

  async function loadTrips() {
    try {
      const token = localStorage.getItem("access_token");

      const response = await fetch("http://127.0.0.1:8010/trips", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Could not load trips");
      }

      const data = await response.json();
      console.log("Trips received:", data);
      setTrips(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error loading trips:", error);
    }
  }

  return (
    <div className="gps-page">
      <div className="gps-heading">
        <div>
          <h1>GPS Vehicle Tracking</h1>
          <p>Monitor vehicle locations and trip information.</p>
        </div>
        <span className="simulation-badge">
          {vehicles.some((vehicle) => vehicle.locationSource === "Simulated")
            ? "MIXED GPS DATA"
            : "BACKEND LOCATION DATA"}
        </span>
      </div>

      <div className="gps-summary">
        <div className="gps-card">
          <span>Total Vehicles</span>
          <strong>{vehicles.length}</strong>
        </div>

        <div className="gps-card">
          <span>In Transit</span>
          <strong>
            {vehicles.filter((v) => v.status === "In Transit").length}
          </strong>
        </div>

        <div className="gps-card">
          <span>Stopped</span>
          <strong>
            {vehicles.filter((v) => v.status === "Stopped").length}
          </strong>
        </div>
      </div>

      <div className="gps-map-layout">
        <div className="gps-map">
          <MapContainer
            center={[17.385, 78.4867]}
            zoom={12}
            scrollWheelZoom
            style={{ height: "480px", width: "100%" }}
          >
            <MapAutoCenter location={focusedLocation} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {vehicles.map((vehicle) => (
              <Marker
                key={vehicle.id}
                position={[vehicle.latitude, vehicle.longitude]}
                icon={vehicleIcon}
                opacity={
                  selectedTrip && selectedTrip.vehicle_id !== vehicle.id
                    ? 0.4
                    : 1
                }
              >
                <Popup>
                  <strong>{vehicle.id}</strong>
                  <br />
                  Status: {vehicle.status}
                  <br />
                  Speed: {vehicle.speed} km/h
                  <br />
                  Trip: {vehicle.trip}
                  <br />
                  Location source: {vehicle.locationSource || "Unknown"}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className="gps-vehicle-list">
          <h2>Tracked Vehicles</h2>

          {vehicles.map((vehicle) => (
            <div className="gps-vehicle-item" key={vehicle.id}>
              <div className="gps-vehicle-top">
                <strong>{vehicle.id}</strong>
                <span
                  className={
                    vehicle.status === "In Transit"
                      ? "gps-status moving"
                      : "gps-status stopped"
                  }
                >
                  {vehicle.status}
                </span>
              </div>

              <p>{vehicle.trip}</p>
              <p>Speed: {vehicle.speed ?? "Unknown"} km/h</p>
              <p>
                Coordinates: {vehicle.latitude}, {vehicle.longitude}
              </p>

              <p>
                Last updated:{" "}
                {lastUpdated[vehicle.id] || "Waiting for GPS update"}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="gps-trip-list">
        <h2>Schedule a New Trip</h2>

        <form
          onSubmit={async (event) => {
            event.preventDefault();

            const form = event.target;
            const token = localStorage.getItem("access_token");

            const tripData = {
              trip_number: form.trip_number.value,
              shipment_id: Number(form.shipment_id.value),
              vehicle_id: Number(form.vehicle_id.value),
              driver_id: Number(form.driver_id.value),
              start_location: form.start_location.value,
              destination: form.destination.value,
            };

            try {
              const response = await fetch("http://127.0.0.1:8010/trips", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(tripData),
              });

              const result = await response.json();

              if (!response.ok) {
                throw new Error(result.detail || "Could not schedule trip.");
              }

              alert("Trip scheduled successfully!");
              form.reset();
              window.location.reload();
            } catch (error) {
              alert(error.message);
            }
          }}
        >
          <input
            name="trip_number"
            placeholder="Trip Number (e.g. TRIP-2001)"
            required
          />

          <input
            name="shipment_id"
            type="number"
            placeholder="Shipment ID"
            min="1"
            required
          />

          <input
            name="vehicle_id"
            type="number"
            placeholder="Vehicle ID"
            min="1"
            required
          />

          <input
            name="driver_id"
            type="number"
            placeholder="Driver ID"
            min="1"
            required
          />

          <input name="start_location" placeholder="Start Location" required />

          <input name="destination" placeholder="Destination" required />

          <button type="submit">Schedule Trip</button>
        </form>
      </div>
      <div className="gps-trip-list">
        <h2>Trip Details</h2>
        <label htmlFor="trip-select">Select a trip: </label>

        <select
          id="trip-select"
          value={selectedTrip?.id || ""}
          onChange={(event) => {
            const trip = trips.find(
              (item) => item.id === Number(event.target.value),
            );
            setSelectedTrip(trip || null);
          }}
        >
          <option value="">All vehicles</option>

          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.trip_number}
            </option>
          ))}
        </select>

        <table>
          <thead>
            <tr>
              <th>Trip Number</th>
              <th>Shipment ID</th>
              <th>Vehicle ID</th>
              <th>Driver ID</th>
              <th>Start Location</th>
              <th>Destination</th>
              <th>ETA</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {trips.map((trip) => (
              <tr key={trip.id}>
                <td>{trip.trip_number}</td>
                <td>{trip.shipment_id}</td>
                <td>{trip.vehicle_id}</td>
                <td>{trip.driver_id}</td>
                <td>{trip.start_location}</td>
                <td>{trip.destination}</td>
                <td>{trip.eta}</td>
                <td>
                  <select
                    value={trip.status}
                    onChange={async (event) => {
                      const newStatus = event.target.value;
                      const token = localStorage.getItem("access_token");

                      try {
                        const response = await fetch(
                          `http://127.0.0.1:8010/trips/${trip.id}/status?status=${encodeURIComponent(newStatus)}`,
                          {
                            method: "PUT",
                            headers: {
                              Authorization: `Bearer ${token}`,
                            },
                          },
                        );

                        if (!response.ok) {
                          throw new Error("Failed to update trip status");
                        }

                        setTrips((previousTrips) =>
                          previousTrips.map((item) =>
                            item.id === trip.id
                              ? { ...item, status: newStatus }
                              : item,
                          ),
                        );
                        await loadTrips();

                        alert("Trip status updated successfully!");
                      } catch (error) {
                        alert(error.message);
                      }
                    }}
                  >
                    <option value="Scheduled">Scheduled</option>
                    <option value="In Transit">In Transit</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {trips.length === 0 && <p>No trips available.</p>}
      </div>
    </div>
  );
}
