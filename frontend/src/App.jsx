
import { useEffect, useState } from 'react'
import './App.css'

const API = 'http://127.0.0.1:8000'

function App() {
  const [data, setData] = useState(null)
  const [trips, setTrips] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [vehicleForm, setVehicleForm] = useState({
    vehicle_number: '',
    model: '',
    vehicle_type: '',
    status: 'Available',
  })

  const [driverForm, setDriverForm] = useState({
    name: '',
    phone_number: '',
    license_number: '',
    status: 'Available',
  })

  async function loadData() {
    try {
      const responses = await Promise.all([
        fetch(`${API}/api/dashboard`),
        fetch(`${API}/api/trips`),
        fetch(`${API}/api/vehicles`),
        fetch(`${API}/api/drivers`),
      ])

      if (responses.some((response) => !response.ok)) {
        throw new Error('Failed to load FleetFlow data')
      }

      const [dashboard, tripList, vehicleList, driverList] =
        await Promise.all(responses.map((response) => response.json()))

      setData(dashboard)
      setTrips(tripList)
      setVehicles(vehicleList)
      setDrivers(driverList)
      setError('')
    } catch {
      setError('Backend connection failed. Please start the backend.')
    }
  }

  useEffect(() => {
  let cancelled = false

  async function fetchData() {
    try {
      const endpoints = [
        '/api/dashboard',
        '/api/trips',
        '/api/vehicles',
        '/api/drivers',
      ]

      const responses = await Promise.all(
        endpoints.map((endpoint) => fetch(`${API}${endpoint}`))
      )

      if (responses.some((response) => !response.ok)) {
        throw new Error('Unable to load FleetFlow data')
      }

      const results = await Promise.all(
        responses.map((response) => response.json())
      )

      if (!cancelled) {
        setData(results[0])
        setTrips(results[1])
        setVehicles(results[2])
        setDrivers(results[3])
        setError('')
      }
    } catch (err) {
      if (!cancelled) {
        setError('Backend connection failed. Please start the backend.')
        console.error(err)
      }
    }
  }

  fetchData()

  return () => {
    cancelled = true
  }
}, [])

  async function addVehicle(event) {
    event.preventDefault()
    setMessage('')

    try {
      const response = await fetch(`${API}/api/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicleForm),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          typeof result.detail === 'string'
            ? result.detail
            : 'Unable to add vehicle'
        )
      }

      setMessage('Vehicle added successfully.')
      setVehicleForm({
        vehicle_number: '',
        model: '',
        vehicle_type: '',
        status: 'Available',
      })
      await loadData()
    } catch (err) {
      setMessage(err.message || 'Unable to add vehicle.')
    }
  }

  async function addDriver(event) {
    event.preventDefault()
    setMessage('')

    try {
      const response = await fetch(`${API}/api/drivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(driverForm),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          typeof result.detail === 'string'
            ? result.detail
            : 'Unable to add driver'
        )
      }

      setMessage('Driver added successfully.')
      setDriverForm({
        name: '',
        phone_number: '',
        license_number: '',
        status: 'Available',
      })
      await loadData()
    } catch (err) {
      setMessage(err.message || 'Unable to add driver.')
    }
  }

  if (error && !data) return <main className="dashboard"><p>{error}</p></main>
  if (!data) return <main className="dashboard"><p>Loading FleetFlow...</p></main>

  const cards = [
    ['Total Vehicles', data.total_vehicles],
    ['Available Vehicles', data.available_vehicles],
    ['Total Drivers', data.total_drivers],
    ['Active Drivers', data.active_drivers],
    ['Vehicle Assignments', data.vehicle_assignments],
    ['Maintenance Due', data.maintenance_due],
  ]

  return (
    <main className="dashboard">
      <h1>FleetFlow Manager Dashboard</h1>
      <p>Fleet overview — live data from PostgreSQL</p>

      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}

      <section className="dashboard-grid">
        {cards.map(([title, value]) => (
          <article className="dashboard-card" key={title}>
            <h2>{title}</h2>
            <p className="dashboard-number">{value ?? 0}</p>
          </article>
        ))}
      </section>

      <section className="status-section">
        <h2>Vehicle Status Analytics</h2>
        {Object.entries(data.vehicle_status || {}).length === 0 ? (
          <p>No vehicles registered yet.</p>
        ) : (
          Object.entries(data.vehicle_status || {}).map(([status, count]) => {
            const percentage = data.total_vehicles
              ? Math.round((count / data.total_vehicles) * 100)
              : 0

            return (
              <div className="status-item" key={status}>
                <div className="status-heading">
                  <span>{status}</span>
                  <strong>{count} vehicles ({percentage}%)</strong>
                </div>
                <div className="status-bar">
                  <div
                    className="status-fill"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )
          })
        )}
      </section>

      <section className="status-section">
        <h2>Add Vehicle</h2>
        <form className="management-form" onSubmit={addVehicle}>
          <input
            placeholder="Vehicle number"
            value={vehicleForm.vehicle_number}
            onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_number: e.target.value })}
            required
          />
          <input
            placeholder="Model"
            value={vehicleForm.model}
            onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
            required
          />
          <input
            placeholder="Vehicle type (Truck, Van...)"
            value={vehicleForm.vehicle_type}
            onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_type: e.target.value })}
            required
          />
          <select
            value={vehicleForm.status}
            onChange={(e) => setVehicleForm({ ...vehicleForm, status: e.target.value })}
          >
            <option>Available</option>
            <option>In Use</option>
            <option>Maintenance</option>
          </select>
          <button type="submit">Add Vehicle</button>
        </form>
      </section>

      <section className="status-section">
        <h2>Vehicles ({vehicles.length})</h2>
        {vehicles.length === 0 ? <p>No vehicles found.</p> : (
          <div className="dashboard-grid">
            {vehicles.map((vehicle) => (
              <article className="dashboard-card" key={vehicle.id}>
                <h3>{vehicle.vehicle_number}</h3>
                <p>Model: {vehicle.model}</p>
                <p>Type: {vehicle.vehicle_type}</p>
                <p>Status: <strong>{vehicle.status}</strong></p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="status-section">
        <h2>Add Driver</h2>
        <form className="management-form" onSubmit={addDriver}>
          <input
            placeholder="Driver name"
            value={driverForm.name}
            onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
            required
          />
          <input
            placeholder="Phone number"
            value={driverForm.phone_number}
            onChange={(e) => setDriverForm({ ...driverForm, phone_number: e.target.value })}
            required
          />
          <input
            placeholder="License number"
            value={driverForm.license_number}
            onChange={(e) => setDriverForm({ ...driverForm, license_number: e.target.value })}
            required
          />
          <select
            value={driverForm.status}
            onChange={(e) => setDriverForm({ ...driverForm, status: e.target.value })}
          >
            <option>Available</option>
            <option>On Trip</option>
            <option>Unavailable</option>
          </select>
          <button type="submit">Add Driver</button>
        </form>
      </section>

      <section className="status-section">
        <h2>Drivers ({drivers.length})</h2>
        {drivers.length === 0 ? <p>No drivers found.</p> : (
          <div className="dashboard-grid">
            {drivers.map((driver) => (
              <article className="dashboard-card" key={driver.id}>
                <h3>{driver.name}</h3>
                <p>Phone: {driver.phone_number}</p>
                <p>License: {driver.license_number}</p>
                <p>Status: <strong>{driver.status}</strong></p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="status-section">
        <h2>Trips &amp; Routes</h2>
        {trips.length === 0 ? <p>No trips available.</p> : (
          <div className="dashboard-grid">
            {trips.map((trip) => (
              <article className="dashboard-card" key={trip.id}>
                <h3>{trip.trip_name}</h3>
                <p>From: {trip.origin}</p>
                <p>To: {trip.destination}</p>
                <p>Vehicle ID: {trip.vehicle_id}</p>
                <p>Driver ID: {trip.driver_id}</p>
                <p>Status: <strong>{trip.status}</strong></p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default App
