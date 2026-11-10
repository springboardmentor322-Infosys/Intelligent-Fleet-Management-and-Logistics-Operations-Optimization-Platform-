import { useEffect, useState } from "react";
import { api, download } from "../api";

const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ vehicle_id: "", fuel_type: "", quantity_litres: "", price_per_litre: "", fueled_on: today() });
const noFilter = { vehicle: "", fuel_type: "", start: "", end: "" };
const money = (n) => (n == null ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }));

function query(f) {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
  return p.toString();
}

function Bars({ data, unit = "" }) {
  const entries = Object.entries(data || {});
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <p>No data yet.</p>;
  return (
    <div className="bars">
      {entries.map(([k, v]) => (
        <div className="bar-row" key={k}>
          <span>{k}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(v / max) * 100}%` }} /></div>
          <b>{money(v)}{unit}</b>
        </div>
      ))}
    </div>
  );
}

export default function Fuel({ setError }) {
  const [vehicles, setVehicles] = useState([]);
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState(noFilter);
  const [form, setForm] = useState(blank());
  const [show, setShow] = useState(false);
  const [note, setNote] = useState("");

  async function load(f = filters) {
    try {
      setVehicles(await api("/vehicles"));
      setRecords(await api(`/fuel?${query(f)}`));
      setStats(await api(`/fuel/analytics?${query(f)}`));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  const setF = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Choosing a vehicle fills in its own fuel type, which can still be changed.
  function pickVehicle(id) {
    const v = vehicles.find((x) => String(x.id) === id);
    setForm({ ...form, vehicle_id: id, fuel_type: v ? v.fuel_type : "" });
  }

  const total = (Number(form.quantity_litres) || 0) * (Number(form.price_per_litre) || 0);

  async function save(e) {
    e.preventDefault();
    setError(""); setNote("");
    try {
      await api("/fuel", {
        method: "POST",
        body: {
          vehicle_id: Number(form.vehicle_id), fuel_type: form.fuel_type || null,
          quantity_litres: Number(form.quantity_litres),
          price_per_litre: Number(form.price_per_litre), fueled_on: form.fueled_on || null,
        },
      });
      setNote("Fuel record saved.");
      setForm(blank());
      setShow(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(r) {
    if (!window.confirm(`Delete the ${r.fueled_on} fuel record for ${r.registration_number}?`)) return;
    try {
      await api(`/fuel/${r.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function exportReport(format) {
    setError("");
    try {
      await download(`/fuel/export?format=${format}&${query(filters)}`, `fuel-report.${format}`);
    } catch (e) {
      setError(e.message);
    }
  }

  const fleet = stats?.fleet;
  const cards = fleet && [
    ["Total fuel (L)", money(fleet.litres)],
    ["Total fuel cost", money(fleet.cost)],
    ["Average price / L", money(fleet.avg_price_per_litre)],
    ["Fleet efficiency (km/L)", fleet.km_per_litre ?? "n/a"],
    ["Highest expense", stats.highest_expense || "—"],
  ];
  const perVehicleCost = Object.fromEntries((stats?.per_vehicle || []).map((r) => [r.registration_number, r.cost]));
  const perVehicleKmpl = Object.fromEntries(
    (stats?.per_vehicle || []).filter((r) => r.km_per_litre != null).map((r) => [r.registration_number, r.km_per_litre]));

  return (
    <>
      <section className="page-toolbar">
        <div>
          <h2>Fuel Management</h2>
          <p>Record refuelling, then follow fuel use, expense and efficiency per vehicle.</p>
        </div>
        <button className="primary-button" onClick={() => setShow(true)}>+ Add fuel record</button>
      </section>

      {cards && (
        <section className="stats-grid">
          {cards.map(([t, v]) => <article className="stat-card" key={t}><p>{t}</p><h2>{v}</h2></article>)}
        </section>
      )}

      {note && <div className="note-message">{note}</div>}

      {show && (
        <form className="panel form-grid" onSubmit={save}>
          <h3>Add fuel record</h3>
          <label>Vehicle
            <select required value={form.vehicle_id} onChange={(e) => pickVehicle(e.target.value)}>
              <option value="">Select vehicle...</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number} · {v.vehicle_type}</option>)}
            </select>
          </label>
          <label>Fuel type
            <input maxLength={30} value={form.fuel_type} onChange={set("fuel_type")} />
          </label>
          <label>Quantity (litres)
            <input required type="number" min="0.01" step="any" value={form.quantity_litres} onChange={set("quantity_litres")} />
          </label>
          <label>Price per litre
            <input required type="number" min="0" step="any" value={form.price_per_litre} onChange={set("price_per_litre")} />
          </label>
          <label>Refuelling date
            <input required type="date" max={today()} value={form.fueled_on} onChange={set("fueled_on")} />
          </label>
          <label>Total expenditure
            <input readOnly value={money(total)} />
          </label>
          <div>
            <button className="primary-button" type="submit">Save</button>{" "}
            <button className="secondary-button" type="button" onClick={() => { setShow(false); setForm(blank()); }}>Cancel</button>
          </div>
        </form>
      )}

      <section className="panel">
        <form className="filters" onSubmit={(e) => { e.preventDefault(); load(filters); }}>
          <input placeholder="Vehicle number" value={filters.vehicle} onChange={setF("vehicle")} />
          <input placeholder="Fuel type" value={filters.fuel_type} onChange={setF("fuel_type")} />
          <input type="date" title="From" value={filters.start} onChange={setF("start")} />
          <input type="date" title="To" value={filters.end} onChange={setF("end")} />
          <button className="secondary-button" type="submit">Apply</button>
          <button className="secondary-button" type="button"
            onClick={() => { setFilters(noFilter); load(noFilter); }}>Clear</button>
          <button className="secondary-button" type="button" onClick={() => exportReport("xlsx")}>Export Excel</button>
          <button className="secondary-button" type="button" onClick={() => exportReport("pdf")}>Export PDF</button>
        </form>
      </section>

      {stats && (
        <>
          <section className="two-col">
            <div className="panel"><h3>Fuel cost per vehicle</h3><Bars data={perVehicleCost} /></div>
            <div className="panel"><h3>Efficiency (km per litre)</h3>
              <Bars data={perVehicleKmpl} />
              <small>Shown only for vehicles with completed trips that recorded a distance.</small>
            </div>
          </section>
          <section className="panel"><h3>Cost by month</h3><Bars data={stats.by_month} /></section>
          <section className="panel">
            <h3>Vehicle-wise consumption</h3>
            {stats.per_vehicle.length === 0 ? <p>No fuel records match.</p> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Vehicle</th><th>Litres</th><th>Cost</th><th>Distance (km)</th><th>km / L</th></tr></thead>
                <tbody>{stats.per_vehicle.map((r) => (
                  <tr key={r.registration_number}>
                    <td><b>{r.registration_number}</b>
                      {r.above_average_cost && <span className="delay-badge bad">High spend</span>}</td>
                    <td>{money(r.litres)}</td><td>{money(r.cost)}</td>
                    <td>{r.distance_km ?? "—"}</td><td>{r.km_per_litre ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        </>
      )}

      <section className="panel">
        <h3>Fuel history</h3>
        {records.length === 0 ? <p>No fuel records found.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Vehicle</th><th>Fuel</th><th>Litres</th><th>Price/L</th><th>Total</th><th></th></tr></thead>
            <tbody>{records.map((r) => (
              <tr key={r.id}>
                <td>{r.fueled_on}</td><td>{r.registration_number}</td><td>{r.fuel_type}</td>
                <td>{money(r.quantity_litres)}</td><td>{money(r.price_per_litre)}</td><td>{money(r.total_cost)}</td>
                <td><button className="secondary-button" onClick={() => remove(r)}>Delete</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
