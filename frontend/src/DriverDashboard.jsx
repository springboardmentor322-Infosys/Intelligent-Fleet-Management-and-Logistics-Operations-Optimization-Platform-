import { useEffect, useMemo, useState } from "react";
import "./DriverDashboard.css";

const API_URL = "http://127.0.0.1:8010";
const DRIVER_STATUSES = [
  "Available",
  "On Route",
  "At Stop",
  "Delayed",
  "Off Duty",
];

function display(value) {
  return value === null || value === undefined || value === ""
    ? "Not available"
    : value;
}

export default function DriverDashboard() {
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    license_number: "",
    status: "Available",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const token = () => localStorage.getItem("access_token");

  async function api(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        data.detail || data.message || `Request failed (${response.status})`,
      );
    return data;
  }

  async function loadData() {
    setLoading(true);
    setMessage("");
    try {
      const results = await Promise.allSettled([
        api("/drivers"),
        api("/vehicles"),
        api("/trips"),
        api("/shipments"),
      ]);
      if (results[0].status === "rejected") throw results[0].reason;
      setDrivers(Array.isArray(results[0].value) ? results[0].value : []);
      setVehicles(
        results[1].status === "fulfilled" && Array.isArray(results[1].value)
          ? results[1].value
          : [],
      );
      setTrips(
        results[2].status === "fulfilled" && Array.isArray(results[2].value)
          ? results[2].value
          : [],
      );
      setShipments(
        results[3].status === "fulfilled" && Array.isArray(results[3].value)
          ? results[3].value
          : [],
      );
      const failures = results
        .slice(1)
        .filter((item) => item.status === "rejected").length;
      if (failures)
        setMessage(
          "Driver data loaded. Some vehicle, trip, or shipment details could not be loaded.",
        );
    } catch (error) {
      setMessage(error.message || "Could not load driver information.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function vehicleFor(driver) {
    return (
      vehicles.find(
        (vehicle) => Number(vehicle.driver_id) === Number(driver.id),
      ) || null
    );
  }

  function tripsFor(driver) {
    return trips.filter((trip) => Number(trip.driver_id) === Number(driver.id));
  }

  function currentTripFor(driver) {
    return (
      tripsFor(driver).find((trip) =>
        ["In Transit", "In Progress", "Scheduled"].includes(trip.status),
      ) || null
    );
  }

  function normalizedStatus(driver) {
    const status = String(driver.status || "Available").toLowerCase();
    if (status === "at stop" || status === "at-stop") return "At Stop";
    if (status === "delayed") return "Delayed";
    if (status === "off duty" || status === "off-duty") return "Off Duty";
    if (
      currentTripFor(driver)?.status === "In Transit" ||
      currentTripFor(driver)?.status === "In Progress"
    )
      return "On Route";
    return "Available";
  }

  const rows = useMemo(
    () =>
      drivers.map((driver) => {
        const vehicle = vehicles.find(
          (item) => Number(item.driver_id) === Number(driver.id),
        );
        const trip = trips.find(
          (item) =>
            Number(item.driver_id) === Number(driver.id) &&
            ["In Transit", "In Progress", "Scheduled"].includes(item.status),
        );
        const status = normalizedStatus(driver);
        const location =
          vehicle?.latitude != null && vehicle?.longitude != null
            ? `${Number(vehicle.latitude).toFixed(4)}, ${Number(vehicle.longitude).toFixed(4)}`
            : "Location not reported";
        return {
          ...driver,
          vehicle,
          trip,
          status,
          location,
          speed: "—",
          nextStop: "Not recorded",
          eta: trip?.eta || "Not available",
        };
      }),
    [drivers, vehicles, trips],
  );

  const filteredRows = rows.filter((driver) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      [
        driver.full_name,
        driver.phone,
        driver.license_number,
        driver.vehicle?.vehicle_number,
        driver.trip?.trip_number,
        driver.trip?.start_location,
        driver.trip?.destination,
        driver.location,
        driver.status,
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(q),
      );
    return (
      matchesSearch &&
      (statusFilter === "All statuses" || driver.status === statusFilter)
    );
  });

  const counts = {
    total: drivers.length,
    route: rows.filter((driver) => driver.status === "On Route").length,
    stop: rows.filter((driver) => driver.status === "At Stop").length,
    delayed: rows.filter((driver) => driver.status === "Delayed").length,
    off: rows.filter((driver) => driver.status === "Off Duty").length,
  };

  function openProfile(driver) {
    setSelectedDriver(driver);
    setForm({
      full_name: driver.full_name || "",
      phone: driver.phone || "",
      license_number: driver.license_number || "",
      status: driver.status || "Available",
    });
    setEditing(false);
    setMessage("");
  }

  async function saveDriver(event) {
    event.preventDefault();
    if (!selectedDriver) return;
    try {
      await api(`/drivers/${selectedDriver.id}`, {
        method: "PUT",
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          license_number: form.license_number.trim(),
        }),
      });
      if (form.status !== selectedDriver.status) {
        await api(`/drivers/${selectedDriver.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: form.status }),
        });
      }
      setMessage("Driver profile updated successfully.");
      setEditing(false);
      await loadData();
      const refreshed = await api("/drivers");
      const updated = refreshed.find((item) => item.id === selectedDriver.id);
      if (updated) setSelectedDriver(updated);
    } catch (error) {
      setMessage(error.message || "Could not update driver.");
    }
  }

  async function assignVehicle(event) {
    const vehicleId = event.target.value;

    if (!selectedDriver || !vehicleId) return;

    const vehicle = vehicles.find(
      (item) => String(item.id) === String(vehicleId),
    );

    if (!vehicle) return;

    // Don't assign a vehicle already assigned to another driver
    if (
      vehicle.driver_id &&
      Number(vehicle.driver_id) !== Number(selectedDriver.id)
    ) {
      setMessage("This vehicle is already assigned to another driver.");
      return;
    }

    try {
      // Find the driver's previously assigned vehicle
      const previousVehicle = vehicles.find(
        (item) =>
          Number(item.driver_id) === Number(selectedDriver.id) &&
          Number(item.id) !== Number(vehicle.id),
      );

      // Remove the old assignment
      if (previousVehicle) {
        await api(`/vehicles/${previousVehicle.id}`, {
          method: "PUT",
          body: JSON.stringify({
            vehicle_number: previousVehicle.vehicle_number,
            vehicle_type: previousVehicle.vehicle_type,
            status: previousVehicle.status,
            driver_id: null,
          }),
        });
      }

      // Assign the new vehicle
      await api(`/vehicles/${vehicle.id}`, {
        method: "PUT",
        body: JSON.stringify({
          vehicle_number: vehicle.vehicle_number,
          vehicle_type: vehicle.vehicle_type,
          status: vehicle.status,
          driver_id: selectedDriver.id,
        }),
      });

      setMessage("Vehicle assigned successfully.");
      await loadData();
    } catch (error) {
      setMessage(error.message || "Could not assign vehicle.");
    }
  }

  const profileTrips = selectedDriver ? tripsFor(selectedDriver) : [];
  const profileShipments = selectedDriver
    ? shipments.filter(
        (shipment) => Number(shipment.driver_id) === Number(selectedDriver.id),
      )
    : [];
  const completedTrips = profileTrips.filter(
    (trip) => trip.status === "Completed",
  ).length;
  const deliveredShipments = profileShipments.filter(
    (shipment) => shipment.status === "Delivered",
  ).length;

  return (
    <section className="driver-dashboard">
      <div className="driver-page-heading">
        <div>
          <p className="driver-eyebrow">FLEET OPERATIONS</p>
          <h1>Driver Dashboard</h1>
          <p>Monitor driver assignments, trips, and available location data.</p>
        </div>
        <button type="button" onClick={loadData}>
          ↻ Refresh
        </button>
      </div>

      {message && (
        <div className="driver-message" role="status">
          {message}
        </div>
      )}

      <div className="driver-stat-grid">
        <article className="driver-stat">
          <span>Total drivers</span>
          <strong>{counts.total}</strong>
          <small>Registered in the system</small>
        </article>
        <article className="driver-stat">
          <span>On route</span>
          <strong>{counts.route}</strong>
          <small>Based on current trip status</small>
        </article>
        <article className="driver-stat">
          <span>At stop</span>
          <strong>{counts.stop}</strong>
          <small>Driver status recorded</small>
        </article>
        <article className="driver-stat">
          <span>Delayed</span>
          <strong>{counts.delayed}</strong>
          <small>Only explicitly marked delays</small>
        </article>
        <article className="driver-stat">
          <span>Off duty</span>
          <strong>{counts.off}</strong>
          <small>Driver status recorded</small>
        </article>
      </div>

      <div className="driver-panel">
        <div className="driver-table-heading">
          <div>
            <h2>All drivers</h2>
            <p>Choose a driver to open their profile.</p>
          </div>
          <span>{filteredRows.length} shown</span>
        </div>
        <div className="driver-filters">
          <input
            aria-label="Search drivers"
            placeholder="Search name, vehicle, trip, location…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option>All statuses</option>
            {DRIVER_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </div>
        {loading ? (
          <p className="driver-empty">Loading driver data…</p>
        ) : (
          <div className="driver-table-wrap">
            <table className="driver-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Current trip</th>
                  <th>Location</th>
                  <th>Speed</th>
                  <th>Status</th>
                  <th>Next stop</th>
                  <th>ETA</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((driver) => (
                  <tr key={driver.id}>
                    <td>
                      <strong>{driver.full_name}</strong>
                      <small>Driver #{driver.id}</small>
                    </td>
                    <td>{driver.vehicle?.vehicle_number || "Unassigned"}</td>
                    <td>
                      {driver.trip?.trip_number || "No active trip"}
                      <small>
                        {driver.trip
                          ? `${driver.trip.start_location} → ${driver.trip.destination}`
                          : ""}
                      </small>
                    </td>
                    <td>{driver.location}</td>
                    <td>{driver.speed}</td>
                    <td>
                      <span
                        className={`driver-status status-${driver.status.toLowerCase().replaceAll(" ", "-")}`}
                      >
                        {driver.status}
                      </span>
                    </td>
                    <td>{driver.nextStop}</td>
                    <td>{driver.eta}</td>
                    <td>
                      <button
                        className="driver-secondary-button"
                        type="button"
                        onClick={() => openProfile(driver)}
                      >
                        View profile
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan="9" className="driver-empty">
                      No matching drivers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="driver-data-note">
        Location, speed, next-stop and ETA values are shown only when the
        backend provides them. Speed and next stop are not currently stored by
        this project. Coordinates may be simulated; this page does not claim to
        be real-time GPS unless a location source sends updates.
      </p>

      {selectedDriver && (
        <div
          className="driver-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedDriver(null);
          }}
        >
          <section
            className="driver-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="driver-profile-title"
          >
            <div className="driver-profile-header">
              <div>
                <p className="driver-eyebrow">DRIVER PROFILE</p>
                <h2 id="driver-profile-title">{selectedDriver.full_name}</h2>
                <p>Driver ID: {selectedDriver.id}</p>
              </div>
              <button
                className="driver-close-button"
                type="button"
                onClick={() => setSelectedDriver(null)}
                aria-label="Close profile"
              >
                ×
              </button>
            </div>
            {message && <div className="driver-message">{message}</div>}
            {editing ? (
              <form className="driver-edit-form" onSubmit={saveDriver}>
                <label>
                  Full name
                  <input
                    required
                    minLength="2"
                    value={form.full_name}
                    onChange={(e) =>
                      setForm({ ...form, full_name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Phone
                  <input
                    required
                    minLength="10"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                  />
                </label>
                <label>
                  License number
                  <input
                    required
                    minLength="3"
                    value={form.license_number}
                    onChange={(e) =>
                      setForm({ ...form, license_number: e.target.value })
                    }
                  />
                </label>
                <label>
                  Driver status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value })
                    }
                  >
                    {DRIVER_STATUSES.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <div className="driver-profile-actions">
                  <button type="submit">Save changes</button>
                  <button
                    type="button"
                    className="driver-secondary-button"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="driver-profile-grid">
                  <div>
                    <span>Phone</span>
                    <strong>{display(selectedDriver.phone)}</strong>
                  </div>
                  <div>
                    <span>License number</span>
                    <strong>{display(selectedDriver.license_number)}</strong>
                  </div>
                  <div>
                    <span>Email</span>
                    <strong>Not stored on driver record</strong>
                  </div>
                  <div>
                    <span>License expiry</span>
                    <strong>Not stored</strong>
                  </div>
                  <div>
                    <span>Assigned vehicle</span>
                    <strong>
                      {vehicleFor(selectedDriver)?.vehicle_number ||
                        "Unassigned"}
                    </strong>
                  </div>
                  <div>
                    <span>Driver status</span>
                    <strong>{normalizedStatus(selectedDriver)}</strong>
                  </div>
                  <div>
                    <span>Completed trips</span>
                    <strong>{completedTrips}</strong>
                  </div>
                  <div>
                    <span>Delivered shipments</span>
                    <strong>{deliveredShipments}</strong>
                  </div>
                  <div>
                    <span>On-time rate</span>
                    <strong>
                      Not calculated (arrival history unavailable)
                    </strong>
                  </div>
                  <div>
                    <span>Current location</span>
                    <strong>
                      {vehicleFor(selectedDriver)?.latitude != null
                        ? `${vehicleFor(selectedDriver).latitude}, ${vehicleFor(selectedDriver).longitude}`
                        : "No location reported"}
                    </strong>
                  </div>
                </div>
                <div className="driver-profile-section">
                  <h3>Assign vehicle</h3>
                  <select
                    aria-label="Assign vehicle"
                    value=""
                    onChange={assignVehicle}
                  >
                    <option value="">Choose a vehicle…</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.vehicle_number} — {vehicle.vehicle_type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="driver-profile-section">
                  <h3>Trip history</h3>
                  {profileTrips.length ? (
                    <div className="driver-history-list">
                      {profileTrips.map((trip) => (
                        <div key={trip.id}>
                          <strong>{trip.trip_number}</strong>
                          <span>
                            {trip.start_location} → {trip.destination}
                          </span>
                          <small>
                            {trip.status} · ETA: {trip.eta || "Not available"}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No trips recorded for this driver.</p>
                  )}
                </div>
                <div className="driver-profile-section">
                  <h3>Assigned shipments</h3>
                  {profileShipments.length ? (
                    <div className="driver-history-list">
                      {profileShipments.map((shipment) => (
                        <div key={shipment.id}>
                          <strong>{shipment.shipment_number}</strong>
                          <span>
                            {shipment.pickup_location} →{" "}
                            {shipment.delivery_location}
                          </span>
                          <small>{shipment.status}</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No shipments directly assigned to this driver.</p>
                  )}
                </div>
                <div className="driver-profile-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setForm({
                        full_name: selectedDriver.full_name || "",
                        phone: selectedDriver.phone || "",
                        license_number: selectedDriver.license_number || "",
                        status: selectedDriver.status || "Available",
                      });
                      setEditing(true);
                    }}
                  >
                    Edit profile
                  </button>
                  <a
                    href={`tel:${selectedDriver.phone}`}
                    className="driver-call-link"
                  >
                    Contact driver
                  </a>
                  <button
                    type="button"
                    className="driver-secondary-button"
                    onClick={() => setSelectedDriver(null)}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
