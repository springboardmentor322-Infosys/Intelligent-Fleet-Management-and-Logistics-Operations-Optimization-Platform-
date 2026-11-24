
import { useEffect, useRef, useState } from "react";
import {
  apiRequest,
  updateMyDriverLocation,
  getMyDriverLocation,
} from "./api";

export default function DriverGpsTracker({ token, activeTrip }) {
  const [tracking, setTracking] = useState(false);
  const [location, setLocation] = useState(null);
  const [status, setStatus] = useState("GPS tracking is stopped.");
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const watchIdRef = useRef(null);
  const lastSentRef = useRef(0);
  const sendingRef = useRef(false);
  const trackingRef = useRef(false);

  const [simulating, setSimulating] = useState(false);
  const simulationIntervalRef = useRef(null);
  const simulationIndexRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function loadLastLocation() {
      if (!token) return;

      try {
        const savedLocation = await getMyDriverLocation(token);

        if (!cancelled) {
          setLocation(savedLocation);
          setLastUpdated(savedLocation.updated_at);
        }
      } catch {
        // No saved location is normal before the first GPS update.
      }
    }

    loadLastLocation();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    return () => {
      trackingRef.current = false;

      if (
        watchIdRef.current !== null &&
        navigator.geolocation
      ) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      if (simulationIntervalRef.current !== null) {
        clearInterval(simulationIntervalRef.current);
      }
    };
  }, []);

  function startTracking() {
    if (!token) {
      setError("Please log in again before starting GPS tracking.");
      return;
    }

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }

    setError("");
    setStatus("Requesting your location...");
    trackingRef.current = true;
    setTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        if (!trackingRef.current) return;

        const currentLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };

        setLocation(currentLocation);
        setStatus("GPS location received.");

        const now = Date.now();

        // Send updates at most once every 5 seconds.
        if (
          now - lastSentRef.current < 5000 ||
          sendingRef.current
        ) {
          return;
        }

        sendingRef.current = true;

        try {
          await updateMyDriverLocation(token, currentLocation);

          lastSentRef.current = Date.now();
          setLastUpdated(new Date().toISOString());
          setStatus("Your location is being shared.");
          setError("");
        } catch (err) {
          setStatus("Could not update your location.");
          setError(err.message || "Failed to send GPS location.");
        } finally {
          sendingRef.current = false;
        }
      },
      (gpsError) => {
        trackingRef.current = false;
        setTracking(false);

        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }

        if (gpsError.code === 1) {
          setError("Location permission was denied. Allow location access in your browser.");
        } else if (gpsError.code === 2) {
          setError("Your current location is unavailable. Check your device's location settings.");
        } else if (gpsError.code === 3) {
          setError("Getting your location timed out. Please try again.");
        } else {
          setError(gpsError.message || "Unable to get your location.");
        }

        setStatus("GPS tracking stopped.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );
  }

  function stopTracking() {
    trackingRef.current = false;

    if (
      watchIdRef.current !== null &&
      navigator.geolocation
    ) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setTracking(false);
    setStatus("GPS tracking is stopped.");
  }

  function stopSimulation() {
  if (simulationIntervalRef.current !== null) {
    clearInterval(simulationIntervalRef.current);
    simulationIntervalRef.current = null;
  }

  setSimulating(false);
  setStatus("GPS simulation stopped.");
}


