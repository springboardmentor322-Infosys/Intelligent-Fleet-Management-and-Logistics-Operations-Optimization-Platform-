import { useEffect, useState } from "react";
import { api } from "../api";

const TYPES = ["Truck", "Van", "Trailer", "Car", "Pickup", "Bus"];
const FUELS = ["Diesel", "Petrol", "CNG", "Electric", "Hybrid"];
const STATUSES = ["Active", "Idle", "In Maintenance"];
const blank = {
  registration_number: "", vehicle_type: "Truck",
  capacity: "", fuel_type: "Diesel", status: "Idle",
};

export default function Vehicles({ canEdit, setError }) {
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [filters, setFilters] = useState({ q: "", status: "", type: "" });
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);

  async function load() {
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    if (filters.status) p.set("status", filters.status);
    if (filters.type) p.set("vehicle_type", filters.type);
    try {
      setVehicles(await api(`/vehicles?${p}`));
      setDrivers(await api("/drivers"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, [filters]);

  async function save(e) {
    e.preventDefault();
    setError("");
    try {
      await api(editing ? `/vehicles/${editing}` : "/vehicles", {
        method: editing ? "PUT" : "POST",
        body: { ...form, capacity: Number(form.capacity) },
      });
      cancel();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function cancel() {
    setShow(false);
    setEditing(null);
    setForm(blank);
  }

  function edit(v) {
    setEditing(v.id);
    setForm({
      registration_number: v.registration_number, vehicle_type: v.vehicle_type,
      capacity: String(v.capacity), fuel_type: v.fuel_type, status: v.status,
    });
    setShow(true);
  }

  async function remove(id) {
    if (!window.confirm("Delete this vehicle?")) return;
    try { await api(`/vehicles/${id}`, { method: "DELETE" }); load(); }
    catch (e) { setError(e.message); }
  }

  async function assign(vehicleId, driverId) {
    setError("");
    try {
      await api(
        `/vehicles/${vehicleId}/assign-driver${driverId ? "/" + driverId : ""}`,
        { method: driverId ? "PUT" : "DELETE" }
      );
      load();
    } catch (e) { setError(e.message); }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <section className="page-toolbar">
        <div><h2>Vehicle Registry</h2><p>Manage the vehicles in your fleet.</p></div>
        {canEdit && (
          <button className="primary-button" onClick={() => { setForm(blank); setEditing(null); setShow(true); }}>
            + Register vehicle
          </button>
        )}
      </section>

      {show && (
        <form className="panel form-grid" onSubmit={save}>
          <h3>{editing ? "Edit vehicle" : "Register a vehicle"}</h3>
          <label>Registration number
            <input required maxLength={20} value={form.registration_number}
              onChange={set("registration_number")} placeholder="e.g. WB12AB1234" />
          </label>
          <label>Vehicle type
            <select value={form.vehicle_type} onChange={set("vehicle_type")}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>Capacity (kg)
            <input required type="number" min="1" step="any" value={form.capacity}
              onChange={set("capacity")} />
          </label>
          <label>Fuel type
            <select value={form.fuel_type} onChange={set("fuel_type")}>
              {FUELS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>Status
            <select value={form.status} onChange={set("status")}>
              {STATUSES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <div>
            <button className="primary-button" type="submit">{editing ? "Update" : "Save"}</button>{" "}
            <button className="secondary-button" type="button" onClick={cancel}>Cancel</button>
          </div>
        </form>
      )}

      <section className="panel">
        <div className="filters">
          <input placeholder="Search registration..." value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <select value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
            <option value="">All types</option>
            {TYPES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        {vehicles.length === 0 ? <p>No vehicles found.</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>ID</th><th>Registration</th><th>Type</th><th>Capacity (kg)</th>
                  <th>Fuel</th><th>Status</th><th>Driver</th>{canEdit && <th>Actions</th>}</tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td>{v.id}</td><td>{v.registration_number}</td><td>{v.vehicle_type}</td>
                    <td>{v.capacity}</td><td>{v.fuel_type}</td>
                    <td><span className="status-pill">{v.status}</span></td>
                    <td>
                      {canEdit ? (
                        <select value={v.assigned_driver_id || ""}
                          onChange={(e) => assign(v.id, e.target.value)}>
                          <option value="">Unassigned</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}
                              disabled={d.vehicle_id && d.vehicle_id !== v.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      ) : (v.driver_name || "—")}
                    </td>
                    {canEdit && (
                      <td>
                        <button className="secondary-button" onClick={() => edit(v)}>Edit</button>
                        <button className="secondary-button" onClick={() => remove(v.id)}>Delete</button>
                      </td>
                    )}
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
