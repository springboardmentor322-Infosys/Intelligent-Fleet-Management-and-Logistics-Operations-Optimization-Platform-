import { useEffect, useState } from "react";
import { api } from "../api";
import { fmt } from "../ui";

const blank = { trip_id: "", driver_id: "", vehicle_id: "" };

export default function DriverAssignment({ setError }) {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState(blank);
  const [show, setShow] = useState(false);
  const [note, setNote] = useState("");

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
      setShow(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!data) return <p>Loading assignments...</p>;
  const s = data.stats;
  const cards = [
    ["Total drivers", s.drivers], ["Available drivers", s.drivers_available],
    ["Drivers on trip", s.drivers_on_trip], ["Drivers off duty", s.drivers_off_duty],
    ["Available vehicles", s.vehicles_available], ["Vehicles in maintenance", s.vehicles_in_maintenance],
    ["Active assignments", s.active_assignments],
  ];
  const pill = (state) =>
    <span className={`status-pill ${state === "Off Duty" || state === "In Maintenance" ? "pill-bad" : ""}`}>{state}</span>;

  return (
    <>
      <section className="page-toolbar">
        <div>
          <h2>Driver Assignment</h2>
          <p>Assign an available driver and vehicle to a planned trip without double-booking either.</p>
        </div>
        <button className="primary-button" onClick={() => setShow(true)}>+ Assign driver</button>
      </section>

      <section className="stats-grid">
        {cards.map(([t, v]) => <article className="stat-card" key={t}><p>{t}</p><h2>{v}</h2></article>)}
      </section>

      {note && <div className="note-message">{note}</div>}

      {show && (
        <form className="panel form-grid" onSubmit={submit}>
          <h3>Assign driver and vehicle</h3>
          <label>Trip
            <select required value={form.trip_id} onChange={(e) => pickTrip(e.target.value)}>
              <option value="">Select a planned trip...</option>
              {data.planned_trips.map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.id} · {t.origin} → {t.destination} · {fmt(t.scheduled_start)}
                </option>
              ))}
            </select>
          </label>
          <label>Driver
            <select required value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
              <option value="">Select driver...</option>
              {data.drivers.filter((d) => d.state !== "Off Duty").map((d) => (
                <option key={d.id} value={d.id}>{d.name} · {d.state}</option>
              ))}
            </select>
          </label>
          <label>Vehicle
            <select required value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}>
              <option value="">Select vehicle...</option>
              {data.vehicles.filter((v) => v.state !== "In Maintenance").map((v) => (
                <option key={v.id} value={v.id}>{v.registration_number} · {v.vehicle_type} · {v.state}</option>
              ))}
            </select>
          </label>
          <div>
            <button className="primary-button" type="submit">Assign</button>{" "}
            <button className="secondary-button" type="button" onClick={() => { setShow(false); setForm(blank); }}>Cancel</button>
          </div>
          <small style={{ gridColumn: "1 / -1" }}>
            Drivers who are off duty and vehicles in maintenance are not offered. The server also refuses
            overlapping trips and loads above the vehicle's capacity.
          </small>
        </form>
      )}

      <section className="panel">
        <h3>Current assignments</h3>
        {data.current.length === 0 ? <p>No active assignments.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Trip</th><th>Route</th><th>Driver</th><th>Vehicle</th><th>Start</th><th>Status</th></tr></thead>
              <tbody>
                {data.current.map((c) => (
                  <tr key={c.trip_id}>
                    <td>#{c.trip_id}</td><td>{c.origin} → {c.destination}</td>
                    <td>{c.driver}</td><td>{c.vehicle}</td>
                    <td>{fmt(c.scheduled_start)}</td><td><span className="status-pill">{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="two-col">
        <div className="panel">
          <h3>Drivers</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Licence</th><th>State</th></tr></thead>
            <tbody>{data.drivers.map((d) => (
              <tr key={d.id}><td>{d.name}<br /><small>{d.phone}</small></td><td>{d.license_number}</td><td>{pill(d.state)}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
        <div className="panel">
          <h3>Vehicles</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Vehicle</th><th>Capacity</th><th>State</th></tr></thead>
            <tbody>{data.vehicles.map((v) => (
              <tr key={v.id}><td>{v.registration_number}<br /><small>{v.vehicle_type}</small></td><td>{v.capacity} kg</td><td>{pill(v.state)}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      </section>

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
                    <td><span className="status-pill">{h.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
