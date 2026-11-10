import { useEffect, useState } from "react";
import { api } from "../api";

const blank = { name: "", license_number: "", phone: "" };

export default function Drivers({ canEdit, setError, onOpen }) {
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState(blank);
  const [show, setShow] = useState(false);
  const [note, setNote] = useState("");

  async function load() {
    try { setDrivers(await api("/drivers")); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/drivers", { method: "POST", body: form });
      setForm(blank);
      setShow(false);
      load();
    } catch (err) { setError(err.message); }
  }

  async function attendance(d, status) {
    setError("");
    try {
      await api(`/drivers/${d.id}/attendance`, { method: "POST", body: { status } });
      setNote(`${d.name} marked ${status} for today.`);
    } catch (e) { setError(e.message); }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <section className="page-toolbar">
        <div><h2>Drivers</h2><p>Driver profiles, assignments and attendance.</p></div>
        {canEdit && (
          <button className="primary-button" onClick={() => setShow(true)}>+ Add driver</button>
        )}
      </section>

      {note && <div className="note-message">{note}</div>}

      {show && (
        <form className="panel form-grid" onSubmit={save}>
          <h3>Add a driver</h3>
          <label>Full name<input required value={form.name} onChange={set("name")} /></label>
          <label>Licence number
            <input required value={form.license_number} onChange={set("license_number")} />
          </label>
          <label>Phone<input required minLength={5} value={form.phone} onChange={set("phone")} /></label>
          <div>
            <button className="primary-button" type="submit">Save</button>{" "}
            <button className="secondary-button" type="button" onClick={() => setShow(false)}>Cancel</button>
          </div>
        </form>
      )}

      <section className="panel">
        {drivers.length === 0 ? <p>No drivers yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>ID</th><th>Name</th><th>Licence</th><th>Phone</th>
                  <th>Assigned vehicle</th>{onOpen && <th>Profile</th>}{canEdit && <th>Attendance (today)</th>}</tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.id}>
                    <td>{d.id}</td><td>{d.name}</td><td>{d.license_number}</td>
                    <td>{d.phone}</td><td>{d.vehicle || "Unassigned"}</td>
                    {onOpen && (
                      <td><button className="secondary-button" onClick={() => onOpen(d.id)}>View profile</button></td>
                    )}
                    {canEdit && (
                      <td>
                        {["Present", "Absent", "On Leave"].map((s) => (
                          <button key={s} className="secondary-button" onClick={() => attendance(d, s)}>{s}</button>
                        ))}
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
