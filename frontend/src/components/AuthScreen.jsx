import React, { useState } from 'react';
import { apiRequest, setStoredToken } from '../api';

const ROLE_HELP = {
  admin: 'Full workspace control, team access and system settings.',
  fleet_manager: 'Manage vehicles, drivers, trips and maintenance across your fleet.',
  dispatcher: 'Plan deliveries, assign drivers and keep routes moving.',
  driver: 'View your assigned vehicle and trips, then update delivery progress.'
};

export default function AuthScreen({ onAuthenticated, onToast }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('fleet_manager');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isRegister = mode === 'register';

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = isRegister
        ? { name, email, password, role }
        : { email, password };
      const result = await apiRequest(
        isRegister ? '/api/auth/register' : '/api/auth/login',
        { method: 'POST', body: JSON.stringify(payload) },
        ''
      );
      setStoredToken(result.token, remember);
      onAuthenticated(result.user, result.token);
      onToast(
        isRegister
          ? `Welcome to FleetFlow, ${result.user.name}.`
          : `Welcome back, ${result.user.name}.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={`auth-screen ${isRegister ? 'register-mode' : ''}`}>
      <div className="auth-story">
        <div className="auth-brand">
          <span className="auth-brand-mark">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M5 22.5 12.5 7l4.2 9 3-5 7.3 11.5H5Z" />
              <path d="M4 25h24" />
            </svg>
          </span>
          fleet<span>flow</span>
        </div>
        <div className="story-copy">
          <div className="story-eyebrow">
            <i /> FLEET OPERATIONS, IN FOCUS
          </div>
          <h1>
            Every mile.
            <br />
            <em>Under control.</em>
          </h1>
          <p>One clear picture of your vehicles, people and deliveries.</p>
          <div className="login-proof">
            <span>
              <b>01</b> Live fleet status
            </span>
            <span>
              <b>02</b> Connected teams
            </span>
            <span>
              <b>03</b> Better decisions
            </span>
          </div>
        </div>
        <div className="story-art" aria-hidden="true">
          <div className="art-grid" />
          <div className="art-route">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="art-glow" />
          <div className="login-cartoon-truck cartoon-truck">
            <i className="truck-cargo" />
            <i className="truck-cab">
              <b />
            </i>
            <i className="truck-wheel wheel-a" />
            <i className="truck-wheel wheel-b" />
          </div>
          <div className="login-cartoon-van cartoon-van">
            <i className="van-window" />
            <i className="truck-wheel wheel-a" />
            <i className="truck-wheel wheel-b" />
          </div>
          <div className="vehicle-caption">
            <i /> NORTHSTAR FLEET <span>·</span> LIVE OPERATIONS
          </div>
          <div className="art-coordinate">12°58' N&nbsp;&nbsp; 77°35' E</div>
        </div>
        <div className="story-bottom">
          <span>Fleet operations, with a little more clarity.</span>
          <span>01 — 04</span>
        </div>
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
      </div>

      <div className="auth-form-side">
        <div key={mode} className="auth-form-wrap auth-smooth-enter">
          <div className="mobile-auth-brand">
            fleet<span>flow</span>
          </div>
          <div className="auth-kicker">
            {isRegister ? 'A GOOD PLACE TO GET MOVING' : 'YOUR WORKSPACE IS READY'}
          </div>
          <h2>{isRegister ? 'Make it yours.' : 'Welcome back.'}</h2>
          <p className="auth-intro">
            {isRegister
              ? 'Set up your workspace and choose how you’ll use FleetFlow.'
              : 'Sign in to pick up where your team left off.'}
          </p>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${!isRegister ? 'selected' : ''}`}
              onClick={() => switchMode('login')}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`auth-tab ${isRegister ? 'selected' : ''}`}
              onClick={() => switchMode('register')}
            >
              Create account
            </button>
          </div>

          <form className="auth-fields" onSubmit={handleSubmit}>
            {isRegister && (
              <div className="auth-field">
                <label htmlFor="auth-name">Your name</label>
                <div className="input-shell">
                  <span>♙</span>
                  <input
                    id="auth-name"
                    name="name"
                    autoComplete="name"
                    placeholder="e.g. Alex Morgan"
                    minLength={2}
                    maxLength={80}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-email">Work email</label>
              <div className="input-shell">
                <span>✉</span>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <div className="input-shell">
                <span>⌑</span>
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="reveal-password"
                  type="button"
                  aria-label="Show password"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  ◉
                </button>
              </div>
            </div>

            {isRegister && (
              <div className="auth-field role-select-wrap">
                <label htmlFor="role-select">Choose your role</label>
                <div className="input-shell role-select-shell">
                  <span>♙</span>
                  <select
                    id="role-select"
                    name="role"
                    required
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="fleet_manager">Fleet Manager</option>
                    <option value="admin">Administrator</option>
                    <option value="dispatcher">Dispatcher</option>
                    <option value="driver">Driver</option>
                  </select>
                  <b aria-hidden="true">⌄</b>
                </div>
                <small>{ROLE_HELP[role] || ROLE_HELP.fleet_manager}</small>
              </div>
            )}

            {!isRegister && (
              <div className="auth-extras">
                <label className="remember-choice">
                  <input
                    type="checkbox"
                    name="remember"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span /> Keep me signed in
                </label>
                <button
                  type="button"
                  className="forgot-password"
                  onClick={() => onToast('Ask your workspace administrator to reset your password.')}
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button className="auth-submit" type="submit" disabled={loading}>
              <span>
                {loading
                  ? isRegister
                    ? 'Setting up your account…'
                    : 'Signing you in…'
                  : isRegister
                  ? 'Create my account'
                  : 'Sign in to your workspace'}
              </span>
              <i>→</i>
            </button>
            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
          </form>

          <div className="auth-switch">
            {isRegister ? (
              <>
                Already have an account?{' '}
                <button type="button" onClick={() => switchMode('login')}>
                  Sign in <span>→</span>
                </button>
              </>
            ) : (
              <>
                New to FleetFlow?{' '}
                <button type="button" onClick={() => switchMode('register')}>
                  Create an account <span>→</span>
                </button>
              </>
            )}
          </div>
          <div className="auth-safe">
            <span>⌑</span> Your workspace is private and secure.
          </div>
        </div>
        <div className="auth-corner">NORTHSTAR LOGISTICS <i>·</i> BENGALURU, IN</div>
      </div>
    </section>
  );
}
