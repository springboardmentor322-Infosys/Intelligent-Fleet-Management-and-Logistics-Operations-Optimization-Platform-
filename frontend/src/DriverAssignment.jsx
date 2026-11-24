import { useEffect, useState } from "react";

const EMPTY_FORM = { driver_id: "", vehicle_id: "", trip_id: "" };

function badgeClass(status) {
  return `badge badge-${String(status).toLowerCase().replace(/\s+/g, "-")}`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function DriverAssignment({
  apiRequest,
  drivers,
  vehicles,
  loadDrivers,
  loadVehicles,
  loadTrips,
}) {
  const [options, setOptions] = useState({
    drivers: [],
    vehicles: [],
    trips: [],
  });
  const [assignments, setAssignments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    try {
      const [optionData, assignmentData] = await Promise.all([
        apiRequest("/driver-assignments/options"),
        apiRequest("/driver-assignments"),
      ]);

      setOptions(optionData);
      setAssignments(Array.isArray(assignmentData) ? assignmentData : []);
    } catch (error) {
      setNotice(error.message);
    }
  }

  useEffect(() => {
    loadDrivers();
    loadVehicles();
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshEverything() {
    await loadAll();
    await loadDrivers();
    await loadVehicles();
    await loadTrips();
  }

  async function assignDriver(event) {
    event.preventDefault();
    setNotice("");

    if (!form.driver_id || !form.vehicle_id || !form.trip_id) {
      setNotice("Please select a driver, a vehicle and a trip.");
      return;
    }

    setSaving(true);

    try {
      const result = await apiRequest("/driver-assignments", {
        method: "POST",
        body: JSON.stringify({
          driver_id: Number(form.driver_id),
          vehicle_id: Number(form.vehicle_id),
          trip_id: Number(form.trip_id),
        }),
      });

      setNotice(result.message || "Driver assigned successfully.");
      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      await refreshEverything();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function completeAssignment(assignment) {
    if (!window.confirm("Complete this assignment and free the driver and vehicle?")) {
      return;
    }

    try {
      const result = await apiRequest(
        `/driver-assignments/${assignment.id}/complete`,
        { method: "PUT" },
      );

      setNotice(result.message || "Assignment completed.");
      await refreshEverything();
    } catch (error) {
      setNotice(error.message);
    }
  }

  const activeByDriver = {};
  assignments
    .filter((item) => item.status === "Active")
    .forEach((item) => {
      activeByDriver[item.driver_id] = item;
    });

  return (
    <>
      {notice && <div className="message">{notice}</div>}

      <section className="content-section">
        <div className="page-header">
          <div>
            <h2>Driver Assignment</h2>
            <p>Assign available drivers and vehicles to scheduled trips.</p>
          </div>

          <button type="button" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Close Form" : "+ Assign Driver"}
          </button>
        </div>

        {showForm && (
          <form className="vehicle-form" onSubmit={assignDriver}>
            <h3>Assign Driver</h3>

            <label>
              Available Driver
              <select
                value={form.driver_id}
                onChange={(e) => setForm({ ...form, driver_id: e.target.value })}
                required
              >
                <option value="">Select driver</option>
                {options.drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.full_name} ({driver.license_number})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Available Vehicle
              <select
                value={form.vehicle_id}
                onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
                required
              >
                <option value="">Select vehicle</option>
                {options.vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.vehicle_number} ({vehicle.vehicle_type})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Scheduled Trip
              <select
                value={form.trip_id}
                onChange={(e) => setForm({ ...form, trip_id: e.target.value })}
                required
              >
                <option value="">Select trip</option>
                {options.trips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.trip_number}: {trip.start_location} to {trip.destination}
                  </option>
                ))}
              </select>
            </label>

            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? "Assigning..." : "Confirm Assignment"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm({ ...EMPTY_FORM });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <p className="hint">
          Vehicles that are assigned, inactive or under maintenance are not
          shown in the form.
        </p>
      </section>

      <section className="content-section">
        <div className="page-header">
          <div>
            <h2>Drivers</h2>
            <p>Availability, assigned vehicle and current trip.</p>
          </div>

          <button type="button" onClick={refreshEverything}>
            Refresh
          </button>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Driver</th>
                <th>Phone</th>
                <th>License</th>
                <th>Status</th>
                <th>Assigned Vehicle</th>
                <th>Current Trip</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => {
                const active = activeByDriver[driver.id];

                return (
                  <tr key={driver.id}>
                    <td>{driver.full_name}</td>
                    <td>{driver.phone}</td>
                    <td>{driver.license_number}</td>
                    <td>
                      <span className={badgeClass(driver.status || "Available")}>
                        {driver.status || "Available"}
                      </span>
                    </td>
                    <td>{active ? active.vehicle_number : "-"}</td>
                    <td>
                      {active ? `${active.trip_number} (${active.route})` : "-"}
                    </td>
                  </tr>
                );
              })}

              {drivers.length === 0 && (
                <tr>
                  <td colSpan="6">No drivers found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-section">
        <div className="page-header">
          <div>
            <h2>Assignment History</h2>
            <p>All driver, vehicle and trip assignments.</p>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Driver</th>
                <th>Vehicle</th>
                <th>Trip</th>
                <th>Route</th>
                <th>Assigned On</th>
                <th>Trip Status</th>
                <th>Assignment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((item) => (
                <tr key={item.id}>
                  <td>{item.driver_name}</td>
                  <td>{item.vehicle_number}</td>
                  <td>{item.trip_number}</td>
                  <td>{item.route}</td>
                  <td>{formatDate(item.assignment_date)}</td>
                  <td>
                    <span className={badgeClass(item.trip_status)}>
                      {item.trip_status}
                    </span>
                  </td>
                  <td>
                    <span className={badgeClass(item.status)}>{item.status}</span>
                  </td>
                  <td>
                    {item.status === "Active" ? (
                      <button type="button" onClick={() => completeAssignment(item)}>
                        Complete
                      </button>
                    ) : (
                      formatDate(item.completed_at)
                    )}
                  </td>
                </tr>
              ))}

              {assignments.length === 0 && (
                <tr>
                  <td colSpan="8">No assignments yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default DriverAssignment;