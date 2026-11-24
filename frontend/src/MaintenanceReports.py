import { useEffect, useState } from "react";

const CATEGORIES = [
  "Engine Servicing",
  "Oil Change",
  "Tyre Replacement",
  "Brake Inspection",
  "General Servicing",
  "Unexpected Repairs",
];

const STATUSES = [
  "Scheduled",
  "In Progress",
  "Completed",
  "Cancelled",
  "Pending",
  "Overdue",
];

const EMPTY_FILTERS = {
  vehicle_id: "",
  category: "",
  status_filter: "",
  start_date: "",
  end_date: "",
};

function badgeClass(status) {
  return `badge badge-${String(status).toLowerCase().replace(/\s+/g, "-")}`;
}

function money(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildQuery(filters, extra = {}) {
  const params = new URLSearchParams();

  Object.entries({ ...filters, ...extra }).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });

  const text = params.toString();
  return text ? `?${text}` : "";
}

function MaintenanceReports({ apiRequest, apiUrl, vehicles }) {
  const [report, setReport] = useState(null);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState("");

  async function loadReport(activeFilters = filters) {
    try {
      const data = await apiRequest(
        `/maintenance/reports${buildQuery(activeFilters)}`,
      );
      setReport(data);
    } catch (error) {
      setNotice(error.message);
    }
  }

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(event) {
    event.preventDefault();
    setNotice("");
    loadReport(filters);
  }

  function clearFilters() {
    setFilters({ ...EMPTY_FILTERS });
    setNotice("");
    loadReport({ ...EMPTY_FILTERS });
  }

  async function exportReport(fileFormat) {
    setExporting(fileFormat);
    setNotice("");

    try {
      const response = await fetch(
        `${apiUrl}/maintenance/reports/export${buildQuery(filters, {
          file_format: fileFormat,
        })}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
        },
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "Export failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `maintenance_report.${
        fileFormat === "excel" ? "xlsx" : "pdf"
      }`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setNotice(
        `${fileFormat === "excel" ? "Excel" : "PDF"} report downloaded.`,
      );
    } catch (error) {
      setNotice(error.message);
    } finally {
      setExporting("");
    }
  }

  const summary = report?.summary;
  const expenses = report?.expenses;

  return (
    <>
      {notice && <div className="message">{notice}</div>}

      <section className="stats-grid">
        <article className="stat-card">
          <span className="stat-icon">📅</span>
          <h3>Scheduled</h3>
          <strong>{summary?.scheduled ?? "-"}</strong>
          <p>Waiting to start</p>
        </article>

        <article className="stat-card">
          <span className="stat-icon">✅</span>
          <h3>Completed</h3>
          <strong>{summary?.completed ?? "-"}</strong>
          <p>Finished services</p>
        </article>

        <article className="stat-card">
          <span className="stat-icon">🔧</span>
          <h3>Pending</h3>
          <strong>{summary?.pending ?? "-"}</strong>
          <p>Scheduled or in progress</p>
        </article>

        <article className="stat-card">
          <span className="stat-icon">⚠️</span>
          <h3>Overdue</h3>
          <strong>{summary?.overdue ?? "-"}</strong>
          <p>Past their due date</p>
        </article>
      </section>

      <section className="content-section">
        <div className="page-header">
          <div>
            <h2>Maintenance Reports</h2>
            <p>Filter records, review expenses and export the report.</p>
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => exportReport("excel")}
              disabled={Boolean(exporting)}
            >
              {exporting === "excel" ? "Preparing..." : "Export Excel"}
            </button>
            <button
              type="button"
              onClick={() => exportReport("pdf")}
              disabled={Boolean(exporting)}
              className="btn-grey"
            >
              {exporting === "pdf" ? "Preparing..." : "Export PDF"}
            </button>
          </div>
        </div>

        <form className="vehicle-form" onSubmit={applyFilters}>
          <h3>Filters</h3>

          <label>
            Vehicle Registration
            <select
              value={filters.vehicle_id}
              onChange={(e) =>
                setFilters({ ...filters, vehicle_id: e.target.value })
              }
            >
              <option value="">All vehicles</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.vehicle_number}
                </option>
              ))}
            </select>
          </label>

          <label>
            Maintenance Category
            <select
              value={filters.category}
              onChange={(e) =>
                setFilters({ ...filters, category: e.target.value })
              }
            >
              <option value="">All categories</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select
              value={filters.status_filter}
              onChange={(e) =>
                setFilters({ ...filters, status_filter: e.target.value })
              }
            >
              <option value="">All statuses</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label>
            From Date
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) =>
                setFilters({ ...filters, start_date: e.target.value })
              }
            />
          </label>

          <label>
            To Date
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) =>
                setFilters({ ...filters, end_date: e.target.value })
              }
            />
          </label>

          <div className="form-actions">
            <button type="submit">Apply Filters</button>
            <button type="button" onClick={clearFilters}>
              Clear
            </button>
          </div>
        </form>

        <section className="stats-grid">
          <article className="stat-card">
            <span className="stat-icon">🧾</span>
            <h3>Records</h3>
            <strong>{summary?.total_records ?? "-"}</strong>
            <p>Matching the filters</p>
          </article>

          <article className="stat-card">
            <span className="stat-icon">💰</span>
            <h3>Estimated Cost</h3>
            <strong>₹{money(expenses?.fleet_estimated_cost)}</strong>
            <p>Excludes cancelled jobs</p>
          </article>

          <article className="stat-card">
            <span className="stat-icon">💵</span>
            <h3>Actual Cost</h3>
            <strong>₹{money(expenses?.fleet_actual_cost)}</strong>
            <p>Completed jobs only</p>
          </article>
        </section>
      </section>

      <section className="content-section">
        <div className="page-header">
          <div>
            <h2>Expenses by Vehicle</h2>
            <p>Maintenance cost for each vehicle and for the whole fleet.</p>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Total Jobs</th>
                <th>Completed Jobs</th>
                <th>Estimated Cost</th>
                <th>Actual Cost</th>
              </tr>
            </thead>
            <tbody>
              {(expenses?.vehicles || []).map((item) => (
                <tr key={item.vehicle_id}>
                  <td>{item.vehicle_number}</td>
                  <td>{item.jobs}</td>
                  <td>{item.completed_jobs}</td>
                  <td>₹{money(item.total_estimated_cost)}</td>
                  <td>₹{money(item.total_actual_cost)}</td>
                </tr>
              ))}

              {(expenses?.vehicles || []).length === 0 && (
                <tr>
                  <td colSpan="5">No data for the selected filters.</td>
                </tr>
              )}

              {(expenses?.vehicles || []).length > 0 && (
                <tr>
                  <td>
                    <strong>Fleet Total</strong>
                  </td>
                  <td />
                  <td />
                  <td>
                    <strong>₹{money(expenses.fleet_estimated_cost)}</strong>
                  </td>
                  <td>
                    <strong>₹{money(expenses.fleet_actual_cost)}</strong>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-section">
        <div className="page-header">
          <div>
            <h2>Maintenance Records</h2>
            <p>Scheduled, completed, pending and overdue records.</p>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Category</th>
                <th>Service Centre</th>
                <th>Scheduled Date</th>
                <th>Status</th>
                <th>Estimated</th>
                <th>Completed On</th>
                <th>Actual</th>
              </tr>
            </thead>
            <tbody>
              {(report?.records || []).map((item) => (
                <tr key={item.id}>
                  <td>{item.vehicle_number}</td>
                  <td>{item.category}</td>
                  <td>{item.service_centre}</td>
                  <td>{item.scheduled_date}</td>
                  <td>
                    <span className={badgeClass(item.display_status)}>
                      {item.display_status}
                    </span>
                  </td>
                  <td>₹{money(item.estimated_cost)}</td>
                  <td>{item.completed_date || "-"}</td>
                  <td>
                    {item.actual_cost != null
                      ? `₹${money(item.actual_cost)}`
                      : "-"}
                  </td>
                </tr>
              ))}

              {(report?.records || []).length === 0 && (
                <tr>
                  <td colSpan="8">No maintenance records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default MaintenanceReports;