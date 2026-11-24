import { useState, useEffect, useCallback } from "react";
import {
  getMaintenanceRecords,
  getMaintenanceSummary,
  createMaintenance,
  updateMaintenance,
  getVehicleMaintenanceHistory,
  getVehicles,
} from "../api";
import {
  Wrench,
  Truck,
  CalendarDays,
  AlertTriangle,
  Plus,
  History,
  RefreshCw,
  X,
  CheckCircle2,
} from "lucide-react";
import "./Maintenance.css";

const initialForm = {
  vehicle_id: "",
  maintenance_type: "general servicing",
  description: "",
  scheduled_date: "",
  service_center: "",
  estimated_cost: "",
};

const categories = [
  ["engine servicing", "Engine Servicing"],
  ["oil change", "Oil Change"],
  ["tyre replacement", "Tyre Replacement"],
  ["brake inspection", "Brake Inspection"],
  ["general servicing", "General Servicing"],
  ["unexpected repairs", "Unexpected Repairs"],
];

function Maintenance({ token }) {
  const [records, setRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);

  const [historyVehicle, setHistoryVehicle] = useState("");
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [completionRecord, setCompletionRecord] = useState(null);
  const [actualServiceDate, setActualServiceDate] = useState("");
  const [vehicleOperational, setVehicleOperational] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [maintenanceData, summaryData, vehicleData] =
        await Promise.all([
          getMaintenanceRecords(token),
          getMaintenanceSummary(token),
          getVehicles(token),
        ]);

      setRecords(
        Array.isArray(maintenanceData)
          ? maintenanceData
          : maintenanceData?.items || maintenanceData?.records || []
      );

      setSummary(summaryData || {});

      setVehicles(
        Array.isArray(vehicleData)
          ? vehicleData
          : vehicleData?.items || vehicleData?.vehicles || []
      );
    } catch (err) {
      setError(err.message || "Unable to load maintenance information.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const timeoutId = window.setTimeout(() => {
      loadData();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [token, loadData]);

  const handleSchedule = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const payload = {
        vehicle_id: Number(form.vehicle_id),
        maintenance_type: form.maintenance_type,
        description: form.description,
        scheduled_date: form.scheduled_date,
        service_center: form.service_center,
        estimated_cost: Number(form.estimated_cost),
      };

      await createMaintenance(token, payload);

      setNotice("Maintenance scheduled successfully.");
      setForm(initialForm);
      setShowForm(false);
      await loadData();
    } catch (err) {
      setError(err.message || "Unable to schedule maintenance.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (record, status) => {
    setError("");
    setNotice("");

    if (status === "completed") {
      setActualServiceDate(
        new Date().toISOString().split("T")[0]
      );
      setVehicleOperational(true);
      setCompletionRecord(record);
      return;
    }

    try {
      await updateMaintenance(token, record.id, { status });
      setNotice("Maintenance status updated.");
      await loadData();
    } catch (err) {
      setError(err.message || "Unable to update maintenance status.");
    }
  };

  const confirmCompletion = async (e) => {
    e.preventDefault();

    if (!completionRecord || !actualServiceDate) {
      setError("Please enter the actual service date.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await updateMaintenance(token, completionRecord.id, {
        status: "completed",
        actual_service_date: actualServiceDate,
        vehicle_operational: vehicleOperational,
      });

      setNotice("Maintenance completed successfully.");
      setCompletionRecord(null);
      await loadData();
    } catch (err) {
      setError(err.message || "Unable to complete maintenance.");
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = async (vehicleId) => {
    if (!vehicleId) return;

    setHistoryVehicle(vehicleId);
    setHistoryLoading(true);
    setHistory([]);
    setShowHistory(true);
    setError("");

    try {
      const data = await getVehicleMaintenanceHistory(
        token,
        vehicleId
      );

      setHistory(
        Array.isArray(data)
          ? data
          : data?.items || data?.records || []
      );
    } catch (err) {
      setError(err.message || "Unable to load service history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const formatStatus = (status) =>
    (status || "").replaceAll("_", " ");

  const formatCategory = (category) =>
    (category || "").replaceAll("_", " ");

  const maintenanceEligibleVehicles = vehicles.filter(
    (vehicle) => vehicle.status?.toLowerCase() !== "inactive"
  );

  const getVehicleName = (vehicleId) => {
    const vehicle = vehicles.find(
      (v) => Number(v.id) === Number(vehicleId)
    );

    return (
      vehicle?.registration_number ||
      vehicle?.registration_no ||
      vehicle?.reg ||
      `Vehicle #${vehicleId}`
    );
  };

  const formatDate = (date) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-IN");
  };

  const money = (amount) =>
    `₹${Number(amount || 0).toLocaleString("en-IN")}`;

  return (
  <div className="maintenance-page">

    <div className="maintenance-header-actions">
      <button
        className="maintenance-secondary-btn"
        onClick={loadData}
        disabled={loading}
      >
        <RefreshCw size={16} />
        Refresh
      </button>

      <button
        className="maintenance-primary-btn"
        onClick={() => {
          setError("");
          setShowForm(true);
        }}
      >
        <Plus size={17} />
        Schedule Maintenance
      </button>
    </div>

      {error && (
        <div className="maintenance-notice error">
          <span>{error}</span>
          <button onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}

      {notice && (
        <div className="maintenance-notice success">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* SUMMARY CARDS */}

      <section className="maintenance-summary-grid">

        <div className="maintenance-summary-card">
          <div className="maintenance-card-top">
            <span>Total Vehicles</span>
            <span className="maintenance-icon blue">
              <Truck size={20} />
            </span>
          </div>
          <h2>{summary.total_vehicles ?? vehicles.length}</h2>
          <p>Registered fleet vehicles</p>
        </div>

        <div className="maintenance-summary-card">
          <div className="maintenance-card-top">
            <span>Under Maintenance</span>
            <span className="maintenance-icon orange">
              <Wrench size={20} />
            </span>
          </div>
          <h2>{summary.under_maintenance ?? 0}</h2>
          <p>Currently being serviced</p>
        </div>

        <div className="maintenance-summary-card">
          <div className="maintenance-card-top">
            <span>Upcoming Maintenance</span>
            <span className="maintenance-icon purple">
              <CalendarDays size={20} />
            </span>
          </div>
          <h2>{summary.upcoming_maintenance ?? 0}</h2>
          <p>Scheduled servicing</p>
        </div>

        <div className="maintenance-summary-card">
          <div className="maintenance-card-top">
            <span>Overdue Maintenance</span>
            <span className="maintenance-icon red">
              <AlertTriangle size={20} />
            </span>
          </div>
          <h2>{summary.overdue_maintenance ?? 0}</h2>
          <p>Service date exceeded</p>
        </div>

      </section>

      {/* MAINTENANCE RECORDS */}

      <section className="maintenance-panel">
        <div className="maintenance-panel-heading">
          <div>
            <h2>Maintenance Records</h2>
            <p>All scheduled and completed vehicle services</p>
          </div>
          <Wrench size={22} />
        </div>

        {loading ? (
          <p className="maintenance-empty">Loading maintenance records...</p>
        ) : records.length === 0 ? (
          <div className="maintenance-empty">
            <Wrench size={30} />
            <h3>No maintenance records found</h3>
            <p>Schedule maintenance to see records here.</p>
          </div>
        ) : (
          <div className="maintenance-table-wrapper">
            <table className="maintenance-table">
              <thead>
                <tr>
                  <th>VEHICLE</th>
                  <th>CATEGORY</th>
                  <th>SCHEDULED DATE</th>
                  <th>SERVICE CENTRE</th>
                  <th>ESTIMATED COST</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <strong>
                        {getVehicleName(record.vehicle_id)}
                      </strong>
                    </td>

                    <td>{formatCategory(record.maintenance_type)}</td>

                    <td>{formatDate(record.scheduled_date)}</td>

                    <td>{record.service_center || "—"}</td>

                    <td>{money(record.estimated_cost)}</td>

                    <td>
                      <span
                        className={`maintenance-status status-${record.status}`}
                      >
                        {formatStatus(record.status)}
                      </span>
                    </td>

                    <td>
                      <select
                        className="maintenance-status-select"
                        value={record.status}
                        onChange={(e) =>
                          handleStatusChange(record, e.target.value)
                        }
                        disabled={
                          record.status === "completed" ||
                          record.status === "cancelled" ||
                          saving
                        }
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* VEHICLE SERVICE HISTORY */}

      <section className="maintenance-panel">
        <div className="maintenance-panel-heading">
          <div>
            <h2>Vehicle Service History</h2>
            <p>View maintenance history for individual vehicles</p>
          </div>
          <History size={22} />
        </div>

        <div className="maintenance-history-controls">
          <select
            value={historyVehicle}
            onChange={(e) => loadHistory(e.target.value)}
          >
            <option value="">Select a vehicle</option>
            {maintenanceEligibleVehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.registration_number ||
                  vehicle.registration_no ||
                  vehicle.reg ||
                  `Vehicle #${vehicle.id}`}
              </option>
            ))}
          </select>
        </div>

        {showHistory && (
          <div className="maintenance-history-results">
            {historyLoading ? (
              <p>Loading service history...</p>
            ) : history.length === 0 ? (
              <p>No service history found for this vehicle.</p>
            ) : (
              <div className="maintenance-table-wrapper">
                <table className="maintenance-table">
                  <thead>
                    <tr>
                      <th>MAINTENANCE TYPE</th>
                      <th>DESCRIPTION</th>
                      <th>SERVICE DATE</th>
                      <th>COST</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr key={item.id}>
                        <td>{formatCategory(item.maintenance_type)}</td>
                        <td>{item.description || "—"}</td>
                        <td>
                          {formatDate(
                            item.actual_service_date ||
                            item.scheduled_date
                          )}
                        </td>
                        <td>{money(item.estimated_cost)}</td>
                        <td>{formatStatus(item.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* SCHEDULE MAINTENANCE MODAL */}

      {showForm && (
        <div
          className="maintenance-modal-overlay"
          onClick={() => !saving && setShowForm(false)}
        >
          <form
            className="maintenance-modal"
            onSubmit={handleSchedule}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="maintenance-modal-heading">
              <div>
                <h2>Schedule Maintenance</h2>
                <p>Enter the vehicle servicing details.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                <X />
              </button>
            </div>

            <label>
              Select Vehicle *
              <select
                required
                value={form.vehicle_id}
                onChange={(e) =>
                  setForm({ ...form, vehicle_id: e.target.value })
                }
              >
                <option value="">Choose a vehicle</option>
                {maintenanceEligibleVehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.registration_number ||
                      vehicle.registration_no ||
                      vehicle.reg ||
                      `Vehicle #${vehicle.id}`}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Maintenance Category *
              <select
                required
                value={form.maintenance_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    maintenance_type: e.target.value,
                  })
                }
              >
                {categories.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Description (Optional)
              <textarea
                rows="3"
                value={form.description}
                placeholder="Describe the maintenance work (optional)"
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>

            <div className="maintenance-form-row">
              <label>
                Scheduled Date *
                <input
                  type="date"
                  required
                  min={new Date().toISOString().split("T")[0]}
                  value={form.scheduled_date}
                  onChange={(e) =>
                    setForm({ ...form, scheduled_date: e.target.value })
                  }
                />
              </label>

              <label>
                Estimated Cost (₹) *
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={form.estimated_cost}
                  placeholder="e.g. 5000"
                  onChange={(e) =>
                    setForm({ ...form, estimated_cost: e.target.value })
                  }
                />
              </label>
            </div>

            <label>
              Service Centre *
              <input
                required
                value={form.service_center}
                placeholder="Enter service centre"
                onChange={(e) =>
                  setForm({ ...form, service_center: e.target.value })
                }
              />
            </label>

            <div className="maintenance-modal-actions">
              <button
                type="button"
                className="maintenance-secondary-btn"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="maintenance-primary-btn"
                disabled={saving}
              >
                <Plus size={16} />
                {saving ? "Saving..." : "Schedule Maintenance"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* COMPLETION CONFIRMATION */}

      {completionRecord && (
        <div
          className="maintenance-modal-overlay"
          onClick={() => !saving && setCompletionRecord(null)}
        >
          <form
            className="maintenance-modal"
            onSubmit={confirmCompletion}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="maintenance-modal-heading">
              <div>
                <h2>Complete Maintenance</h2>
                <p>
                  Confirm the service details before completing this record.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompletionRecord(null)}
                disabled={saving}
              >
                <X />
              </button>
            </div>

            <label>
              Actual Service Date *
              <input
                type="date"
                required
                value={actualServiceDate}
                onChange={(e) => setActualServiceDate(e.target.value)}
              />
            </label>

            <label className="maintenance-checkbox-label">
              <input
                type="checkbox"
                checked={vehicleOperational}
                onChange={(e) =>
                  setVehicleOperational(e.target.checked)
                }
              />
              Vehicle is operational after maintenance
            </label>

            <div className="maintenance-modal-actions">
              <button
                type="button"
                className="maintenance-secondary-btn"
                onClick={() => setCompletionRecord(null)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="maintenance-primary-btn"
                disabled={saving}
              >
                <CheckCircle2 size={16} />
                {saving ? "Updating..." : "Confirm Completion"}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

export default Maintenance;
