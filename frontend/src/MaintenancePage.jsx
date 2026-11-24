import { useEffect, useState } from "react";

const CATEGORIES = [
  "Engine Servicing",
  "Oil Change",
  "Tyre Replacement",
  "Brake Inspection",
  "General Servicing",
  "Unexpected Repairs",
];

const EMPTY_FORM = {
  vehicle_id: "",
  category: CATEGORIES[0],
  description: "",
  scheduled_date: "",
  service_centre: "",
  estimated_cost: "",
};

const NEXT_ACTIONS = {
  Scheduled: [
    ["In Progress", "Start Work"],
    ["Cancelled", "Cancel"],
  ],
  "In Progress": [
    ["Completed", "Complete"],
    ["Cancelled", "Cancel"],
  ],
};

function todayString() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function badgeClass(status) {
  return `badge badge-${String(status).toLowerCase().replace(/\s+/g, "-")}`;
}

function money(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MaintenancePage({ apiRequest, vehicles, loadVehicles }) {
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [statusFilter, setStatusFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [completing, setCompleting] = useState(null);
  const [completeForm, setCompleteForm] = useState({
    completed_date: "",
    replacement_parts: "",
    actual_cost: "",
  });
  const [historyVehicleId, setHistoryVehicleId] = useState("");
  const [history, setHistory] = useState(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    try {
      const path =
        statusFilter === "All"
          ? "/maintenance"
          : `/maintenance?status_filter=${encodeURIComponent(statusFilter)}`;

      const [summaryData, recordData] = await Promise.all([
        apiRequest("/maintenance/summary"),
        apiRequest(path),
      ]);

      setSummary(summaryData);
      setRecords(Array.isArray(recordData) ? recordData : []);
    } catch (error) {
      setNotice(error.message);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function scheduleMaintenance(event) {
    event.preventDefault();
    setNotice("");

    if (!form.vehicle_id) {
      setNotice("Please select a vehicle.");
      return;
    }
    if (form.description.trim().length < 3) {
      setNotice("Description must have at least 3 characters.");
      return;
    }
    if (form.service_centre.trim().length < 2) {
      setNotice("Please enter the service centre name.");
      return;
    }

    setSaving(true);

    try {
      const result = await apiRequest("/maintenance", {
        method: "POST",
        body: JSON.stringify({
          vehicle_id: Number(form.vehicle_id),
          category: form.category,
          description: form.description.trim(),
          scheduled_date: form.scheduled_date,
          service_centre: form.service_centre.trim(),
          estimated_cost: Number(form.estimated_cost),
        }),
      });

      setNotice(result.message || "Maintenance scheduled successfully.");
      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      await loadAll();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(record, newStatus, extra = {}) {
    setNotice("");

    try {
      const result = await apiRequest(`/maintenance/${record.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus, ...extra }),
      });

      setNotice(
        `${result.message} Vehicle status: ${result.vehicle_status}.`,
      );
      setCompleting(null);
      await loadAll();
      await loadVehicles();

      if (historyVehicleId) {
        await loadHistory(historyVehicleId);
      }
    } catch (error) {
      setNotice(error.message);
    }
  }

  function handleAction(record, newStatus) {
    if (newStatus === "Completed") {
      setCompleting(record);
      setCompleteForm({
        completed_date: todayString(),
        replacement_parts: "",
        actual_cost: String(record.estimated_cost ?? ""),
      });
      return;
    }

    if (
      newStatus === "Cancelled" &&
      !window.confirm("Cancel this maintenance job?")
    ) {
      return;
    }

    changeStatus(record, newStatus);
  }

  function submitCompletion(event) {
    event.preventDefault();

    changeStatus(completing, "Completed", {
      completed_date: completeForm.completed_date || null,
      replacement_parts: completeForm.replacement_parts.trim() || null,
      actual_cost:
        completeForm.actual_cost === "" ? null : Number(completeForm.actual_cost),
    });
  }

  async function loadHistory(vehicleId) {
    if (!vehicleId) {
      setHistory(null);
      return;
    }

    try {
      const data = await apiRequest(`/vehicles/${vehicleId}/maintenance-history`);
      setHistory(data);
    } catch (error) {
      setNotice(error.message);
    }
  }

  return (
    <>
      {notice && <div className="message">{notice}</div>}

      <section className="stats-grid">
        <article className="stat-card">
          <span className="stat-icon">🚚</span>
          <h3>Total Vehicles</h3>
          <strong>{summary?.total_vehicles ?? "-"}</strong>
          <p>Registered vehicles</p>
        </article>

        <article className="stat-card">
          <span className="stat-icon">🔧</span>
          <h3>Under Maintenance</h3>
          <strong>{summary?.under_maintenance ?? "-"}</strong>
          <p>Currently in service</p>
        </article>

        <article className="stat-card">
          <span className="stat-icon">📅</span>
          <h3>Upcoming</h3>
          <strong>{summary?.upcoming_maintenance ?? "-"}</strong>
          <p>Scheduled jobs</p>
        </article>

        <article className="stat-card">
          <span className="stat-icon">⚠️</span>
          <h3>Overdue</h3>
          <strong>{summary?.overdue_maintenance ?? "-"}</strong>
          <p>Past their due date</p>
        </article>
      </section>

      <section className="content-section">
        <div className="page-header">
          <div>
            <h2>Maintenance Schedule</h2>
            <p>Schedule servicing and update its progress.</p>
          </div>

          <button type="button" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Close Form" : "+ Schedule Maintenance"}
          </button>
        </div>

        {showForm && (
          <form className="vehicle-form" onSubmit={scheduleMaintenance}>
            <h3>Schedule Maintenance</h3>

            <label>
              Vehicle
              <select
                value={form.vehicle_id}
                onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
                required
              >
                <option value="">Select vehicle</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.vehicle_number} ({vehicle.vehicle_type})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Maintenance Category
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Scheduled Date
              <input
                type="date"
                min={todayString()}
                value={form.scheduled_date}
                onChange={(e) =>
                  setForm({ ...form, scheduled_date: e.target.value })
                }
                required
              />
            </label>

            <label>
              Service Centre
              <input
                type="text"
                value={form.service_centre}
                onChange={(e) =>
                  setForm({ ...form, service_centre: e.target.value })
                }
                required
              />
            </label>

            <label>
              Estimated Cost
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.estimated_cost}
                onChange={(e) =>
                  setForm({ ...form, estimated_cost: e.target.value })
                }
                required
              />
            </label>

            <label>
              Description
              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                required
              />
            </label>

            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Maintenance"}
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

        {completing && (
          <form className="vehicle-form" onSubmit={submitCompletion}>
            <h3>
              Complete Maintenance - {completing.vehicle_number} (
              {completing.category})
            </h3>

            <label>
              Completed Date
              <input
                type="date"
                max={todayString()}
                value={completeForm.completed_date}
                onChange={(e) =>
                  setCompleteForm({
                    ...completeForm,
                    completed_date: e.target.value,
                  })
                }
                required
              />
            </label>

            <label>
              Actual Cost
              <input
                type="number"
                min="0"
                step="0.01"
                value={completeForm.actual_cost}
                onChange={(e) =>
                  setCompleteForm({ ...completeForm, actual_cost: e.target.value })
                }
                required
              />
            </label>

            <label>
              Replacement Parts (optional)
              <input
                type="text"
                value={completeForm.replacement_parts}
                onChange={(e) =>
                  setCompleteForm({
                    ...completeForm,
                    replacement_parts: e.target.value,
                  })
                }
              />
            </label>

            <div className="form-actions">
              <button type="submit">Mark as Completed</button>
              <button type="button" onClick={() => setCompleting(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="table-controls">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Scheduled">Scheduled</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <button type="button" onClick={loadAll}>
            Refresh
          </button>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Maintenance Type</th>
                <th>Service Centre</th>
                <th>Scheduled Date</th>
                <th>Estimated Cost</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{record.vehicle_number}</td>
                  <td>{record.category}</td>
                  <td>{record.service_centre}</td>
                  <td>{record.scheduled_date}</td>
                  <td>₹{money(record.estimated_cost)}</td>
                  <td>
                    <span className={badgeClass(record.status)}>
                      {record.status}
                    </span>
                  </td>
                  <td>
                    <div className="form-actions">
                      {(NEXT_ACTIONS[record.status] || []).map(
                        ([nextStatus, label]) => (
                          <button
                            key={nextStatus}
                            type="button"
                            className={nextStatus === "Cancelled" ? "btn-grey" : ""}
                            onClick={() => handleAction(record, nextStatus)}
                          >
                            {label}
                          </button>
                        ),
                      )}
                      {!NEXT_ACTIONS[record.status] && <span>-</span>}
                    </div>
                  </td>
                </tr>
              ))}

              {records.length === 0 && (
                <tr>
                  <td colSpan="7">No maintenance records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-section">
        <div className="page-header">
          <div>
            <h2>Registered Vehicles</h2>
            <p>Vehicles under maintenance cannot be assigned to new trips.</p>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Registration</th>
                <th>Vehicle Type</th>
                <th>Availability</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td>{vehicle.vehicle_number}</td>
                  <td>{vehicle.vehicle_type}</td>
                  <td>
                    <span className={badgeClass(vehicle.status)}>
                      {vehicle.status}
                    </span>
                  </td>
                </tr>
              ))}

              {vehicles.length === 0 && (
                <tr>
                  <td colSpan="3">No vehicles found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-section">
        <div className="page-header">
          <div>
            <h2>Vehicle Service History</h2>
            <p>Completed maintenance for one vehicle.</p>
          </div>
        </div>

        <div className="table-controls">
          <select
            value={historyVehicleId}
            onChange={(e) => {
              setHistoryVehicleId(e.target.value);
              loadHistory(e.target.value);
            }}
          >
            <option value="">Select vehicle</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.vehicle_number}
              </option>
            ))}
          </select>
        </div>

        {history && (
          <>
            <p className="hint">
              {history.vehicle_number}: {history.total_services} completed
              service(s), total cost ₹{money(history.total_cost)}
            </p>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Service Date</th>
                    <th>Type</th>
                    <th>Repair Description</th>
                    <th>Replacement Parts</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {history.history.map((item) => (
                    <tr key={item.id}>
                      <td>{item.completed_date}</td>
                      <td>{item.category}</td>
                      <td>{item.description}</td>
                      <td>{item.replacement_parts || "-"}</td>
                      <td>₹{money(item.actual_cost)}</td>
                    </tr>
                  ))}

                  {history.history.length === 0 && (
                    <tr>
                      <td colSpan="5">No completed services yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}

export default MaintenancePage;