async function startSimulation() {
  if (!token) {
    setError("Please sign in before starting GPS simulation.");
    return;
  }

  if (!activeTrip || activeTrip.status !== "in_progress") {
    setError("Start a trip before starting GPS simulation.");
    return;
  }

  // Stop real GPS tracking if it is currently running.
  if (watchIdRef.current !== null) {
    navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  }

  setTracking(false);
  trackingRef.current = false;

  // Stop any previous simulation.
  if (simulationIntervalRef.current !== null) {
    window.clearInterval(simulationIntervalRef.current);
    simulationIntervalRef.current = null;
  }

  setError("");
  setStatus("Loading trip route...");

  try {
    const params = new URLSearchParams({
      origin: activeTrip.origin,
      destination:
        activeTrip.destination.trim().toLowerCase() === "banglore"
          ? "Bengaluru, Karnataka, India"
          : activeTrip.destination,
    });

    const routeData = await apiRequest(
      `/route-preview/?${params.toString()}`,
      { token }
    );

    const routes =
      Array.isArray(routeData.routes) && routeData.routes.length
        ? routeData.routes
        : [routeData];

    const coordinates = routes[0]?.coordinates;
    console.log("Active trip:", activeTrip.origin, "→", activeTrip.destination);
    console.log("Route preview response:", JSON.stringify(routeData, null, 2));
    console.log("Selected route:", JSON.stringify(routes[0], null, 2));
    console.log("First coordinate:", JSON.stringify(coordinates?.[0]));
    console.log("Last coordinate:", JSON.stringify(coordinates?.[coordinates.length - 1]));

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      throw new Error("No usable road-route coordinates were returned.");
    }

    // The route-preview coordinates are [latitude, longitude].
    
      const allRoutePoints = coordinates
        .filter(
          (point) =>
            Array.isArray(point) &&
            point.length >= 2 &&
            Number.isFinite(Number(point[0])) &&
            Number.isFinite(Number(point[1]))
        )
        .map((point) => ({
          latitude: Number(point[0]),
          longitude: Number(point[1]),
          accuracy: 5,
        }));

      if (allRoutePoints.length < 2) {
        throw new Error("The selected route has insufficient coordinates.");
      }

      // Keep approximately 40 points so movement is visible in testing.
      const targetPointCount = 40;
      const stride = Math.max(
        1,
        Math.ceil((allRoutePoints.length - 1) / (targetPointCount - 1))
      );

      const routePoints = allRoutePoints.filter(
        (_, index) =>
          index === 0 ||
          index === allRoutePoints.length - 1 ||
          index % stride === 0
      );


    if (routePoints.length < 2) {
      throw new Error("The selected route has insufficient coordinates.");
    }

    // Send the first route position immediately.
    await updateMyDriverLocation(token, routePoints[0]);

    setLocation(routePoints[0]);
    setLastUpdated(new Date());
    setSimulating(true);
    setStatus("GPS simulation running");

    simulationIndexRef.current = 1;

    // Move forward along the actual road route every 5 seconds.
    simulationIntervalRef.current = window.setInterval(async () => {
      if (simulationIndexRef.current >= routePoints.length) {
        window.clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;

        setSimulating(false);
        setStatus("Simulation completed — destination reached");
        return;
      }

      const nextPoint = routePoints[simulationIndexRef.current];

      try {
        await updateMyDriverLocation(token, nextPoint);

        setLocation(nextPoint);
        setLastUpdated(new Date());
        simulationIndexRef.current += 1;
      } catch (error) {
        window.clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;

        setSimulating(false);
        setError(error.message || "Unable to send simulated location.");
        setStatus("Simulation stopped");
      }
    }, 5000);
  } catch (error) {
    setSimulating(false);
    setStatus("Simulation stopped");
    setError(error.message || "Unable to load the trip route.");
  }
}


  return (
    <section
      style={{
        maxWidth: "650px",
        padding: "24px",
        margin: "20px 0",
        border: "1px solid #d9e1e8",
        borderRadius: "12px",
        background: "#ffffff",
        color: "#263445",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Live GPS Tracking</h2>

      <p>
        Share your current location so it can be recorded in the
        fleet management system.
      </p>

      <p>
        <strong>Status:</strong> {status}
      </p>

      {location && (
        <div
          style={{
            padding: "12px",
            margin: "16px 0",
            background: "#f3f6f9",
            borderRadius: "8px",
            overflowWrap: "anywhere",
          }}
        >
          <p>
            <strong>Latitude:</strong> {location.latitude}
          </p>
          <p>
            <strong>Longitude:</strong> {location.longitude}
          </p>

          {location.accuracy != null && (
            <p>
              <strong>Accuracy:</strong>{" "}
              {Math.round(location.accuracy)} metres
            </p>
          )}

          {lastUpdated && (
            <p>
              <strong>Last saved:</strong>{" "}
              {new Date(lastUpdated).toLocaleString()}
            </p>
          )}

          <a
            href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            View location on Google Maps
          </a>
        </div>
      )}

      {error && (
        <p style={{ color: "#c62828" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={startTracking}
          disabled={tracking}
          style={{
            padding: "10px 16px",
            border: "none",
            borderRadius: "6px",
            background: tracking ? "#9ca3af" : "#1769aa",
            color: "#ffffff",
            cursor: tracking ? "not-allowed" : "pointer",
          }}
        >
          Start GPS Tracking
        </button>

        <button
          type="button"
          onClick={stopTracking}
          disabled={!tracking}
          style={{
            padding: "10px 16px",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            background: "#ffffff",
            color: "#263445",
            cursor: tracking ? "pointer" : "not-allowed",
          }}
        >
          Stop Tracking
        </button>

        <button
          type="button"
          onClick={startSimulation}
          disabled={tracking || simulating}
          style={{
            padding: "10px 16px",
            border: "none",
            borderRadius: "6px",
            background: simulating ? "#9ca3af" : "#15803d",
            color: "#ffffff",
            cursor: tracking || simulating ? "not-allowed" : "pointer",
          }}
        >
          Start Simulation
        </button>

        <button
          type="button"
          onClick={stopSimulation}
          disabled={!simulating}
          style={{
            padding: "10px 16px",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            background: "#ffffff",
            color: "#263445",
            cursor: simulating ? "pointer" : "not-allowed",
          }}
        >
          Stop Simulation
        </button>
      </div>

      <p style={{ fontSize: "13px", color: "#64748b", marginBottom: 0 }}>
        GPS updates require your permission. Tracking stops when
        you press Stop or leave this page.
      </p>
    </section>
  );
}