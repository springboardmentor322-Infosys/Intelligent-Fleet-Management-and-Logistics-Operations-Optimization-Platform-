import { useEffect, useState } from "react";

function badgeClass(status) {
  return `badge badge-${String(status).toLowerCase().replace(/\s+/g, "-")}`;
}

// Resolved alerts show "Resolved"; open alerts show Upcoming or Overdue.
function displayStatus(alert) {
  return alert.status === "Resolved" ? "Resolved" : alert.alert_type;
}

function MaintenanceAlerts({ apiRequest }) {
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState("Unresolved");
  const [notice, setNotice] = useState("");
  const [checking, setChecking] = useState(false);

  async function loadAlerts() {
    try {
      const path =
        filter === "All"
          ? "/maintenance-alerts"
          : `/maintenance-alerts?status_filter=${encodeURIComponent(filter)}`;

      const data = await apiRequest(path);
      setAlerts(Array.isArray(data) ? data : []);
    } catch (error) {
      setNotice(error.message);
    }
  }

  useEffect(() => {
    loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function checkForAlerts() {
    setChecking(true);
    setNotice("");

    try {
      const result = await apiRequest("/maintenance-alerts/generate", {
        method: "POST",
      });

      setNotice(
        `Check complete: ${result.created.upcoming} new upcoming and ${result.created.overdue} new overdue alert(s).`,
      );
      await loadAlerts();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setChecking(false);
    }
  }

  async function resolveAlert(alert) {
    try {
      await apiRequest(`/maintenance-alerts/${alert.id}/resolve`, {
        method: "PUT",
      });

      setNotice("Alert marked as resolved.");
      await loadAlerts();
    } catch (error) {
      setNotice(error.message);
    }
  }

  const upcoming = alerts.filter(
    (a) => a.status !== "Resolved" && a.alert_type === "Upcoming",
  ).length;
  const overdue = alerts.filter(
    (a) => a.status !== "Resolved" && a.alert_type === "Overdue",
  ).length;
  const resolved = alerts.filter((a) => a.status === "Resolved").length;

  return (
    <>
      {notice && <div className="message">{notice}</div>}

      <section className="stats-grid">
        <article className="stat-card">
          <span className="stat-icon">📅</span>
          <h3>Upcoming</h3>
          <strong>{upcoming}</strong>
          <p>Due within 7 days</p>
        </article>

        <article className="stat-card">
          <span className="stat-icon">⚠️</span>
          <h3>Overdue</h3>
          <strong>{overdue}</strong>
          <p>Past their due date</p>
        </article>

        <article className="stat-card">
          <span className="stat-icon">✅</span>
          <h3>Resolved</h3>
          <strong>{resolved}</strong>
          <p>In the current list</p>
        </article>
      </section>

      <section className="content-section">
        <div className="page-header">
          <div>
            <h2>Maintenance Alerts</h2>
            <p>Notifications for upcoming and overdue servicing.</p>
          </div>

          <button type="button" onClick={checkForAlerts} disabled={checking}>
            {checking ? "Checking..." : "Check for Alerts"}
          </button>
        </div>

        <div className="table-controls">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="Unresolved">Open Alerts</option>
            <option value="Resolved">Resolved</option>
            <option value="All">All Alerts</option>
          </select>
          <button type="button" onClick={loadAlerts}>
            Refresh
          </button>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Maintenance Type</th>
                <th>Due Date</th>
                <th>Alert</th>
                <th>Message</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>{alert.vehicle_number}</td>
                  <td>{alert.category}</td>
                  <td>{alert.scheduled_date}</td>
                  <td>
                    <span className={badgeClass(displayStatus(alert))}>
                      {displayStatus(alert)}
                    </span>
                  </td>
                  <td>{alert.message}</td>
                  <td>
                    {alert.status === "Resolved" ? (
                      "-"
                    ) : (
                      <button type="button" onClick={() => resolveAlert(alert)}>
                        Mark Resolved
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {alerts.length === 0 && (
                <tr>
                  <td colSpan="6">No alerts found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default MaintenanceAlerts;