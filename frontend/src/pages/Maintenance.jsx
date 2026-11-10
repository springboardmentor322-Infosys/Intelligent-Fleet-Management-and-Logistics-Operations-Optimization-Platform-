import { Fragment, useEffect, useState } from "react";
import { api, download } from "../api";

const CATEGORIES = [
  "Engine Servicing", "Oil Change", "Tyre Replacement",
  "Brake Inspection", "General Servicing", "Unexpected Repairs",
];
const STATUSES = ["Scheduled", "In Progress", "Completed", "Cancelled"];
const TABS = ["Records", "Vehicles", "Alerts", "Reports"];
const blank = {
  vehicle_id: "", category: CATEGORIES[0], description: "",
  scheduled_date: "", service_centre: "", estimated_cost: "",
};
const noFilter = { vehicle: "", category: "", status: "", start: "", end: "" };
const money = (n) => (n == null ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }));

function query(filters) {
  const p = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
  return p.toString();
}

export default function Maintenance({ setError }) {
  const [tab, setTab] = useState("Records");
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [report, setReport] = useState(null);
  const [filters, setFilters] = useState(noFilter);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);
  const [note, setNote] = useState("");
  const [finishing, setFinishing] = useState(null); // record being completed
  const [finish, setFinish] = useState({ actual_cost: "", parts_replaced: "", confirm_operational: true });
  const [history, setHistory] = useState({ vehicle: null, rows: [] });

  async function loadAll(f = filters) {
    try {
      setStats(await api("/maintenance/stats"));
      setVehicles(await api("/vehicles"));
      if (tab === "Records") setRecords(await api(`/maintenance?${query(f)}`));
      if (tab === "Alerts") setAlerts(await api("/maintenance/alerts"));
      if (tab === "Reports") setReport(await api(`/maintenance/report?${query(f)}`));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { loadAll(); }, [tab]);

  const setF = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function closeForm() { setShow(false); setEditing(null); setForm(blank); }

  async function save(e) {
    e.preventDefault();
    setError(""); setNote("");
    try {
      await api(editing ? `/maintenance/${editing}` : "/maintenance", {
        method: editing ? "PUT" : "POST",
        body: {
          ...form, vehicle_id: Number(form.vehicle_id),
          estimated_cost: Number(form.estimated_cost || 0),
        },
      });
      setNote(editing ? "Maintenance updated." : "Maintenance scheduled.");
      closeForm();
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  function edit(m) {
    setEditing(m.id);
    setForm({
      vehicle_id: String(m.vehicle_id), category: m.category, description: m.description,
      scheduled_date: m.scheduled_date, service_centre: m.service_centre,
      estimated_cost: String(m.estimated_cost),
    });
    setShow(true);
  }

  async function setStatus(m, body, done) {
    setError(""); setNote("");
    try {
      await api(`/maintenance/${m.id}/status`, { method: "POST", body });
      setNote(`${m.registration_number}: ${done}.`);
      setFinishing(null);
      loadAll();
    } catch (e) {
      setError(e.message);
    }
  }

  const start = (m) => setStatus(m, { status: "In Progress" }, "work started, vehicle is now In Maintenance");
  const cancel = (m) => {
    if (window.confirm(`Cancel this ${m.category} for ${m.registration_number}?`))
      setStatus(m, { status: "Cancelled" }, "cancelled");
  };
  function beginFinish(m) {
    setFinishing(m.id);
    setFinish({ actual_cost: String(m.estimated_cost), parts_replaced: "", confirm_operational: true });
  }
  const complete = (m) => setStatus(m, {
    status: "Completed",
    actual_cost: finish.actual_cost === "" ? null : Number(finish.actual_cost),
    parts_replaced: finish.parts_replaced || null,
    confirm_operational: finish.confirm_operational,
  }, "completed");

  async function resolveAlert(a) {
    setError(""); setNote("");
    try {
      await api(`/maintenance/alerts/${a.id}/resolve`, { method: "POST" });
      setNote("Alert resolved.");
      loadAll();
    } catch (e) {
      setError(e.message);
    }
  }

  async function confirmOperational(v) {
    setError(""); setNote("");
    try {
      await api(`/maintenance/vehicles/${v.id}/confirm-operational`, { method: "POST" });
      setNote(`${v.registration_number} is back in service.`);
      loadAll();
    } catch (e) {
      setError(e.message);
    }
  }

  async function showHistory(v) {
    if (history.vehicle === v.id) { setHistory({ vehicle: null, rows: [] }); return; }
    try {
      setHistory({ vehicle: v.id, rows: await api(`/maintenance/vehicles/${v.id}/history`) });
    } catch (e) {
      setError(e.message);
    }
  }

  async function exportReport(format) {
    setError("");
    try {
      await download(`/maintenance/report/export?format=${format}&${query(filters)}`,
        `maintenance-report.${format}`);
    } catch (e) {
      setError(e.message);
    }
  }

  const filterBar = (
    <form className="filters" onSubmit={(e) => { e.preventDefault(); loadAll(filters); }}>
      <input placeholder="Vehicle number" value={filters.vehicle} onChange={setF("vehicle")} />
      <select value={filters.category} onChange={setF("category")}>
        <option value="">All categories</option>
        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <select value={filters.status} onChange={setF("status")}>
        <option value="">All statuses</option>
        {STATUSES.map((s) => <option key={s}>{s}</option>)}
      </select>
      <input type="date" title="From" value={filters.start} onChange={setF("start")} />
      <input type="date" title="To" value={filters.end} onChange={setF("end")} />
      <button className="secondary-button" type="submit">Apply</button>
      <button className="secondary-button" type="button"
        onClick={() => { setFilters(noFilter); loadAll(noFilter); }}>Clear</button>
    </form>
  );

  const cards = stats && [
    ["Total vehicles", stats.total_vehicles],
    ["Under maintenance", stats.under_maintenance],
    ["Upcoming maintenance", stats.upcoming],
    ["Overdue maintenance", stats.overdue],
  ];

  return (
    <>
      <section className="page-toolbar">
        <div>
          <h2>Maintenance Management</h2>
          <p>Schedule servicing, track progress and keep each vehicle's service history.</p>
        </div>
        <button className="primary-button"
          onClick={() => { setForm(blank); setEditing(null); setShow(true); setTab("Records"); }}>
          + Schedule maintenance
        </button>
      </section>

      {cards && (
        <section className="stats-grid">
          {cards.map(([t, v]) => (
            <article className="stat-card" key={t}><p>{t}</p><h2>{v}</h2></article>
          ))}
        </section>
      )}

      {note && <div className="note-message">{note}</div>}

      {show && (
        <form className="panel form-grid" onSubmit={save}>
          <h3>{editing ? "Edit maintenance" : "Schedule maintenance"}</h3>
          <label>Vehicle
            <select required value={form.vehicle_id} onChange={set("vehicle_id")}>
              <option value="">Select vehicle...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.registration_number} · {v.vehicle_type}</option>
              ))}
            </select>
          </label>
          <label>Category
            <select value={form.category} onChange={set("category")}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Scheduled date
            <input required type="date" value={form.scheduled_date} onChange={set("scheduled_date")} />
          </label>
          <label>Service centre
            <input maxLength={120} value={form.service_centre} onChange={set("service_centre")} />
          </label>
          <label>Estimated cost
            <input type="number" min="0" step="any" value={form.estimated_cost} onChange={set("estimated_cost")} />
          </label>
          <label>Description
            <input maxLength={300} value={form.description} onChange={set("description")} />
          </label>
          <div>
            <button className="primary-button" type="submit">{editing ? "Update" : "Schedule"}</button>{" "}
            <button className="secondary-button" type="button" onClick={closeForm}>Cancel</button>
          </div>
        </form>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`secondary-button ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Records" && (
        <section className="panel">
          {filterBar}
          {records.length === 0 ? <p>No maintenance records found.</p> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Vehicle</th><th>Type</th><th>Scheduled</th><th>Est. cost</th>
                    <th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {records.map((m) => (
                    <Fragment key={m.id}>
                      <tr>
                        <td><b>{m.registration_number}</b><br /><small>{m.vehicle_type}</small></td>
                        <td>{m.category}<br /><small>{m.service_centre}</small></td>
                        <td>{m.scheduled_date}
                          {m.alert && m.alert !== "Resolved" && (
                            <span className={`delay-badge ${m.alert === "Overdue" ? "bad" : ""}`}>{m.alert}</span>
                          )}</td>
                        <td>{money(m.estimated_cost)}</td>
                        <td><span className={`status-pill ${m.alert === "Overdue" ? "pill-bad" : ""}`}>{m.status}</span></td>
                        <td>
                          <div className="row-actions">
                            {m.status === "Scheduled" && <>
                              <button className="secondary-button" onClick={() => start(m)}>Start</button>
                              <button className="secondary-button" onClick={() => edit(m)}>Edit</button>
                              <button className="secondary-button" onClick={() => cancel(m)}>Cancel</button>
                            </>}
                            {m.status === "In Progress" && <>
                              <button className="secondary-button" onClick={() => beginFinish(m)}>Complete</button>
                              <button className="secondary-button" onClick={() => cancel(m)}>Cancel</button>
                            </>}
                            {m.status === "Completed" && (
                              <small>Cost {money(m.actual_cost)}{m.parts_replaced ? ` · ${m.parts_replaced}` : ""}</small>
                            )}
                          </div>
                        </td>
                      </tr>
                      {finishing === m.id && (
                        <tr>
                          <td colSpan={6}>
                            <div className="filters">
                              <input type="number" min="0" step="any" placeholder="Actual cost"
                                value={finish.actual_cost}
                                onChange={(e) => setFinish({ ...finish, actual_cost: e.target.value })} />
                              <input placeholder="Parts replaced" maxLength={300} value={finish.parts_replaced}
                                onChange={(e) => setFinish({ ...finish, parts_replaced: e.target.value })} />
                              <label>
                                <input type="checkbox" checked={finish.confirm_operational}
                                  onChange={(e) => setFinish({ ...finish, confirm_operational: e.target.checked })} />
                                {" "}Vehicle is operational again
                              </label>
                              <button className="primary-button" onClick={() => complete(m)}>Save as completed</button>
                              <button className="secondary-button" onClick={() => setFinishing(null)}>Cancel</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "Vehicles" && (
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vehicle</th><th>Type</th><th>Availability</th><th>Actions</th></tr></thead>
              <tbody>
                {vehicles.map((v) => (
                  <Fragment key={v.id}>
                    <tr>
                      <td><b>{v.registration_number}</b></td>
                      <td>{v.vehicle_type}</td>
                      <td><span className={`status-pill ${v.status === "In Maintenance" ? "pill-bad" : ""}`}>{v.status}</span></td>
                      <td>
                        <div className="row-actions">
                          <button className="secondary-button" onClick={() => showHistory(v)}>
                            {history.vehicle === v.id ? "Hide history" : "Service history"}
                          </button>
                          {v.status === "In Maintenance" && (
                            <button className="secondary-button" onClick={() => confirmOperational(v)}>
                              Confirm operational
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {history.vehicle === v.id && (
                      <tr>
                        <td colSpan={4}>
                          {history.rows.length === 0 ? <small>No completed services yet.</small> : (
                            <ul className="history-list">
                              {history.rows.map((h) => (
                                <li key={h.id}>
                                  {h.completed_at?.slice(0, 10)} · <b>{h.category}</b> · cost {money(h.actual_cost)}
                                  {h.parts_replaced ? ` · parts: ${h.parts_replaced}` : ""}
                                  {h.description ? ` · ${h.description}` : ""}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "Alerts" && (
        <section className="panel">
          {alerts.length === 0 ? <p>No maintenance alerts.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Vehicle</th><th>Category</th><th>Due date</th><th>Alert</th><th>Action</th></tr></thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={a.id}>
                      <td><b>{a.registration_number}</b></td>
                      <td>{a.category}</td>
                      <td>{a.scheduled_date}</td>
                      <td><span className={`status-pill ${a.alert_category === "Overdue" ? "pill-bad" : ""}`}>
                        {a.alert_category}</span></td>
                      <td>
                        {a.alert_category !== "Resolved" && a.maintenance_status === "Completed" && (
                          <button className="secondary-button" onClick={() => resolveAlert(a)}>Mark resolved</button>
                        )}
                        {a.alert_category !== "Resolved" && a.maintenance_status !== "Completed" && (
                          <small>Resolves when the work is completed</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "Reports" && (
        <section className="panel">
          {filterBar}
          {report && (
            <>
              <section className="stats-grid">
                {[
                  ["Scheduled", report.summary.scheduled],
                  ["In progress", report.summary.in_progress],
                  ["Completed", report.summary.completed],
                  ["Overdue", report.summary.overdue],
                  ["Spent (completed)", money(report.summary.spent)],
                  ["Open work estimate", money(report.summary.open_estimate)],
                ].map(([t, v]) => (
                  <article className="stat-card" key={t}><p>{t}</p><h2>{v}</h2></article>
                ))}
              </section>
              <div className="row-actions">
                <button className="primary-button" onClick={() => exportReport("xlsx")}>Export Excel</button>
                <button className="secondary-button" onClick={() => exportReport("pdf")}>Export PDF</button>
              </div>
              <h3>Cost per vehicle</h3>
              {Object.keys(report.summary.per_vehicle).length === 0 ? <p>No records match.</p> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Vehicle</th><th>Records</th><th>Spent</th><th>Open estimate</th></tr></thead>
                    <tbody>
                      {Object.entries(report.summary.per_vehicle).map(([reg, v]) => (
                        <tr key={reg}>
                          <td><b>{reg}</b></td><td>{v.records}</td>
                          <td>{money(v.spent)}</td><td>{money(v.open_estimate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
