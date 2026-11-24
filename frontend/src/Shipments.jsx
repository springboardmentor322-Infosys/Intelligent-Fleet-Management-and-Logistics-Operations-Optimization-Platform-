
import React, { useEffect, useState, useCallback} from "react";
import {
  ClipboardList,
  Plus,
  Search,
  RefreshCw,
  PackageCheck,
  Truck,
  Clock,
  X,
} from "lucide-react";

import {
  getShipments,
  getTrips,
  getDrivers,
  getVehicles,
  createShipment,
  trackShipment,
  updateShipmentStatus,
  deleteShipment,
  getShipmentHistory,
  assignShipmentToTrip,
} from "./api";


const ALLOWED_STATUS_TRANSITIONS = {
  created: ["assigned", "cancelled"],
  assigned: ["in_transit", "cancelled"],
  in_transit: ["delayed", "delivered", "cancelled"],
  delayed: ["in_transit", "delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

function formatStatus(status = "") {
  return status.replaceAll("_", " ");
}


function getShipmentAssignment(shipment, trips, drivers, vehicles) {
  const trip = trips.find(
    (item) => Number(item.id) === Number(shipment.trip_id)
  );

  if (!trip) {
    return {
      tripLabel: "Not assigned",
      driverName: "—",
      vehicleNumber: "—",
      estimatedArrivalAt: shipment.estimated_delivery_at || null,
    };
  }

  const driver = drivers.find(
    (item) => Number(item.id) === Number(trip.driver_id)
  );

  const vehicle = vehicles.find(
    (item) => Number(item.id) === Number(trip.vehicle_id)
  );

  return {
    tripLabel: `Trip #${trip.id}`,
    driverName: driver?.full_name || "Unknown driver",
    vehicleNumber: vehicle?.registration_number || "Unknown vehicle",
    estimatedArrivalAt:
      shipment.estimated_delivery_at ||
      trip.estimated_arrival_at ||
      null,
  };
}


function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString();
}

export default function Shipments({ token, role }) {
  const [shipments, setShipments] = useState([]);
  const [trips, setTrips] = useState([]);
  const assignableTrips = trips.filter(
  (trip) => trip.status === "assigned"
);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingResult, setTrackingResult] = useState(null);
  const [trackingError, setTrackingError] = useState("");
  const [newShipment, setNewShipment] = useState({
  tracking_number: "",
  origin: "",
  destination: "",
  description: "",
  trip_id: "",
});
  
  const [assignmentChanges, setAssignmentChanges] = useState({});
  const [statusChanges, setStatusChanges] = useState({});
  const [shipmentHistory, setShipmentHistory] = useState({});
  const [historyLoading, setHistoryLoading] = useState({});
  const [historyErrors, setHistoryErrors] = useState({});
  const [expandedHistory, setExpandedHistory] = useState({});

  const normalizedRole = (role || "").toLowerCase().replaceAll(" ", "_");
  const canManage =
    ["administrator", "admin", "fleet_manager", "dispatcher"].includes(
      normalizedRole
    );

  const loadShipments = useCallback(async () => {
    if (!token || !canManage) {
      setShipments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await getShipments(token);
      setShipments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Could not load shipments.");
    } finally {
      setLoading(false);
    }
  }, [token, canManage]);

  const loadTrips = useCallback(async () => {
    if (!token || !canManage) {
      setTrips([]);
      setDrivers([]);
      setVehicles([]);
      return;
    }

    setTripsLoading(true);

    try {
      const [tripData, driverData, vehicleData] = await Promise.all([
        getTrips(token),
        getDrivers(token),
        getVehicles(token),
      ]);

      setTrips(Array.isArray(tripData) ? tripData : []);
      setDrivers(Array.isArray(driverData) ? driverData : []);
      setVehicles(Array.isArray(vehicleData) ? vehicleData : []);
    } catch (err) {
      setError(err.message || "Could not load trip assignment details.");
    } finally {
      setTripsLoading(false);
    }
  }, [token, canManage]);

  useEffect(() => {
    if (!token) return;

    loadShipments();
    loadTrips();
  }, [token, loadShipments, loadTrips]);

  async function handleCreateShipment(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    try {
      await createShipment(token, {
        tracking_number: newShipment.tracking_number.trim(),
        origin: newShipment.origin.trim(),
        destination: newShipment.destination.trim(),
        description: newShipment.description.trim() || null,
        trip_id: newShipment.trip_id
        ? Number(newShipment.trip_id)
        : null,
      });

      setNewShipment({
  tracking_number: "",
  origin: "",
  destination: "",
  description: "",
  trip_id: "",
});
      setShowForm(false);
      setNotice("Shipment created successfully.");
      await loadShipments();
    } catch (err) {
      setError(err.message || "Could not create shipment.");
    }
  }

  async function handleTrackShipment(event) {
    event.preventDefault();
    setTrackingError("");
    setTrackingResult(null);

    if (!trackingNumber.trim()) {
      setTrackingError("Enter a tracking number.");
      return;
    }

    try {
      const result = await trackShipment(trackingNumber.trim());
      setTrackingResult(result);
    } catch (err) {
      setTrackingError(err.message || "Shipment tracking failed.");
    }
  }

  
async function handleStatusUpdate(shipmentId) {
  const status = statusChanges[shipmentId];

  if (!status) {
    setError("Choose a new status first.");
    return;
  }

  setError("");
  setNotice("");

  try {
    await updateShipmentStatus(token, shipmentId, status);

    setNotice("Shipment status updated successfully.");

    setStatusChanges((previous) => ({
      ...previous,
      [shipmentId]: "",
    }));

    // Clear cached history so it reloads with the latest status.
    setShipmentHistory((previous) => {
      const updated = { ...previous };
      delete updated[shipmentId];
      return updated;
    });

    setHistoryErrors((previous) => ({
      ...previous,
      [shipmentId]: "",
    }));

    await loadShipments();
    if (expandedHistory[shipmentId]) {
  await refreshShipmentHistory(shipmentId);
}

    
  } catch (err) {
    setError(err.message || "Could not update shipment status.");
  }
}


  
  async function handleDeleteShipment(shipment) {
    const confirmed = window.confirm(
      `Permanently delete shipment ${shipment.tracking_number} and its status history? This action cannot be undone.`
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      await deleteShipment(token, shipment.id);
      setNotice(
        `Shipment ${shipment.tracking_number} deleted successfully.`
      );
      await loadShipments();
    } catch (err) {
      setError(err.message || "Could not delete shipment.");
    }
  }

  async function handleViewHistory(shipmentId) {
  // Close the history panel if it is already open.
  if (expandedHistory[shipmentId]) {
    setExpandedHistory((previous) => ({
      ...previous,
      [shipmentId]: false,
    }));
    return;
  }

  setExpandedHistory((previous) => ({
    ...previous,
    [shipmentId]: true,
  }));

  // Use cached history if it has already been loaded.
  if (shipmentHistory[shipmentId]) {
    return;
  }

  setHistoryLoading((previous) => ({
    ...previous,
    [shipmentId]: true,
  }));

  setHistoryErrors((previous) => ({
    ...previous,
    [shipmentId]: "",
  }));

  try {
    const result = await getShipmentHistory(token, shipmentId);

    setShipmentHistory((previous) => ({
      ...previous,
      [shipmentId]: Array.isArray(result) ? result : [],
    }));
  } catch (err) {
    setHistoryErrors((previous) => ({
      ...previous,
      [shipmentId]: err.message || "Could not load shipment history.",
    }));
  } finally {
    setHistoryLoading((previous) => ({
      ...previous,
      [shipmentId]: false,
    }));
  }
}

async function refreshShipmentHistory(shipmentId) {
  setHistoryLoading((previous) => ({
    ...previous,
    [shipmentId]: true,
  }));

  setHistoryErrors((previous) => ({
    ...previous,
    [shipmentId]: "",
  }));

  try {
    const result = await getShipmentHistory(token, shipmentId);

    setShipmentHistory((previous) => ({
      ...previous,
      [shipmentId]: Array.isArray(result) ? result : [],
    }));
  } catch (err) {
    setHistoryErrors((previous) => ({
      ...previous,
      [shipmentId]:
        err.message || "Could not load shipment history.",
    }));
  } finally {
    setHistoryLoading((previous) => ({
      ...previous,
      [shipmentId]: false,
    }));
  }
}
async function handleAssignTrip(shipmentId) {
  const tripId = assignmentChanges[shipmentId];

  if (!tripId) {
    setError("Please select a trip first.");
    return;
  }

  setError("");
  setNotice("");

  try {
    await assignShipmentToTrip(
      token,
      shipmentId,
      Number(tripId)
    );

    setNotice("Trip assigned to shipment successfully.");

    setAssignmentChanges((previous) => ({
      ...previous,
      [shipmentId]: "",
    }));

    await loadShipments();
    await loadTrips();

  } catch (err) {
    setError(err.message || "Could not assign trip.");
  }
}

  const filteredShipments = shipments.filter((shipment) => {
    const query = search.toLowerCase();

    return [
      shipment.tracking_number,
      shipment.origin,
      shipment.destination,
      shipment.status,
    ].some((value) => (value || "").toLowerCase().includes(query));
  });

  const inTransitCount = shipments.filter(
    (shipment) => shipment.status === "in_transit"
  ).length;

  const deliveredCount = shipments.filter(
    (shipment) => shipment.status === "delivered"
  ).length;

  const delayedCount = shipments.filter(
    (shipment) => shipment.status === "delayed"
  ).length;

  return (
    <div className="shipments-page">
      {notice && (
        <div className="notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice">
            <X size={15} />
          </button>
        </div>
      )}

      {error && (
        <div className="shipment-error" role="alert">
          {error}
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error">
            <X size={15} />
          </button>
        </div>
      )}

      <div className="shipment-metrics">
        <div className="shipment-metric panel">
          <span className="shipment-metric-icon"><ClipboardList size={19} /></span>
          <span>Total shipments</span>
          <strong>{canManage ? shipments.length : "—"}</strong>
        </div>
        <div className="shipment-metric panel">
          <span className="shipment-metric-icon"><Truck size={19} /></span>
          <span>In transit</span>
          <strong>{canManage ? inTransitCount : "—"}</strong>
        </div>
        <div className="shipment-metric panel">
          <span className="shipment-metric-icon"><PackageCheck size={19} /></span>
          <span>Delivered</span>
          <strong>{canManage ? deliveredCount : "—"}</strong>
        </div>
        <div className="shipment-metric panel">
          <span className="shipment-metric-icon"><Clock size={19} /></span>
          <span>Delayed</span>
          <strong>{canManage ? delayedCount : "—"}</strong>
        </div>
      </div>

      <section className="panel shipment-tracking-panel">
        <div className="panel-heading">
          <div>
            <h2>Track a shipment</h2>
            <p>Enter a tracking number to check the latest shipment status.</p>
          </div>
        </div>

        <form className="shipment-tracking-form" onSubmit={handleTrackShipment}>
          <input
            value={trackingNumber}
            onChange={(event) => setTrackingNumber(event.target.value)}
            placeholder="e.g. FF-TEST-001"
            aria-label="Shipment tracking number"
          />
          <button className="primary-button" type="submit">
            <Search size={16} /> Track
          </button>
        </form>

        {trackingError && (
          <p className="shipment-inline-error">{trackingError}</p>
        )}

        {trackingResult && (
          <div className="tracking-result">
            <div>
              <span className="shipment-muted">Tracking number</span>
              <strong>{trackingResult.tracking_number}</strong>
            </div>
            <div>
              <span className="shipment-muted">Route</span>
              <strong>
                {trackingResult.origin} → {trackingResult.destination}
              </strong>
            </div>
            <div>
              <span className="shipment-muted">Current status</span>
              <strong className={`shipment-status status-${trackingResult.status}`}>
                {formatStatus(trackingResult.status)}
              </strong>
            </div>
            <div>
              <span className="shipment-muted">Estimated delivery</span>
              <strong>{formatDate(trackingResult.estimated_delivery_at)}</strong>
            </div>
          </div>
        )}
      </section>

      {canManage ? (
        <section className="panel shipment-list-panel">
          <div className="panel-heading shipment-list-heading">
            <div>
              <h2>Shipment management</h2>
              <p>Create shipments, review routes, and update shipment status.</p>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => setShowForm((value) => !value)}
            >
              {showForm ? <X size={16} /> : <Plus size={16} />}
              {showForm ? "Close form" : "New shipment"}
            </button>
          </div>

          {showForm && (
            <form className="shipment-create-form" onSubmit={handleCreateShipment}>
              <label>
                Tracking number *
                <input
                  required
                  value={newShipment.tracking_number}
                  onChange={(event) =>
                    setNewShipment({ ...newShipment, tracking_number: event.target.value })
                  }
                  placeholder="e.g. FF-2026-001"
                />
              </label>
              <label>
                Origin *
                <input
                  required
                  value={newShipment.origin}
                  onChange={(event) =>
                    setNewShipment({ ...newShipment, origin: event.target.value })
                  }
                  placeholder="Origin city"
                />
              </label>
              <label>
                Destination *
                <input
                  required
                  value={newShipment.destination}
                  onChange={(event) =>
                    setNewShipment({ ...newShipment, destination: event.target.value })
                  }
                  placeholder="Destination city"
                />
              </label>
              <label className="shipment-description-field">
                Description
                <input
                  value={newShipment.description}
                  onChange={(event) =>
                    setNewShipment({ ...newShipment, description: event.target.value })
                  }
                  placeholder="Optional shipment details"
                />
              </label>

              
  <label className="shipment-trip-field" htmlFor="trip_id">
  Assign to trip
  <select
    id="trip_id"
    value={newShipment.trip_id}
    onChange={(event) =>
      setNewShipment({
        ...newShipment,
        trip_id: event.target.value,
      })
    }
    disabled={tripsLoading}
  >
    <option value="">
      {tripsLoading ? "Loading trips..." : "No trip assigned"}
    </option>

    {assignableTrips.map((trip) => (
      <option key={trip.id} value={trip.id}>
        Trip #{trip.id} — {trip.origin} to {trip.destination} (
        {formatStatus(trip.status)})
      </option>
    ))}
  </select>
  <span className="shipment-field-hint">
    Link this shipment to an existing trip and its assigned driver.
  </span>
</label>
              <button className="primary-button" type="submit">
                <Plus size={16} /> Create shipment
              </button>
            </form>
          )}


          <div className="shipment-toolbar">
            <div className="shipment-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tracking number or route..."
                aria-label="Search shipments"
              />
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={loadShipments}
              disabled={loading}
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>

          {loading ? (
            <p className="shipment-empty">Loading shipments...</p>
          ) : (
            <div className="table-scroll">
              <table className="shipment-table">
                <thead>
                  <tr>
  <th>Tracking number</th>
  <th>Origin</th>
  <th>Destination</th>
  <th>Trip</th>
  <th>Assigned driver</th>
  <th>Vehicle</th>
  <th>ETA</th>
  <th>Status</th>
  <th>Update status</th>
  <th>Actions</th>
</tr>
                </thead>
                
                <tbody>
                  {filteredShipments.map((shipment) => {
                    const assignment = getShipmentAssignment(
                      shipment,
                      trips,
                      drivers,
                      vehicles
                    );

                    const matchingTrips = assignableTrips.filter(
                      (trip) =>
                        trip.origin?.trim().toLowerCase() ===
                          shipment.origin?.trim().toLowerCase() &&
                        trip.destination?.trim().toLowerCase() ===
                          shipment.destination?.trim().toLowerCase()
                    );

                    return (
                      <React.Fragment key={shipment.id}>
                        <tr>
                          <td>
                            <strong>{shipment.tracking_number}</strong>
                          </td>

                          <td>{shipment.origin}</td>

                          <td>{shipment.destination}</td>

                          {/* Trip assignment */}
                          <td>
                            {shipment.trip_id ? (
                              assignment.tripLabel
                            ) : !["delivered", "cancelled"].includes(shipment.status) ? (
                              <div className="shipment-assignment-actions">
                                <select
                                  value={assignmentChanges[shipment.id] || ""}
                                  onChange={(event) =>
                                    setAssignmentChanges((previous) => ({
                                      ...previous,
                                      [shipment.id]: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Select trip</option>

                                  {matchingTrips.map((trip) => (
                                    <option key={trip.id} value={trip.id}>
                                      Trip #{trip.id}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  className="secondary-button"
                                  type="button"
                                  disabled={!assignmentChanges[shipment.id]}
                                  onClick={() => handleAssignTrip(shipment.id)}
                                >
                                  Assign
                                </button>
                              </div>
                            ) : (
                              "Not assigned"
                            )}
                          </td>

                          <td>{assignment.driverName}</td>

                          <td>{assignment.vehicleNumber}</td>

                          <td>
                            {assignment.estimatedArrivalAt
                              ? formatDate(assignment.estimatedArrivalAt)
                              : "Not available"}
                          </td>

                          {/* Shipment status */}
                          <td>
                            <span
                              className={`shipment-status status-${shipment.status}`}
                            >
                              {formatStatus(shipment.status)}
                            </span>
                          </td>

                          {/* Status update */}
                          <td>
                            {!["delivered", "cancelled"].includes(shipment.status) ? (
                              <div className="shipment-status-actions">
                                <select
                                  value={statusChanges[shipment.id] || ""}
                                  onChange={(event) =>
                                    setStatusChanges((previous) => ({
                                      ...previous,
                                      [shipment.id]: event.target.value,
                                    }))
                                  }
                                  aria-label={`New status for ${shipment.tracking_number}`}
                                >
                                  <option value="">Choose status</option>

                                  {(ALLOWED_STATUS_TRANSITIONS[shipment.status] || []).map(
                                    (status) => (
                                      <option key={status} value={status}>
                                        {formatStatus(status)}
                                      </option>
                                    )
                                  )}
                                </select>

                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() => handleStatusUpdate(shipment.id)}
                                >
                                  Save
                                </button>
                              </div>
                            ) : (
                              <span className="shipment-muted">Final status</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => handleViewHistory(shipment.id)}
                            >
                              {expandedHistory[shipment.id]
                                ? "Hide history"
                                : "View history"}
                            </button>

                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => handleDeleteShipment(shipment)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>

                        {/* Shipment history */}
                        {expandedHistory[shipment.id] && (
                          <tr>
                            <td colSpan={10}>
                              <div className="shipment-history">
                                <h3>
                                  Status history — {shipment.tracking_number}
                                </h3>

                                {historyLoading[shipment.id] ? (
                                  <p>Loading shipment history...</p>
                                ) : historyErrors[shipment.id] ? (
                                  <p role="alert">
                                    {historyErrors[shipment.id]}
                                  </p>
                                ) : !shipmentHistory[shipment.id]?.length ? (
                                  <p>
                                    No status history is available for this shipment.
                                  </p>
                                ) : (
                                  <ol className="shipment-history-list">
                                    {shipmentHistory[shipment.id].map((entry) => (
                                      <li key={entry.id}>
                                        <strong>{formatStatus(entry.status)}</strong>
                                        <p>{formatDate(entry.recorded_at)}</p>
                                        {entry.notes && <p>{entry.notes}</p>}
                                      </li>
                                    ))}
                                  </ol>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {filteredShipments.length === 0 && (
                    <tr>
                      <td colSpan={10} className="shipment-empty">
                        {shipments.length
                          ? "No shipments match your search."
                          : "No shipments found yet. Create your first shipment."}
                      </td>
                    </tr>
                  )}
                </tbody>

              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="panel shipment-list-panel">
          <div className="panel-heading">
            <div>
              <h2>Shipment access</h2>
              <p>Use the tracking form above to check a shipment using its tracking number.</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
