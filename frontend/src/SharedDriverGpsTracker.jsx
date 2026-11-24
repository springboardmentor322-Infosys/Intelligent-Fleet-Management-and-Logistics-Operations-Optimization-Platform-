import { useEffect, useRef, useState } from "react";
import {
  apiRequest,
  getSelectedDriverLocation,
  updateSelectedDriverLocation,
} from "./api";

function SharedDriverGpsTracker({
  token,
  driverId,
  activeTrip,
  showControls = true,
}) {
  const [location, setLocation] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const simulationIntervalRef = useRef(null);
  const simulationIndexRef = useRef(0);

  function stopSimulation() {
    if (simulationIntervalRef.current !== null) {
      window.clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }

    setSimulating(false);
    setMessage("Location simulation stopped.");
  }

  useEffect(() => {
    let cancelled = false;

    async function loadLastLocation() {
      if (!token || !driverId) {
        setLocation(null);
        return;
      }

      try {
        const result = await getSelectedDriverLocation(token, driverId);

        if (!cancelled) {
          setLocation(result);
        }
      } catch {
        if (!cancelled) {
          setLocation(null);
        }
      }
    }

    loadLastLocation();

    return () => {
      cancelled = true;

      if (simulationIntervalRef.current !== null) {
        window.clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
    };
  }, [token, driverId]);

  async function startSimulation() {
    if (!token || !driverId) {
      setError("Please select a driver first.");
      return;
    }

    if (!activeTrip || activeTrip.status !== "in_progress") {
      setError("Start a trip before starting location simulation.");
      return;
    }

    if (simulationIntervalRef.current !== null) {
      window.clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }

    setError("");
    setMessage("Loading trip route...");

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

      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        throw new Error("No usable road-route coordinates were returned.");
      }

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

      await updateSelectedDriverLocation(
        token,
        driverId,
        routePoints[0]
      );

      setLocation({
        ...routePoints[0],
        updated_at: new Date().toISOString(),
      });

      setSimulating(true);
      setMessage("Simulated location is being shared along the trip route.");

      simulationIndexRef.current = 1;

      simulationIntervalRef.current = window.setInterval(async () => {
        if (simulationIndexRef.current >= routePoints.length) {
          window.clearInterval(simulationIntervalRef.current);
          simulationIntervalRef.current = null;

          setSimulating(false);
          setMessage("Simulation completed — destination reached.");
          return;
        }

        const nextPoint = routePoints[simulationIndexRef.current];

        try {
          await updateSelectedDriverLocation(
            token,
            driverId,
            nextPoint
          );

          setLocation({
            ...nextPoint,
            updated_at: new Date().toISOString(),
          });

          simulationIndexRef.current += 1;
        } catch (err) {
          window.clearInterval(simulationIntervalRef.current);
          simulationIntervalRef.current = null;

          setSimulating(false);
          setError(err.message || "Unable to update simulated location.");
          setMessage("Simulation stopped.");
        }
      }, 5000);
    } catch (err) {
      setSimulating(false);
      setMessage("Simulation stopped.");
      setError(err.message || "Unable to load the trip route.");
    }
  }

  return (
    <div className="shared-driver-gps">
      <h3>Simulated GPS Tracking</h3>

      <p>
        Selected Driver: <strong>{driverId || "Not selected"}</strong>
      </p>

      {activeTrip && (
        <p>
          Trip route: {activeTrip.origin} → {activeTrip.destination}
        </p>
      )}

      {location && (
        <div>
          <p>Latitude: {location.latitude}</p>
          <p>Longitude: {location.longitude}</p>
          <p>
            Last Updated:{" "}
            {location.updated_at
              ? new Date(location.updated_at).toLocaleString()
              : "Not available"}
          </p>
        </div>
      )}

      {error && <p className="error-message">{error}</p>}
      {message && <p>{message}</p>}

      {showControls && (
        <>
            <button
            type="button"
            onClick={startSimulation}
            disabled={
                !driverId ||
                !activeTrip ||
                activeTrip.status !== "in_progress" ||
                simulating
            }
            >
            Start Simulation
            </button>

            <button
            type="button"
            onClick={stopSimulation}
            disabled={!simulating}
            >
            Stop Simulation
            </button>
        </>
        )}
    </div>
  );
}

export default SharedDriverGpsTracker;