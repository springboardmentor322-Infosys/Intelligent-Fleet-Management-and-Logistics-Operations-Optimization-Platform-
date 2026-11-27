
import { useState } from 'react'
import './login.css'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  // LOGIN
  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
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

  // DRIVER REGISTRATION
  async function handleRegister(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (password.length < 8) {
      setError('Password must contain at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${API}/api/public/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password: password,
          name: name.trim(),
          phone_number: phoneNumber.trim(),
          license_number: licenseNumber.trim(),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          typeof result.detail === 'string'
            ? result.detail
            : 'Registration failed'
        )
      }

      setSuccess('Account created successfully! Please log in.')

      setIsRegister(false)
      setUsername(username.trim())
      setEmail('')
      setName('')
      setPhoneNumber('')
      setLicenseNumber('')
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.message || 'Unable to connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  // PLACEHOLDER FEATURES
  function showUnavailable(feature) {
    alert(`${feature} is not configured yet. Please contact your administrator.`)
  }

  // OPEN REGISTRATION
  function openRegister() {
    setIsRegister(true)
    setError('')
    setSuccess('')
    setUsername('')
    setEmail('')
    setName('')
    setPhoneNumber('')
    setLicenseNumber('')
    setPassword('')
    setConfirmPassword('')
  }

  // BACK TO LOGIN
  function openLogin() {
    setIsRegister(false)
    setError('')
    setSuccess('')
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="login-page">
      <main className="login-container">

  {/* LEFT: FleetFlow Branding Panel */}
  <section className="login-side-panel">
    <div className="side-brand">
      <div className="side-brand-logo">F</div>
      <span>FleetFlow</span>
    </div>

    <div className="side-content">
      <span className="side-tagline">INTELLIGENT FLEET MANAGEMENT</span>

      <h1>
        Move Smarter.<br />
        Manage Better.
      </h1>

      <p>
        Take control of your fleet with smarter vehicle management,
        driver tracking and operational insights.
      </p>

      <div className="fleet-visual">
        <svg viewBox="0 0 500 230" fill="none">
          <path d="M15 190 H485" stroke="#7899C5" strokeWidth="2" strokeDasharray="8 8"/>
          <path d="M50 205 H450" stroke="#7899C5" strokeWidth="1" opacity=".5"/>
          <path d="M75 165 L130 110 L205 110 L245 165 Z"
                fill="#245B99" stroke="#BBD7FA" strokeWidth="3"/>
          <rect x="205" y="125" width="115" height="40" rx="5"
                fill="#3978BA" stroke="#BBD7FA" strokeWidth="3"/>
          <path d="M320 140 H365 L405 165 H320 Z"
                fill="#3978BA" stroke="#BBD7FA" strokeWidth="3"/>
          <path d="M345 145 H363 L385 160 H345 Z"
                fill="#BBD7FA"/>
          <circle cx="145" cy="170" r="19" fill="#10213D" stroke="#D5E7FF" strokeWidth="5"/>
          <circle cx="350" cy="170" r="19" fill="#10213D" stroke="#D5E7FF" strokeWidth="5"/>
          <circle cx="145" cy="170" r="7" fill="#D5E7FF"/>
          <circle cx="350" cy="170" r="7" fill="#D5E7FF"/>
          <path d="M40 75 Q180 5 300 70 T465 55"
                stroke="#77A9E8" strokeWidth="2" strokeDasharray="6 7"/>
          <circle cx="40" cy="75" r="6" fill="#A9D4FF"/>
          <circle cx="300" cy="70" r="6" fill="#A9D4FF"/>
          <circle cx="465" cy="55" r="6" fill="#A9D4FF"/>
        </svg>
      </div>
    </div>

    <div className="side-bottom">
      <span>SMARTER OPERATIONS</span>
      <span>BETTER FLEET PERFORMANCE</span>
    </div>
  </section>

  {/* RIGHT: Existing Login Form */}
  <div className="login-card">
          {/* FleetFlow Branding */}
          <div className="login-brand">
            <div className="login-brand-logo">F</div>
            <span>FleetFlow</span>
          </div>

          {/* Heading */}
          <div className="login-heading">
            <h1>{isRegister ? 'Create Account' : 'Welcome Back'}</h1>
            <p>
              {isRegister
                ? 'Register your account to get started with FleetFlow.'
                : 'Enter your email and password to access your account.'}
            </p>
          </div>

          {/* REGISTRATION FORM */}
          {isRegister ? (
            <form onSubmit={handleRegister} className="login-form">

              <div className="login-field">
                <label htmlFor="register-username">Username</label>
                <input
                  id="register-username"
                  type="text"
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="login-field">
                <label htmlFor="register-name">Driver Name</label>
                <input
                  id="register-name"
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="login-field">
                <label htmlFor="register-phone">Phone Number</label>
                <input
                  id="register-phone"
                  type="tel"
                  placeholder="Enter your phone number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                />
              </div>

              <div className="login-field">
                <label htmlFor="register-email">Email Address</label>
                <input
                  id="register-email"
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="login-field">
                <label htmlFor="register-license">License Number</label>
                <input
                  id="register-license"
                  type="text"
                  placeholder="Enter your driving license number"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  required
                />
              </div>

              <div className="login-field">
                <label htmlFor="register-password">Password</label>

                <div className="login-password-wrapper">
                  <input
                    id="register-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password (minimum 8 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />

                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="register-confirm-password">
                  Confirm Password
                </label>

                <input
                  id="register-confirm-password"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              {error && (
                <p className="login-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="login-button"
                disabled={loading}
              >
                {loading ? 'Creating Account...' : 'Create Account'}
                {!loading && <span> →</span>}
              </button>

            </form>
          ) : (

            /* EXISTING LOGIN FORM */
            <form onSubmit={handleSubmit} className="login-form">

              <div className="login-field">
                <label htmlFor="login-email">Email or Username</label>
                <input
                  id="login-email"
                  type="text"
                  placeholder="Enter your email or username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="login-field">
                <div className="login-password-heading">
                  <label htmlFor="login-password">Password</label>

                  <button
                    type="button"
                    className="login-text-link"
                    onClick={() => showUnavailable('Password recovery')}
                  >
                    Forgot Your Password?
                  </button>
                </div>

                <div className="login-password-wrapper">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />

                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="login-options">
                <label className="login-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Remember Me</span>
                </label>
              </div>

              {error && (
                <p className="login-error" role="alert">
                  {error}
                </p>
              )}

              {success && (
                <p style={{ color: '#15803d', fontSize: '14px' }} role="status">
                  {success}
                </p>
              )}

              <button
                type="submit"
                className="login-button"
                disabled={loading}
              >
                {loading ? 'Logging in...' : 'Log In'}
                {!loading && <span> →</span>}
              </button>

            </form>
          )}

          {/* LOGIN / REGISTRATION SWITCH */}
          <div className="login-register">
            {isRegister
              ? 'Already Have An Account?'
              : "Don't Have An Account?"}

            <button
              type="button"
              onClick={isRegister ? openLogin : openRegister}
            >
              {isRegister ? 'Log In' : 'Register Now'}
            </button>
          </div>

          {/* FOOTER */}
          <footer className="login-footer">
            <span>© 2026 FleetFlow. All rights reserved.</span>

            <button
              type="button"
              onClick={() => showUnavailable('Privacy Policy')}
            >
              Privacy Policy
            </button>
          </footer>

        </div>
      </main>
    </div>
  )
}

export default Login
