import { useEffect, useState } from "react";
import { api } from "../api";

function Bars({ data }) {
  const entries = Object.entries(data || {});
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <p>No data yet.</p>;
  return (
    <div className="bars">
      {entries.map(([k, v]) => (
        <div className="bar-row" key={k}>
          <span>{k}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ user, canEdit, go, setError }) {
  const [s, setS] = useState(null);

  useEffect(() => {
    api("/dashboard/stats").then(setS).catch((e) => setError(e.message));
  }, []);

  if (!s) return <p>Loading dashboard...</p>;

  const cards = [
    ["Total fleet", s.total_fleet],
    ["Active vehicles", s.active_vehicles],
    ["Vehicles in maintenance", s.in_maintenance],
    ["Unassigned drivers", s.unassigned_drivers],
    ["Trips in progress", s.trips_by_status?.["In Progress"] || 0],
    ["Planned trips", s.trips_by_status?.Planned || 0],
    ["Delayed trips", s.delayed_trips ?? 0],
    ["Shipments in transit", (s.shipments_by_status?.["In Transit"] || 0) + (s.shipments_by_status?.Delayed || 0)],
  ];

  return (
    <>
      <section className="welcome">
        <h2>Welcome back, {user.username}!</h2>
        <p>Monitor your fleet and daily operations.</p>
      </section>
      <section className="stats-grid">
        {cards.map(([t, v]) => (
          <article className="stat-card" key={t}>
            <p>{t}</p><h2>{v}</h2><small>Live FleetFlow data</small>
          </article>
        ))}
      </section>
      <section className="two-col">
        <div className="panel"><h3>Vehicle status</h3><Bars data={s.by_status} /></div>
        <div className="panel"><h3>Vehicle types</h3><Bars data={s.by_type} /></div>
      </section>
      <section className="two-col">
        <div className="panel">
          <h3>Trips by status</h3>
          <Bars data={s.trips_by_status} />
        </div>
        <div className="panel">
          <h3>Shipments by status</h3>
          <Bars data={s.shipments_by_status} />
        </div>
      </section>
      <section className="panel">
        <h3>Quick actions</h3>
        <button className="primary-button" onClick={() => go("Vehicles")}>
          {canEdit ? "Manage vehicles" : "View vehicles"}
        </button>{" "}
        <button className="secondary-button" onClick={() => go("Drivers")}>
          {canEdit ? "Manage drivers" : "View drivers"}
        </button>{" "}
        <button className="secondary-button" onClick={() => go("Trips")}>
          Trips &amp; dispatch
        </button>{" "}
        <button className="secondary-button" onClick={() => go("Shipments")}>
          Shipments
        </button>
      </section>
    </>
  );
}
