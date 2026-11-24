
import { useEffect, useState } from "react";
import { getMaintenanceAlerts } from "../api";
import {
  Bell,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  RefreshCw,
  Wrench,
} from "lucide-react";
import "./MaintenanceAlerts.css";

function MaintenanceAlerts({ token }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const loadAlerts = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getMaintenanceAlerts(token);

      setAlerts(
        Array.isArray(data)
          ? data
          : data?.items || data?.alerts || []
      );
    } catch (err) {
      setError(err.message || "Unable to load maintenance alerts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const fetchAlerts = async () => {
        try {
        const result = await getMaintenanceAlerts(token);

        if (!cancelled) {
            setAlerts(Array.isArray(result) ? result : []);
        }
        } catch (err) {
        if (!cancelled) {
            setError(err.message || "Unable to load maintenance alerts.");
        }
        } finally {
        if (!cancelled) {
            setLoading(false);
        }
        }
    };

    fetchAlerts();

    return () => {
        cancelled = true;
    };
    }, [token]);

  const formatDate = (date) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-IN");
  };

  const getStatus = (alert) =>
    (alert.alert_status || "upcoming").toLowerCase();

  const filteredAlerts = alerts.filter((alert) => {
    if (filter === "all") return true;
    return getStatus(alert) === filter;
  });

  const upcomingCount = alerts.filter(
    (a) => getStatus(a) === "upcoming"
  ).length;

  const overdueCount = alerts.filter(
    (a) => getStatus(a) === "overdue"
  ).length;

  const resolvedCount = alerts.filter(
    (a) => getStatus(a) === "resolved"
  ).length;

  return (
    <div className="maintenance-alerts-page">

      <div className="alerts-header">
        <div>
          <p>
            Monitor upcoming servicing, overdue maintenance
            and resolved maintenance notifications.
          </p>
        </div>

        <button
          className="alerts-refresh-btn"
          onClick={loadAlerts}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="alerts-error">{error}</div>
      )}

      <div className="alerts-summary-grid">

        <div className="alerts-summary-card">
          <div className="alerts-summary-top">
            <span>Upcoming</span>
            <CalendarClock className="upcoming-icon" />
          </div>
          <h2>{upcomingCount}</h2>
          <p>Upcoming service requirements</p>
        </div>

        <div className="alerts-summary-card">
          <div className="alerts-summary-top">
            <span>Overdue</span>
            <AlertTriangle className="overdue-icon" />
          </div>
          <h2>{overdueCount}</h2>
          <p>Maintenance dates exceeded</p>
        </div>

        <div className="alerts-summary-card">
          <div className="alerts-summary-top">
            <span>Resolved</span>
            <CheckCircle2 className="resolved-icon" />
          </div>
          <h2>{resolvedCount}</h2>
          <p>Completed maintenance alerts</p>
        </div>

        <div className="alerts-summary-card">
          <div className="alerts-summary-top">
            <span>Total Alerts</span>
            <Bell className="total-alert-icon" />
          </div>
          <h2>{alerts.length}</h2>
          <p>All maintenance notifications</p>
        </div>

      </div>

      <section className="alerts-panel">

        <div className="alerts-panel-heading">
          <div>
            <h2>Maintenance Notifications</h2>
            <p>Vehicle servicing alerts and their current status</p>
          </div>

          <Wrench size={22} />
        </div>

        <div className="alerts-filter-row">
          {["all", "upcoming", "overdue", "resolved"].map(
            (item) => (
              <button
                key={item}
                className={
                  filter === item ? "alert-filter active" : "alert-filter"
                }
                onClick={() => setFilter(item)}
              >
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </button>
            )
          )}
        </div>

        {loading ? (
          <div className="alerts-empty">Loading alerts...</div>
        ) : filteredAlerts.length === 0 ? (
          <div className="alerts-empty">
            <Bell size={30} />
            <h3>No maintenance alerts found</h3>
            <p>There are no notifications in this category.</p>
          </div>
        ) : (
          <div className="alerts-table-wrapper">
            <table className="alerts-table">
              <thead>
                <tr>
                  <th>VEHICLE</th>
                  <th>MAINTENANCE CATEGORY</th>
                  <th>SCHEDULED DATE</th>
                  <th>MAINTENANCE STATUS</th>
                  <th>ALERT STATUS</th>
                </tr>
              </thead>

              <tbody>
                {filteredAlerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>
                      <strong>
                        {alert.registration_number ||
                          alert.vehicle_registration ||
                          `Vehicle #${alert.vehicle_id}`}
                      </strong>
                    </td>

                    <td>
                      {alert.maintenance_type}
                    </td>

                    <td>
                      {formatDate(alert.scheduled_date)}
                    </td>

                    <td>
                      <span className="alert-maintenance-status">
                        {(alert.maintenance_status || "")
                          .replaceAll("_", " ")}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`alert-status ${getStatus(alert)}`}
                      >
                        {getStatus(alert).toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </section>

    </div>
  );
}

export default MaintenanceAlerts;
