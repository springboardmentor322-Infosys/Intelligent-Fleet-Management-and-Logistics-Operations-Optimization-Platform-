import { useState } from "react";
import { api } from "../api";

export default function Profile({ user, setUser, setError }) {
  const [p, setP] = useState({ username: user.username, email: user.email });
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [note, setNote] = useState("");

  async function saveProfile(e) {
    e.preventDefault();
    setError(""); setNote("");
    try {
      setUser(await api("/auth/me", { method: "PUT", body: p }));
      setNote("Profile updated.");
    } catch (err) { setError(err.message); }
  }

  async function changePassword(e) {
    e.preventDefault();
    setError(""); setNote("");
    try {
      await api("/auth/change-password", { method: "POST", body: pw });
      setPw({ current_password: "", new_password: "" });
      setNote("Password updated.");
    } catch (err) { setError(err.message); }
  }

  return (
    <>
      {note && <div className="note-message">{note}</div>}
      <form className="panel form-grid" onSubmit={saveProfile}>
        <h3>Profile ({user.role})</h3>
        <label>Username
          <input required minLength={3} value={p.username} onChange={(e) => setP({ ...p, username: e.target.value })} />
        </label>
        <label>Email
          <input required type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} />
        </label>
        <div><button className="primary-button">Save profile</button></div>
      </form>
      <form className="panel form-grid" onSubmit={changePassword}>
        <h3>Change password</h3>
        <label>Current password
          <input required type="password" value={pw.current_password}
            onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
        </label>
        <label>New password (min 8 chars)
          <input required type="password" minLength={8} value={pw.new_password}
            onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
        </label>
        <div><button className="primary-button">Update password</button></div>
      </form>
    </>
  );
}
