import { useEffect, useState } from "react";
import { api } from "../api";
import Icon from "../Icons.jsx";
import { EmptyState, LoadingState } from "../ui.jsx";

function Bars({ data }) {
  const entries = Object.entries(data || {});
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <EmptyState title="No data yet" />;
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

  if (!s) return <LoadingState rows={4} />;

  const cards = [
    ["Total fleet", s.total_fleet, "vehicles", "blue"],
    ["Active vehicles", s.active_vehicles, "tracking", "green"],
    ["Vehicles in maintenance", s.in_maintenance, "maintenance", "amber"],
    ["Unassigned drivers", s.unassigned_drivers, "drivers", "blue"],
    ["Trips in progress", s.trips_by_status?.["In Progress"] || 0, "trips", "green"],
    ["Planned trips", s.trips_by_status?.Planned || 0, "assignment", "blue"],
    ["Delayed trips", s.delayed_trips ?? 0, "alerts", "red"],
    ["Shipments in transit", (s.shipments_by_status?.["In Transit"] || 0) + (s.shipments_by_status?.Delayed || 0), "shipments", "amber"],
  ];

  return (
    <>
      <section className="welcome">
        <h2>Welcome back, {user.username}!</h2>
        <p>Here is how your fleet looks right now.</p>
      </section>
      <section className="stats-grid">
        {cards.map(([t, v, icon, tone]) => (
          <article className={`stat-card tone-${tone}`} key={t}>
            <span className="card-icon"><Icon name={icon} size={22} /></span>
            <p>{t}</p><h2>{v}</h2>
          </article>
        ))}
      </section>
      <section className="two-col">
        <div className="panel"><h3>Vehicle status</h3><Bars data={s.by_status} /></div>
        <div className="panel"><h3>Vehicle types</h3><Bars data={s.by_type} /></div>
      </section>
      <section className="two-col">
        <div className="panel"><h3>Trips by status</h3><Bars data={s.trips_by_status} /></div>
        <div className="panel"><h3>Shipments by status</h3><Bars data={s.shipments_by_status} /></div>
      </section>
      <section className="panel">
        <h3>Quick actions</h3>
        <div className="row-actions">
          <button className="primary-button" onClick={() => go("Vehicles")}>
            {canEdit ? "Manage vehicles" : "View vehicles"}
          </button>
          <button className="secondary-button" onClick={() => go("Drivers")}>
            {canEdit ? "Manage drivers" : "View drivers"}
          </button>
          <button className="secondary-button" onClick={() => go("Trips")}>Trips &amp; dispatch</button>
          <button className="secondary-button" onClick={() => go("Shipments")}>Shipments</button>
        </div>
      </section>
    </>
  );
}
