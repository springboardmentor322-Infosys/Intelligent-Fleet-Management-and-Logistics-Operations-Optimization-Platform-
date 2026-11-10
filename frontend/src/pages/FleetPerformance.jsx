import { useEffect, useState } from "react";
import { api } from "../api";

const TRIP_STATUSES = ["Planned", "In Progress", "Completed", "Cancelled"];
const noFilter = { start: "", end: "", vehicle: "", driver_id: "", status: "" };
const num = (n) => (n == null ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 }));

function query(f) {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
  return p.toString();
}

function Bars({ data, unit = "" }) {
  const entries = Object.entries(data || {});
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <p>No data for these filters.</p>;
  return (
    <div className="bars">
      {entries.map(([k, v]) => (
        <div className="bar-row" key={k}>
          <span>{k}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(v / max) * 100}%` }} /></div>
          <b>{num(v)}{unit}</b>
        </div>
      ))}
    </div>
  );
}

export default function FleetPerformance({ setError }) {
  const [d, setD] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [filters, setFilters] = useState(noFilter);

  async function load(f = filters) {
    try {
      setD(await api(`/analytics/fleet-performance?${query(f)}`));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    api("/drivers").then(setDrivers).catch((e) => setError(e.message));
  }, []);

  const setF = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  if (!d) return <p>Loading performance dashboard...</p>;
  const fs = d.fleet_summary, ds = d.driver_summary, u = d.utilisation, t = d.trips, dl = d.delivery, m = d.maintenance;

  const fleetCards = [
    ["Total vehicles", fs.total], ["Active vehicles", fs.active],
    ["Available vehicles", fs.available], ["Under maintenance", fs.in_maintenance],
  ];
  const driverCards = [
    ["Registered drivers", ds.total], ["Available drivers", ds.available],
    ["Drivers on trips", ds.on_trip], ["Drivers off duty", ds.off_duty],
  ];

  return (
    <>
      <section className="page-toolbar">
        <div>
          <h2>Fleet Performance</h2>
          <p>Vehicle use, trips, deliveries, drivers, maintenance and distance in one place.</p>
        </div>
      </section>

      <section className="panel">
        <form className="filters" onSubmit={(e) => { e.preventDefault(); load(filters); }}>
          <input type="date" title="From" value={filters.start} onChange={setF("start")} />
          <input type="date" title="To" value={filters.end} onChange={setF("end")} />
          <input placeholder="Vehicle number" value={filters.vehicle} onChange={setF("vehicle")} />
          <select value={filters.driver_id} onChange={setF("driver_id")}>
            <option value="">All drivers</option>
            {drivers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <select value={filters.status} onChange={setF("status")}>
            <option value="">All trip statuses</option>
            {TRIP_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="secondary-button" type="submit">Apply</button>
          <button className="secondary-button" type="button"
            onClick={() => { setFilters(noFilter); load(noFilter); }}>Clear</button>
        </form>
        <small>Dates filter trips by their scheduled start. The fleet and driver cards show the situation right now.</small>
      </section>

      <section className="stats-grid">
        {fleetCards.concat(driverCards).map(([k, v]) => (
          <article className="stat-card" key={k}><p>{k}</p><h2>{v}</h2></article>
        ))}
      </section>

      <section className="two-col">
        <div className="panel">
          <h3>Trip performance</h3>
          <Bars data={{ Completed: t.completed, Ongoing: t.ongoing, Planned: t.planned, Delayed: t.delayed, Cancelled: t.cancelled }} />
        </div>
        <div className="panel">
          <h3>Vehicle utilisation: {u.utilisation_pct == null ? "n/a" : `${u.utilisation_pct}%`}</h3>
          <Bars data={{ "In use": u.used, Available: u.available, "In maintenance": u.in_maintenance }} />
          <small>In use as a share of vehicles that are not in maintenance.</small>
        </div>
      </section>

      <section className="two-col">
        <div className="panel">
          <h3>Delivery performance: {dl.on_time_pct == null ? "no deliveries yet" : `${dl.on_time_pct}% on time`}</h3>
          <Bars data={{ Delivered: dl.delivered, "Delivered late": dl.delayed, "In transit": dl.in_transit, Cancelled: dl.cancelled }} />
        </div>
        <div className="panel">
          <h3>Maintenance</h3>
          <Bars data={{ Completed: m.completed, Pending: m.pending, Cancelled: m.cancelled }} />
          <small>Spent on completed work: {num(m.spent)}</small>
        </div>
      </section>

      <section className="panel">
        <h3>Distance travelled: {num(d.total_distance_km)} km</h3>
        <Bars data={d.distance_by_vehicle} unit=" km" />
        <small>From completed trips that recorded a distance.</small>
      </section>

      <section className="panel">
        <h3>Driver performance</h3>
        {d.drivers.length === 0 ? <p>No trips for these filters.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Driver</th><th>Completed trips</th><th>Deliveries</th><th>Delayed</th><th>On time</th><th>Distance (km)</th></tr></thead>
            <tbody>{d.drivers.map((r) => (
              <tr key={r.driver}>
                <td><b>{r.driver}</b></td><td>{r.completed_trips}</td><td>{r.deliveries}</td>
                <td>{r.delayed_deliveries}</td><td>{r.on_time_pct == null ? "—" : `${r.on_time_pct}%`}</td>
                <td>{num(r.distance_km)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="panel">
        <h3>Operational insights</h3>
        {d.insights.length === 0 ? <p>Nothing stands out for these filters.</p> : (
          <ul className="history-list">
            {d.insights.map((i, n) => <li key={n}><b>{i.kind}</b> · {i.message}</li>)}
          </ul>
        )}
      </section>
    </>
  );
}
