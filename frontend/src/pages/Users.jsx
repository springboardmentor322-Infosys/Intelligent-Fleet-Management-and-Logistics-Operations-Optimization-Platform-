import { useEffect, useState } from "react";
import { api } from "../api";

const ROLES = ["admin", "fleet_manager", "dispatcher", "driver"];
const blank = { username: "", email: "", password: "", role: "dispatcher" };

export default function Users({ me, setError }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(blank);
  const [show, setShow] = useState(false);

  async function load() {
    try { setUsers(await api("/users")); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/users", { method: "POST", body: form });
      setForm(blank);
      setShow(false);
      load();
    } catch (err) { setError(err.message); }
  }

  async function update(id, patch) {
    setError("");
    try { await api(`/users/${id}`, { method: "PUT", body: patch }); load(); }
    catch (e) { setError(e.message); }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <section className="page-toolbar">
        <div><h2>Users &amp; Roles</h2><p>Create accounts and manage access.</p></div>
        <button className="primary-button" onClick={() => setShow(true)}>+ Create user</button>
      </section>

      {show && (
        <form className="panel form-grid" onSubmit={create}>
          <h3>Create a user</h3>
          <label>Username<input required minLength={3} value={form.username} onChange={set("username")} /></label>
          <label>Email<input required type="email" value={form.email} onChange={set("email")} /></label>
          <label>Password (min 8 chars)
            <input required type="password" minLength={8} value={form.password} onChange={set("password")} />
          </label>
          <label>Role
            <select value={form.role} onChange={set("role")}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <div>
            <button className="primary-button" type="submit">Create</button>{" "}
            <button className="secondary-button" type="button" onClick={() => setShow(false)}>Cancel</button>
          </div>
        </form>
      )}

      <section className="panel table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td><td>{u.username}</td><td>{u.email}</td>
                <td>
                  <select value={u.role} disabled={u.id === me.id}
                    onChange={(e) => update(u.id, { role: e.target.value })}>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td>
                  <button className="secondary-button" disabled={u.id === me.id}
                    onClick={() => update(u.id, { is_active: !u.is_active })}>
                    {u.is_active ? "Active — deactivate" : "Inactive — activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
