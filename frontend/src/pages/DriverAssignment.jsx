import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { fmt } from "../ui";
import Icon from "../Icons.jsx";

const blank = { trip_id: "", driver_id: "", vehicle_id: "" };
const STATE_PILL = {
  Available: "pill-green", Assigned: "pill-blue", "On Trip": "pill-amber",
  "Off Duty": "pill-bad", "In Maintenance": "pill-bad",
};
const TRIP_PILL = { Planned: "pill-blue", "In Progress": "pill-amber", Completed: "pill-green", Cancelled: "pill-grey" };

export default function DriverAssignment({ setError }) {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState(blank);
  const [showHistory, setShowHistory] = useState(false);
  const [note, setNote] = useState("");
  const [findDriver, setFindDriver] = useState("");
  const [findVehicle, setFindVehicle] = useState("");
  const formRef = useRef(null);

  async function load() {
    try {
      setData(await api("/assignments/overview"));
      setHistory(await api("/assignments/history"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  // Choosing a trip pre-fills its current driver and vehicle, which the user then changes.
  function pickTrip(id) {
    const t = data.planned_trips.find((x) => String(x.id) === id);
    setForm(t ? { trip_id: id, driver_id: String(t.driver_id), vehicle_id: String(t.vehicle_id) }
              : { ...form, trip_id: id });
  }

  async function submit(e) {
    e.preventDefault();
    setError(""); setNote("");
    try {
      const a = await api("/assignments", {
        method: "POST",
        body: {
          trip_id: Number(form.trip_id), driver_id: Number(form.driver_id),
          vehicle_id: Number(form.vehicle_id),
        },
      });
      setNote(`${a.driver} and ${a.vehicle} assigned to trip #${a.trip_id}.`);
      setForm(blank);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!data) return <p>Loading assignments...</p>;
  const s = data.stats;
  const cards = [
    ["Total Drivers", s.drivers, "blue", "drivers", `${s.drivers_on_trip} on trip · ${s.drivers_off_duty} off duty`],
    ["Available Drivers", s.drivers_available, "green", "assignment", "ready to be assigned"],
    ["Available Vehicles", s.vehicles_available, "amber", "vehicles", `${s.vehicles_in_maintenance} in maintenance`],
    ["Active Assignments", s.active_assignments, "red", "trips", "planned and in progress"],
  ];
  const pill = (state) => <span className={`status-pill ${STATE_PILL[state] || ""}`}>{state}</span>;
  const match = (text, ...fields) =>
    !text.trim() || fields.some((f) => String(f || "").toLowerCase().includes(text.trim().toLowerCase()));
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  return (
    <>
      <section className="page-toolbar">
        <div>
          <h2>Driver Assignment</h2>
          <p>Assign available drivers to vehicles and trips without double-booking either.</p>
        </div>
        <button className="primary-button"
          onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
          + Assign Driver
        </button>
      </section>

      <section className="stats-grid stats-4">
        {cards.map(([t, v, tone, icon, sub]) => (
          <article className={`stat-card tone-${tone}`} key={t}>
            <span className="card-icon"><Icon name={icon} size={26} /></span>
            <p>{t}</p><h2>{v}</h2><small>{sub}</small>
          </article>
        ))}
      </section>

      {note && <div className="note-message">{note}</div>}

      <section className="assign-layout">
        <form className="panel assign-form" onSubmit={submit} ref={formRef}>
          <h3><Icon name="drivers" size={20} /> Assign Driver</h3>
          <label><span>Driver <span className="req">*</span></span>
            <select required value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
              <option value="">Select driver...</option>
              {data.drivers.filter((d) => d.state !== "Off Duty").map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.state})</option>
              ))}
            </select>
          </label>
          <label><span>Vehicle <span className="req">*</span></span>
            <select required value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}>
              <option value="">Select vehicle...</option>
              {data.vehicles.filter((v) => v.state !== "In Maintenance").map((v) => (
                <option key={v.id} value={v.id}>{v.registration_number} · {v.vehicle_type} ({v.state})</option>
              ))}
            </select>
          </label>
          <label><span>Trip <span className="req">*</span></span>
            <select required value={form.trip_id} onChange={(e) => pickTrip(e.target.value)}>
              <option value="">Select a planned trip...</option>
              {data.planned_trips.map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.id} · {t.origin} → {t.destination} · {fmt(t.scheduled_start)}
                </option>
              ))}
            </select>
          </label>
          <label>Assignment Date
            <input readOnly value={today} />
          </label>
          <div className="slide-actions">
            <button className="secondary-button" type="button" onClick={() => setForm(blank)}>Reset</button>
            <button className="primary-button" type="submit">Assign</button>
          </div>
          <small>
            Drivers who are off duty and vehicles in maintenance are not offered. The server also refuses
            overlapping trips and loads above the vehicle's capacity. The assignment date is recorded when you assign.
          </small>
        </form>

        <div className="panel">
          <div className="panel-head">
            <h3>Current Assignments</h3>
            <button className="secondary-button" type="button" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? "Hide History" : "View History"}
            </button>
          </div>
          {data.current.length === 0 ? <p>No active assignments.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Driver</th><th>Vehicle</th><th>Trip</th><th>Start</th><th>Status</th></tr></thead>
                <tbody>
                  {data.current.map((c, i) => (
                    <tr key={c.trip_id}>
                      <td>{i + 1}</td><td>{c.driver}</td><td>{c.vehicle}</td>
                      <td>#{c.trip_id}<br /><small>{c.origin} → {c.destination}</small></td>
                      <td>{fmt(c.scheduled_start)}</td>
                      <td><span className={`status-pill ${TRIP_PILL[c.status] || ""}`}>{c.status === "In Progress" ? "On Trip" : c.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {showHistory && (
        <section className="panel">
          <h3>Assignment history</h3>
          {history.length === 0 ? <p>No assignments made here yet.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Driver</th><th>Vehicle</th><th>Trip</th><th>By</th><th>Completion status</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>{fmt(h.assigned_at)}</td><td>{h.driver}</td><td>{h.vehicle}</td>
                      <td>#{h.trip_id} · {h.origin} → {h.destination}</td><td>{h.assigned_by || "—"}</td>
                      <td><span className={`status-pill ${TRIP_PILL[h.trip_status] || ""}`}>{h.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="two-col">
        <div className="panel">
          <div className="panel-head">
            <h3>Drivers ({data.drivers.length})</h3>
            <input className="mini-search" placeholder="Search driver..." value={findDriver}
              onChange={(e) => setFindDriver(e.target.value)} />
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Licence No.</th><th>Status</th></tr></thead>
            <tbody>{data.drivers.filter((d) => match(findDriver, d.name, d.license_number, d.phone)).map((d) => (
              <tr key={d.id}><td>{d.name}<br /><small>{d.phone}</small></td><td>{d.license_number}</td><td>{pill(d.state)}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Vehicles ({data.vehicles.length})</h3>
            <input className="mini-search" placeholder="Search vehicle..." value={findVehicle}
              onChange={(e) => setFindVehicle(e.target.value)} />
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Vehicle No.</th><th>Type</th><th>Capacity</th><th>Status</th></tr></thead>
            <tbody>{data.vehicles.filter((v) => match(findVehicle, v.registration_number, v.vehicle_type)).map((v) => (
              <tr key={v.id}><td>{v.registration_number}</td><td>{v.vehicle_type}</td><td>{v.capacity} kg</td><td>{pill(v.state)}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      </section>
    </>
  );
}
