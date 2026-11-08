
import { useState } from 'react'
import './login.css'

const API = 'http://127.0.0.1:8000'

function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const formData = new URLSearchParams()
      formData.append('username', username.trim())
      formData.append('password', password)

      const response = await fetch(`${API}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          typeof result.detail === 'string'
            ? result.detail
            : 'Invalid username or password'
        )
      }

      onLogin(result, rememberMe)
    } catch (err) {
      setError(err.message || 'Unable to connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="brand-logo">F</div>
        <h1>FleetFlow</h1>
        <p className="brand-tagline">
          Smart Fleet. Smarter Operations.
        </p>

        <div className="brand-content">
          <h2>Manage Your Fleet<br />With Confidence.</h2>
          <p>
            Track vehicles, manage drivers, monitor shipments
            and optimize your fleet operations from one platform.
          </p>
        </div>

        <div className="brand-footer">
          FLEETFLOW MANAGEMENT PLATFORM
        </div>
      </div>

      <div className="login-section">
        <div className="login-card">
          <div className="mobile-logo">
            <div className="brand-logo">F</div>
            <h2>FleetFlow</h2>
          </div>

          <div className="login-heading">
            <span className="welcome-text">WELCOME BACK</span>
            <h2>Sign in to your account</h2>
            <p>Enter your credentials to access FleetFlow.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <label>Email or Username</label>
            <input
              type="text"
              placeholder="Enter email or username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />

            <div className="password-heading">
              <label>Password</label>
              <button
                type="button"
                className="forgot-password"
                onClick={() =>
                  alert('Password recovery is not configured yet. Please contact your administrator.')
                }
              >
                Forgot password?
              </button>
            </div>

            <div className="password-input">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="show-password"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <label className="remember-option">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              Remember me
            </label>

            {error && (
              <p role="alert" style={{ color: '#dc2626', fontSize: '13px' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <span> →</span>}
            </button>
          </form>

          <div className="login-security">
            🔒 Secure access to your fleet operations
          </div>

          <div className="login-bottom">
            © 2026 FleetFlow. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
