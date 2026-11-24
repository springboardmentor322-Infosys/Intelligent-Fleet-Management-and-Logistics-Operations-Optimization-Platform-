import { useCallback, useEffect, useState } from "react";
import {
  cancelTrip,
  completeTrip,
  createTrip,
  getDrivers,
  getTrips,
  getVehicles,
} from "./api";
import "./TripsRoutes.css";
import TripRoutePreview from "./TripRoutePreview";

function formatDateTime(value) {
  if (!value) return "Not scheduled";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString();
}

function getErrorMessage(error) {
  if (typeof error === "string") return error;
  if (error?.detail) {
    return typeof error.detail === "string"
      ? error.detail
      : JSON.stringify(error.detail);
  }
  return error?.message || "Something went wrong. Please try again.";
}

export default function TripsRoutes({
  token,
  simulatingTripId,
  startingTripId,
  simulationError,
  onStartSimulation,
  onStopSimulation,
}) {
  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancellingTripId, setCancellingTripId] = useState(null);
  const [selectedTrip, setSelectedTrip] = useState(null);

  const [form, setForm] = useState({
    origin: "",
    destination: "",
    description: "",
    vehicle_id: "",
    driver_id: "",
    scheduled_at: "",
    estimated_duration_minutes: null,
  });

  
  const [selectedRoute, setSelectedRoute] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [tripData, vehicleData, driverData] = await Promise.all([
        getTrips(token),
        getVehicles(token),
        getDrivers(token),
      ]);

      setTrips(Array.isArray(tripData) ? tripData : []);
      setVehicles(Array.isArray(vehicleData) ? vehicleData : []);
      setDrivers(Array.isArray(driverData) ? driverData : []);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);


  const selectedVehicle = vehicles.find(
    (vehicle) => String(vehicle.id) === form.vehicle_id
  );

  const eligibleDrivers = drivers.filter(
    (driver) =>
      selectedVehicle &&
      String(driver.id) === String(selectedVehicle.assigned_driver_id) &&
      driver.status === "available"
  );

  const handleRouteDurationChange = useCallback((minutes) => {
    setForm((current) => ({
      ...current,
      estimated_duration_minutes: minutes,
    }));
  }, []);

  
  
  const handleSelectedRouteChange = useCallback((route) => {
    setSelectedRoute(route);
  }, []);


  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "vehicle_id" ? { driver_id: "" } : {}),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!form.vehicle_id || !form.driver_id) {
      setError("Select a vehicle and its assigned available driver.");
      return;
    }

    const scheduledDate = new Date(form.scheduled_at);

    if (!form.scheduled_at || Number.isNaN(scheduledDate.getTime())) {
      setError("Enter a valid scheduled date and time.");
      return;
    }

    setSaving(true);

    try {
      await createTrip(token, {
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        description: form.description.trim() || null,
        vehicle_id: Number(form.vehicle_id),
        driver_id: Number(form.driver_id),
        scheduled_at: scheduledDate.toISOString(),
        estimated_duration_minutes: form.estimated_duration_minutes,
        selected_route_id: selectedRoute?.id ?? null,
        selected_route_distance_km: selectedRoute?.distance_km ?? null,
        selected_route_coordinates: selectedRoute?.coordinates ?? null,
      });


      setForm({
        origin: "",
        destination: "",
        description: "",
        vehicle_id: "",
        driver_id: "",
        scheduled_at: "",
        estimated_duration_minutes: null,
      });

      setSelectedRoute(null);

      setNotice("Trip created successfully.");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleStartTripSimulation(trip) {
    setError("");
    setNotice("");

    await onStartSimulation(trip);

    // Refresh the trip list to get its latest backend status.
    await loadData();
  }

  async function handleCancelTrip(trip) {
    const confirmed = window.confirm(
      `Cancel trip #${trip.id} from ${trip.origin} to ${trip.destination}?`
    );

    if (!confirmed) return;

    setError("");
    setNotice("");
    setCancellingTripId(trip.id);

    try {
      await cancelTrip(token, trip.id);
      setNotice(`Trip #${trip.id} was cancelled successfully.`);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCancellingTripId(null);
    }
  }

  async function handleCompleteTrip(trip) {
    const confirmed = window.confirm(
      `Mark trip #${trip.id} from ${trip.origin} to ${trip.destination} as completed?`
    );

    if (!confirmed) return;

    setError("");
    setNotice("");
    setCancellingTripId(trip.id);

    try {
      await completeTrip(token, trip.id);
      setNotice(`Trip #${trip.id} was completed successfully.`);
      setSelectedTrip(null);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCancellingTripId(null);
    }
  }


  const statusLabel = (status) =>
    String(status || "unknown").replaceAll("_", " ");

  return (
    <div className="trips-page">
      <div className="trips-page-header">
  

  <button
    type="button"
    className="trips-refresh-button"
    onClick={loadData}
    disabled={loading}
  >
    Refresh
  </button>
</div>

      {error && <div className="trips-message trips-error">{error}</div>}
      {notice && (
        <div className="trips-message trips-success">{notice}</div>
      )}

      {simulationError && (
        <div className="trips-message trips-error">
          {simulationError}
        </div>
      )}

      <section className="trips-panel">
        <h2>Create a Trip</h2>

        <form className="trips-form" onSubmit={handleSubmit}>
          <label>
            Origin
            <input
              name="origin"
              value={form.origin}
              onChange={handleChange}
              placeholder="e.g. Kochi"
              maxLength={255}
              required
            />
          </label>

          <label>
            Destination
            <input
              name="destination"
              value={form.destination}
              onChange={handleChange}
              placeholder="e.g. Thrissur"
              maxLength={255}
              required
            />
          </label>

                    <div className="trips-route-preview">
            
              <TripRoutePreview
                origin={form.origin}
                destination={form.destination}
                onRouteDurationChange={handleRouteDurationChange}
                onSelectedRouteChange={handleSelectedRouteChange}
              />

          </div>
          
          <label>
            Vehicle
            <select
              name="vehicle_id"
              value={form.vehicle_id}
              onChange={handleChange}
              required
            >
              <option value="">Select a vehicle</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  Vehicle #{vehicle.id}
                  {vehicle.registration_number
                    ? ` — ${vehicle.registration_number}`
                    : ""}
                  {vehicle.status ? ` (${vehicle.status})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            Assigned available driver
            <select
              name="driver_id"
              value={form.driver_id}
              onChange={handleChange}
              disabled={!form.vehicle_id || eligibleDrivers.length === 0}
              required
            >
              <option value="">
                {!form.vehicle_id
                  ? "Select a vehicle first"
                  : eligibleDrivers.length === 0
                    ? "No assigned available driver"
                    : "Select a driver"}
              </option>

              {eligibleDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name || driver.name || `Driver #${driver.id}`}
                  {` — Driver #${driver.id}`}
                </option>
              ))}
            </select>
          </label>

          <label>
            Scheduled date and time
            <input
              type="datetime-local"
              name="scheduled_at"
              value={form.scheduled_at}
              onChange={handleChange}
              required
            />
          </label>

          <label className="trips-description-field">
            Description (optional)
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Additional trip details"
              rows={3}
            />
          </label>

          <div className="trips-form-actions">
            <button type="submit" disabled={saving || loading}>
              {saving ? "Creating trip..." : "Create Trip"}
            </button>
          </div>
        </form>

        <p className="trips-form-hint">
          Creating a trip reserves its vehicle and driver until the trip is
          completed or cancelled.
        </p>
      </section>

      <section className="trips-panel">
        <div className="trips-list-header">
          <h2>All Trips</h2>
          <span>{trips.length} trip(s)</span>
        </div>

        {loading ? (
          <p>Loading trips...</p>
        ) : trips.length === 0 ? (
          <p>No trips found. Create a trip using the form above.</p>
        ) : (
          <div className="trips-table-wrapper">
            <table className="trips-table">
              <thead>
                <tr>
                  <th>Trip</th>
                  <th>Route</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Scheduled</th>
                  <th>Status</th>
                  <th>Estimated arrival</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {trips.map((trip) => (
                  <tr key={trip.id}>
                    <td>#{trip.id}</td>
                    <td>
                      <strong>{trip.origin}</strong>
                      <span className="trips-route-arrow"> → </span>
                      <strong>{trip.destination}</strong>
                      {trip.description && (
                        <div className="trips-description">
                          {trip.description}
                        </div>
                      )}
                    </td>
                    <td>#{trip.vehicle_id}</td>
                    <td>#{trip.driver_id}</td>
                    <td>{formatDateTime(trip.scheduled_at)}</td>
                    <td>
                      <span
                        className={`trips-status trips-status-${String(
                          trip.status
                        ).replaceAll("_", "-")}`}
                      >
                        {statusLabel(trip.status)}
                      </span>
                    </td>
                    <td>{formatDateTime(trip.estimated_arrival_at)}</td>
                    <td>
                      <div className="trip-action-buttons">
                        <button
                          type="button"
                          className="trip-details-button"
                          onClick={() => setSelectedTrip(trip)}
                        >
                          View Details
                        </button>

                        {String(trip.status).toLowerCase() === "assigned" && (
                          <button
                            type="button"
                            className="trips-cancel-button"
                            onClick={() => handleCancelTrip(trip)}
                            disabled={cancellingTripId !== null || loading}
                          >
                            {cancellingTripId === trip.id
                              ? "Cancelling..."
                              : "Cancel Trip"}
                          </button>
                        )}

                        {["assigned", "in_progress"].includes(
                          String(trip.status).toLowerCase()
                        ) && (
                          simulatingTripId === trip.id ? (
                            <button
                              type="button"
                              className="trips-cancel-button"
                              onClick={() => onStopSimulation(trip.id)}
                              disabled={startingTripId === trip.id}
                            >
                              Stop Simulation
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="trip-complete-button"
                              onClick={() => handleStartTripSimulation(trip)}
                              disabled={startingTripId !== null || loading}
                            >
                              {startingTripId === trip.id
                                ? "Starting..."
                                : "Start Simulation"}
                            </button>
                          )
                        )}

                        {String(trip.status).toLowerCase() === "in_progress" && (
                          <button
                            type="button"
                            className="trip-complete-button"
                            onClick={() => handleCompleteTrip(trip)}
                            disabled={cancellingTripId !== null || loading}
                          >
                            {cancellingTripId === trip.id
                              ? "Completing..."
                              : "Complete Trip"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
            {selectedTrip && (
        <div
          className="trip-details-overlay"
          onClick={() => setSelectedTrip(null)}
        >
          <div
            className="trip-details-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="trip-details-header">
              <div>
                <h2>Trip Details</h2>
                <p>Trip #{selectedTrip.id}</p>
              </div>

              <button
                type="button"
                className="trip-details-close"
                onClick={() => setSelectedTrip(null)}
                aria-label="Close trip details"
              >
                &times;
              </button>
            </div>

            <div className="trip-details-content">
              <div>
                <span>Origin</span>
                <strong>{selectedTrip.origin || "—"}</strong>
              </div>

              <div>
                <span>Destination</span>
                <strong>{selectedTrip.destination || "—"}</strong>
              </div>

              <div>
                <span>Vehicle ID</span>
                <strong>{selectedTrip.vehicle_id ?? "—"}</strong>
              </div>

              <div>
                <span>Driver ID</span>
                <strong>{selectedTrip.driver_id ?? "—"}</strong>
              </div>

              <div>
                <span>Scheduled At</span>
                <strong>
                  {formatDateTime(selectedTrip.scheduled_at)}
                </strong>
              </div>

              <div>
                <span>Estimated Arrival</span>
                <strong>
                  {formatDateTime(selectedTrip.estimated_arrival_at)}
                </strong>
              </div>

              <div>
                <span>Status</span>
                <strong>{statusLabel(selectedTrip.status)}</strong>
              </div>

              <div>
                <span>Description</span>
                <strong>
                  {selectedTrip.description || "No additional details"}
                </strong>
              </div>
            </div>

            <div className="trip-details-footer">
              {String(selectedTrip.status).toLowerCase() === "assigned" && (
                <button
                  type="button"
                  className="trips-cancel-button"
                  onClick={() => {
                    handleCancelTrip(selectedTrip);
                    setSelectedTrip(null);
                  }}
                  disabled={cancellingTripId !== null || loading}
                >
                  {cancellingTripId === selectedTrip.id
                    ? "Cancelling..."
                    : "Cancel Trip"}
                </button>
              )}

              {String(selectedTrip.status).toLowerCase() === "in_progress" && (
                <button
                  type="button"
                  className="trip-complete-button"
                  onClick={() => handleCompleteTrip(selectedTrip)}
                  disabled={cancellingTripId !== null || loading}
                >
                  {cancellingTripId === selectedTrip.id
                    ? "Completing..."
                    : "Complete Trip"}
                </button>
              )}

              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedTrip(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
