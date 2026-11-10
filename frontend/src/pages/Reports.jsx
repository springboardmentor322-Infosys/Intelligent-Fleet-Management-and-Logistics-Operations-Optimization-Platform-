import { useState } from "react";
import { download } from "../api";

// Each report is downloaded from the module that owns its numbers.
const REPORTS = [
  { title: "Fleet utilisation", text: "Vehicles in use, available and in maintenance, trips and distance.",
    path: "/reports/fleet-utilisation/export", dates: true },
  { title: "Fuel consumption", text: "Every refuelling with litres, price, cost and fleet efficiency.",
    path: "/fuel/export", dates: true },
  { title: "Driver performance", text: "Completed trips, deliveries, delays, on-time rate and distance per driver.",
    path: "/reports/driver-performance/export", dates: true },
  { title: "Delivery performance", text: "Delivered, late, in transit and cancelled shipments with on-time rate.",
    path: "/reports/delivery-performance/export", dates: true },
  { title: "Maintenance", text: "Scheduled, completed, pending and overdue work with costs.",
    path: "/maintenance/report/export", dates: true },
];

export default function Reports({ setError }) {
  const [range, setRange] = useState({ start: "", end: "" });
  const [busy, setBusy] = useState("");

  async function get(r, format) {
    setError("");
    setBusy(`${r.title}-${format}`);
    const p = new URLSearchParams({ format });
    if (range.start) p.set("start", range.start);
    if (range.end) p.set("end", range.end);
    try {
      await download(`${r.path}?${p}`, `${r.title.toLowerCase().replace(/\s+/g, "-")}.${format}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <section className="page-toolbar">
        <div>
          <h2>Reports</h2>
          <p>Download fleet reports as Excel or PDF files for a date range.</p>
        </div>
      </section>
      <section className="panel">
        <form className="filters" onSubmit={(e) => e.preventDefault()}>
          <label>From <input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} /></label>
          <label>To <input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} /></label>
          <small>Leave empty for all records.</small>
        </form>
      </section>
      <section className="stats-grid">
        {REPORTS.map((r) => (
          <article className="stat-card" key={r.title}>
            <h3>{r.title}</h3>
            <p>{r.text}</p>
            <div className="row-actions">
              <button className="primary-button" disabled={!!busy} onClick={() => get(r, "xlsx")}>
                {busy === `${r.title}-xlsx` ? "Preparing..." : "Excel"}
              </button>
              <button className="secondary-button" disabled={!!busy} onClick={() => get(r, "pdf")}>
                {busy === `${r.title}-pdf` ? "Preparing..." : "PDF"}
              </button>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
