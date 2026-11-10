import { Fragment, useEffect, useState } from "react";
import { api } from "../api";
import { fmt, fmtTime } from "../ui";

const STATUSES = ["Created", "Assigned", "In Transit", "Delayed", "Delivered", "Cancelled"];
const blank = { origin: "", destination: "", description: "", weight_kg: "" };

const norm = (s) => s.split(/\s+/).join(" ").toLowerCase();

export default function Shipments({ canDispatch, setError }) {
  const [shipments, setShipments] = useState([]);
  const [planned, setPlanned] = useState([]); // planned trips a shipment can be assigned to
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);
  const [note, setNote] = useState("");
  const [pick, setPick] = useState({});        // shipment id -> chosen trip id
  const [open, setOpen] = useState(null);      // shipment shown with its history
  const [history, setHistory] = useState([]);

  async function load() {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (q.trim()) p.set("q", q.trim());
    try {
      setShipments(await api(`/shipments?${p}`));
      setPlanned(await api("/trips?status=Planned"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, [status]);

  // Statuses and ETAs change on their own while trips run.
  useEffect(() => {
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [status, q]);

  function cancelForm() {
    setShow(false);
    setEditing(null);
    setForm(blank);
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    setNote("");
    try {
      const s = await api(editing ? `/shipments/${editing}` : "/shipments", {
        method: editing ? "PUT" : "POST",
        body: { ...form, weight_kg: Number(form.weight_kg) },
      });
      setNote(`Shipment ${s.code} ${editing ? "updated" : "created"}.`);
      cancelForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function edit(s) {
    setEditing(s.id);
    setForm({
      origin: s.origin, destination: s.destination,
      description: s.description, weight_kg: String(s.weight_kg),
    });
    setShow(true);
  }

  async function act(s, path, body, done) {
    setError("");
    setNote("");
    try {
      await api(`/shipments/${s.id}/${path}`, { method: "POST", body });
      setNote(`${s.code}: ${done}.`);
      if (open === s.id) showHistory(s.id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const assign = (s) => {
    if (!pick[s.id]) { setError("Select a trip first"); return; }
    act(s, "assign", { trip_id: Number(pick[s.id]) }, "assigned to the trip");
  };
  const unassign = (s) => act(s, "unassign", undefined, "removed from its trip");
  const deliver = (s) => {
    if (window.confirm(`Mark ${s.code} as delivered?`)) act(s, "status", { status: "Delivered" }, "marked delivered");
  };
  const cancelShipment = (s) => {
    if (window.confirm(`Cancel shipment ${s.code}?`)) act(s, "status", { status: "Cancelled" }, "cancelled");
  };

  async function showHistory(id) {
    if (open === id && history.length) { setOpen(null); setHistory([]); return; }
    try {
      const d = await api(`/shipments/${id}`);
      setOpen(id);
      setHistory(d.history || []);
    } catch (e) {
      setError(e.message);
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const matching = (s) =>
    planned.filter((t) => norm(t.origin) === norm(s.origin) && norm(t.destination) === norm(s.destination));

  return (
    <>
      <section className="page-toolbar">
        <div>
          <h2>Shipments</h2>
          <p>Create shipments, assign them to planned trips and follow them until delivery.</p>
        </div>
        {canDispatch && (
          <button className="primary-button"
            onClick={() => { setForm(blank); setEditing(null); setShow(true); }}>
            + New shipment
          </button>
        )}
      </section>

      {note && <div className="note-message">{note}</div>}

      {show && (
        <form className="panel form-grid" onSubmit={save}>
          <h3>{editing ? "Edit shipment" : "New shipment"}</h3>
          <label>Origin
            <input required maxLength={120} value={form.origin} onChange={set("origin")} />
          </label>
          <label>Destination
            <input required maxLength={120} value={form.destination} onChange={set("destination")} />
          </label>
          <label>Description
            <input required maxLength={200} value={form.description} onChange={set("description")} />
          </label>
          <label>Weight (kg)
            <input required type="number" min="0" step="any" value={form.weight_kg} onChange={set("weight_kg")} />
          </label>
          <div>
            <button className="primary-button" type="submit">{editing ? "Update" : "Save"}</button>{" "}
            <button className="secondary-button" type="button" onClick={cancelForm}>Cancel</button>
          </div>
          <small style={{ gridColumn: "1 / -1" }}>
            A shipment can only join a planned trip with the same origin and destination.
          </small>
        </form>
      )}

      <section className="panel">
        <form className="filters" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input placeholder="Search code or description" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="secondary-button" type="submit">Search</button>
        </form>

        {shipments.length === 0 ? <p>No shipments found.</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Code</th><th>Route</th><th>Cargo</th><th>Trip</th><th>ETA</th>
                  <th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {shipments.map((s) => (
                  <Fragment key={s.id}>
                    <tr>
                      <td><b>{s.code}</b></td>
                      <td>{s.origin} → {s.destination}</td>
                      <td>{s.description} <small>({s.weight_kg} kg)</small></td>
                      <td>
                        {s.trip ? (
                          <>#{s.trip.id} · {s.trip.vehicle}<br /><small>{s.trip.driver} · {s.trip.status}</small></>
                        ) : "—"}
                      </td>
                      <td>
                        {s.eta ? (
                          <>{fmtTime(s.eta)}
                            {s.trip?.delayed && <span className="delay-badge bad">+{s.trip.late_minutes} min</span>}</>
                        ) : s.status === "Delivered" ? fmt(s.delivered_at) : "—"}
                      </td>
                      <td>
                        <span className={`status-pill ${s.status === "Delayed" ? "pill-bad" : ""}`}>{s.status}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          {canDispatch && s.can_assign && (
                            matching(s).length === 0 ? (
                              <small>No matching planned trip</small>
                            ) : (
                              <>
                                <select value={pick[s.id] || ""}
                                  onChange={(e) => setPick({ ...pick, [s.id]: e.target.value })}>
                                  <option value="">Select trip...</option>
                                  {matching(s).map((t) => (
                                    <option key={t.id} value={t.id}>
                                      #{t.id} · {t.vehicle} · {fmt(t.scheduled_start)}
                                    </option>
                                  ))}
                                </select>
                                <button className="secondary-button" onClick={() => assign(s)}>Assign</button>
                              </>
                            )
                          )}
                          {canDispatch && s.status === "Created" && (
                            <button className="secondary-button" onClick={() => edit(s)}>Edit</button>
                          )}
                          {canDispatch && s.status === "Assigned" && (
                            <button className="secondary-button" onClick={() => unassign(s)}>Unassign</button>
                          )}
                          {canDispatch && s.next_statuses.includes("Delivered") && (
                            <button className="secondary-button" onClick={() => deliver(s)}>Mark delivered</button>
                          )}
                          {canDispatch && s.next_statuses.includes("Cancelled") && (
                            <button className="secondary-button" onClick={() => cancelShipment(s)}>Cancel</button>
                          )}
                          <button className="link-button" onClick={() => showHistory(s.id)}>
                            {open === s.id ? "Hide history" : "History"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open === s.id && (
                      <tr key={`h${s.id}`}>
                        <td colSpan={7}>
                          <ul className="history-list">
                            {history.map((h, i) => (
                              <li key={i}>
                                {fmt(h.changed_at)} · <b>{h.status}</b>
                                {h.note ? ` · ${h.note}` : ""}{h.changed_by ? ` (${h.changed_by})` : ""}
                              </li>
                            ))}
                          </ul>
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
    </>
  );
}
