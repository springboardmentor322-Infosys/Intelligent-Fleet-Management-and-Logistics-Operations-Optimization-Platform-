import { useState } from "react";
import { api, setToken } from "../api";

export default function Login({ onLogin, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setToken(data.access_token);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-side">
        <h1 className="logo">Fleet<span>Flow</span></h1>
        <p>Fleet Management &amp; Logistics Tracking Platform</p>
        <ul>
          <li>Vehicle Management</li>
          <li>Driver Management</li>
          <li>Real-Time Tracking</li>
          <li>Analytics &amp; Reports</li>
        </ul>
      </div>
      <form className="login-form" onSubmit={submit}>
        <h2>Welcome Back</h2>
        <p>Login to your FleetFlow account</p>
        {error && <div className="error-message">{error}</div>}
        <label>
          Email Address
          <input type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" />
        </label>
        <label>
          Password
          <input type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
        </label>
        <button className="primary-button" disabled={busy}>
          {busy ? "Signing in..." : "Login"}
        </button>
        <small>Don't have an account? Contact your administrator.</small>
        <button type="button" className="link-button" onClick={onBack}>
          ← Back to home
        </button>
      </form>
    </div>
  );
}
