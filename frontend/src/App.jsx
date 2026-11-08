import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import Login from './login'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const API = 'http://127.0.0.1:8000'

const roleLabels = {
  admin: 'Administrator',
  manager: 'Fleet Manager',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
}

const navigation = {
  admin: [
    ['overview', 'Overview', '⌂'],
    ['vehicles', 'Vehicles', '▣'],
    ['drivers', 'Drivers', '♙'],
    ['trips', 'Trips & Assignments', '⇄'],
    ['shipments', 'Shipments', '▤'],
    ['maintenance', 'Maintenance', '⚒'],
    ['fuel', 'Fuel Analytics', '◉'],
    ['tracking', 'Live Tracking', '⌖'],
    ['routeOptimization', 'Route Optimization', '↗'],
    ['trafficPlanning', 'Traffic Planning', '🚦'],
    ['notifications', 'Notifications', '♢'],
    ['reports', 'Reports & Exports', '▥'],
    ['users', 'User Management', '♧'],
  ],
  manager: [
    ['overview', 'Overview', '⌂'],
    ['vehicles', 'Vehicles', '▣'],
    ['drivers', 'Drivers', '♙'],
    ['trips', 'Trips', '⇄'],
    ['shipments', 'Shipments', '▤'],
    ['maintenance', 'Maintenance', '⚒'],
    ['fuel', 'Fuel Analytics', '◉'],
    ['tracking', 'Live Tracking', '⌖'],
    ['routeOptimization', 'Route Optimization', '↗'],
    ['trafficPlanning', 'Traffic Planning', '🚦'],
    ['reports', 'Reports', '▥'],
  ],
  dispatcher: [
    ['overview', 'Overview', '⌂'],
    ['trips', 'Trips & Assignments', '⇄'],
    ['shipments', 'Shipments', '▤'],
    ['tracking', 'Live Tracking', '⌖'],
    ['routeOptimization', 'Route Optimization', '↗'],
    ['trafficPlanning', 'Traffic Planning', '🚦'],
    ['drivers', 'Drivers', '♙'],
    ['notifications', 'Notifications', '♢'],
  ],
  driver: [
    ['overview', 'My Dashboard', '⌂'],
    ['trips', 'My Trips', '⇄'],
    ['notifications', 'Notifications', '♢'],
  ],
}

function getSavedAuth() {
  try {
    const saved =
      localStorage.getItem('fleetflow_auth') ||
      sessionStorage.getItem('fleetflow_auth')

    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

function StatusPill({ value }) {
  const status = String(value || 'Unknown')
  const lower = status.toLowerCase()

  let tone = 'neutral'

  if (
    ['available', 'completed', 'delivered', 'active', 'read'].some(
      item => lower.includes(item)
    )
  ) {
    tone = 'good'
  } else if (
    ['pending', 'scheduled', 'planned', 'maintenance', 'unread'].some(
      item => lower.includes(item)
    )
  ) {
    tone = 'warning'
  } else if (
    ['delayed', 'overdue', 'cancelled', 'inactive', 'failed'].some(
      item => lower.includes(item)
    )
  ) {
    tone = 'danger'
  }

  return <span className={`status-pill ${tone}`}>{status}</span>
}

function MetricCard({ label, value, icon, note }) {
  return (
    <article className="metric-card">
      <div className="metric-card-top">
        <span className="metric-label">{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value">{value ?? 0}</div>
      <div className="metric-note">{note}</div>
    </article>
  )
}

function Panel({ title, subtitle, children }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function DataTable({ columns, rows }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty-cell">
                No records available.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row.id ?? row.assignment_id ?? index}>
                {columns.map(column => (
                  <td key={column.key}>
                    {column.render
                      ? column.render(row)
                      : row[column.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function App() {
  const [auth, setAuth] = useState(getSavedAuth)
  const [activeSection, setActiveSection] = useState('overview')

  const [dashboard, setDashboard] = useState({})
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [trips, setTrips] = useState([])
  const [shipments, setShipments] = useState([])
  const [shipmentHistory, setShipmentHistory] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [fuel, setFuel] = useState([])
  const [tracking, setTracking] = useState([])
  const [routeOrigin, setRouteOrigin] = useState('')
  const [routeDestination, setRouteDestination] = useState('')
  const [trafficLevel, setTrafficLevel] = useState('moderate')
  const [trafficResult, setTrafficResult] = useState(null)
  const [trafficLoading, setTrafficLoading] = useState(false)
  const [trafficError, setTrafficError] = useState('')
  const [routeResult, setRouteResult] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [liveGps, setLiveGps] = useState(null)
  const [liveEta, setLiveEta] = useState(null)
const [connectionStatus, setConnectionStatus] = useState('Connecting...')

  const [notifications, setNotifications] = useState([])
  const [users, setUsers] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

  const [shipmentForm, setShipmentForm] = useState({
    shipment_number: '',
    customer_name: '',
    origin: '',
    destination: '',
    shipment_date: '',
    expected_delivery: '',
  })

 
const routeEta = (() => {
  if (!routeResult) return null

  const duration = Number(
    routeResult.estimated_duration_minutes ??
    routeResult.duration_minutes
  )

  if (!Number.isFinite(duration)) return null

  return new Date(new Date().getTime() + duration * 60 * 1000)
})()

  const role = auth?.role?.toLowerCase() || ''

  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const isDispatcher = role === 'dispatcher'
  const isDriver = role === 'driver'

  const allowedNavigation = navigation[role] || []

  const authHeaders = useCallback(
    (extra = {}) => ({
      ...extra,
      Authorization: `Bearer ${auth?.access_token}`,
    }),
    [auth]
  )

  const fetchData = useCallback(
    async endpoint => {
      const response = await fetch(`${API}${endpoint}`, {
        headers: authHeaders(),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(
          result.detail || `${endpoint} failed (${response.status})`
        )
      }

      return response.json()
    },
    [authHeaders]
  )
  
  const calculateRoute = async event => {
  event.preventDefault()

  if (!routeOrigin.trim() || !routeDestination.trim()) {
    setRouteError('Please enter both origin and destination.')
    return
  }

  setRouteLoading(true)
  setRouteError('')
  setRouteResult(null)

  try {
    const params = new URLSearchParams({
      origin: routeOrigin.trim(),
      destination: routeDestination.trim(),
    })

    const result = await fetchData(
      `/api/routes/optimize?${params.toString()}`
    )

    setRouteResult(result)
  } catch (err) {
    setRouteError(err.message || 'Unable to calculate route.')
  } finally {
    setRouteLoading(false)
  }
}

const calculateTrafficRoute = async () => {
  if (!routeOrigin.trim() || !routeDestination.trim()) {
    setTrafficError('Please enter origin and destination.')
    return
  }

  setTrafficLoading(true)
  setTrafficError('')
  setTrafficResult(null)

  try {
    const params = new URLSearchParams({
      origin: routeOrigin,
      destination: routeDestination,
      traffic_level: trafficLevel
    })

    const response = await fetch(
      `${API}/api/routes/traffic-plan?${params.toString()}`,
      {
        headers: authHeaders()
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.detail || 'Unable to calculate traffic route.')
    }

    setTrafficResult(data)
  } catch (error) {
    setTrafficError(error.message)
  } finally {
    setTrafficLoading(false)
  }
}


  const loadData = useCallback(async () => {
    if (!auth?.access_token) return

    setLoading(true)
    setError('')

    try {
      const requests = [
        fetchData('/api/trips'),
        fetchData('/api/notifications'),
      ]

      if (!isDriver) {
        requests.push(
          fetchData('/api/dashboard'),
          fetchData('/api/vehicles'),
          fetchData('/api/drivers')
        )
      }

      if (isAdmin || isManager || isDispatcher) {
        requests.push(fetchData('/api/shipments'))
      }

      if (isAdmin || isManager || isDispatcher) {
        requests.push(fetchData('/api/maintenance'))
      }

      if (isAdmin || isManager) {
        requests.push(fetchData('/api/fuel'))
      }

      if (isAdmin || isManager || isDispatcher) {
        requests.push(fetchData('/api/tracking'))
      }

      if (isAdmin) {
        requests.push(fetchData('/api/users'))
      }

      const results = await Promise.all(requests)

      let index = 0

      setTrips(Array.isArray(results[index]) ? results[index] : [])
      index++

      setNotifications(
        Array.isArray(results[index]) ? results[index] : []
      )
      index++

      if (!isDriver) {
        setDashboard(results[index] || {})
        index++

        setVehicles(
          Array.isArray(results[index]) ? results[index] : []
        )
        index++

        setDrivers(
          Array.isArray(results[index]) ? results[index] : []
        )
        index++
      } else {
        setDashboard({})
        setVehicles([])
        setDrivers([])
      }

      if (isAdmin || isManager || isDispatcher) {
        setShipments(
          Array.isArray(results[index]) ? results[index] : []
        )
        index++
      } else {
        setShipments([])
      }

      if (isAdmin || isManager || isDispatcher) {
        setMaintenance(
          Array.isArray(results[index]) ? results[index] : []
        )
        index++
      } else {
        setMaintenance([])
      }

      if (isAdmin || isManager) {
        setFuel(
          Array.isArray(results[index]) ? results[index] : []
        )
        index++
      } else {
        setFuel([])
      }

      if (isAdmin || isManager || isDispatcher) {
        setTracking(
          Array.isArray(results[index]) ? results[index] : []
        )
        index++
      } else {
        setTracking([])
      }

      if (isAdmin) {
        setUsers(
          Array.isArray(results[index]) ? results[index] : []
        )
      } else {
        setUsers([])
      }
    } catch (err) {
      setError(err.message || 'Unable to load FleetFlow data.')
    } finally {
      setLoading(false)
    }
  }, [auth, fetchData, isAdmin, isManager, isDispatcher, isDriver])

  useEffect(() => {
  if (!auth?.access_token) return

  const timer = setTimeout(() => {
    loadData()
  }, 0)

  return () => clearTimeout(timer)
}, [auth?.access_token, loadData])

useEffect(() => {
  let socket
  let reconnectTimer
  let shouldReconnect = true

  const connectWebSocket = () => {
    if (!shouldReconnect) return

    setConnectionStatus('Connecting...')

    socket = new WebSocket(
      'ws://127.0.0.1:8000/ws/tracking/1'
    )

    socket.onopen = () => {
      if (shouldReconnect) {
        setConnectionStatus('Connected')
      }
    }

    socket.onmessage = (event) => {
      if (!shouldReconnect) return

      try {
        const data = JSON.parse(event.data)
        setLiveGps(data)
      } catch {
        console.error('Invalid WebSocket data')
      }
    }

    socket.onerror = () => {
      if (shouldReconnect) {
        setConnectionStatus('Connection Error')
      }
    }

    socket.onclose = () => {
      if (shouldReconnect) {
        setConnectionStatus('Reconnecting...')

        reconnectTimer = setTimeout(() => {
          connectWebSocket()
        }, 3000)
      }
    }
  }

  connectWebSocket()

  return () => {
    shouldReconnect = false
    clearTimeout(reconnectTimer)

    if (socket) {
      socket.close()
    }
  }
}, [])

useEffect(() => {
  if (!auth?.access_token) return

  const fetchVehicleEta = async () => {
    try {
      const response = await fetch(
        `${API}/api/tracking/1/eta`,
        {
          headers: {
            Authorization: `Bearer ${auth.access_token}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch ETA')
      }

      const data = await response.json()
      setLiveEta(data)
    } catch (error) {
      console.error('ETA fetch error:', error)
    }
  }

  fetchVehicleEta()
}, [auth?.access_token])

  function handleLogin(result, rememberMe) {
    const userData = {
      access_token: result.access_token,
      username: result.username,
      role: result.role,
    }

    localStorage.removeItem('fleetflow_auth')
    sessionStorage.removeItem('fleetflow_auth')

    const storage = rememberMe ? localStorage : sessionStorage

    storage.setItem('fleetflow_auth', JSON.stringify(userData))

    setActiveSection('overview')
    setAuth(userData)
    setError('')
    setMessage('')
  }

  function handleLogout() {
    localStorage.removeItem('fleetflow_auth')
    sessionStorage.removeItem('fleetflow_auth')

    setAuth(null)
    setActiveSection('overview')

    setVehicles([])
    setDrivers([])
    setTrips([])
    setShipments([])
    setMaintenance([])
    setFuel([])
    setTracking([])
    setNotifications([])
    setUsers([])
    setDashboard({})
  }

  async function submitRecord(endpoint, payload, successText, reset) {
    setMessage('')
    setError('')

    try {
      const response = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.detail || 'Unable to save record.')
      }

      setMessage(successText)
      reset()
      await loadData()
    } catch (err) {
      setError(err.message)
    }
  }

  function addVehicle(event) {
    event.preventDefault()

    submitRecord(
      '/api/vehicles',
      vehicleForm,
      'Vehicle added successfully.',
      () =>
        setVehicleForm({
          vehicle_number: '',
          model: '',
          vehicle_type: '',
          status: 'Available',
        })
    )
  }

  function addDriver(event) {
    event.preventDefault()

    submitRecord(
      '/api/drivers',
      driverForm,
      'Driver added successfully.',
      () =>
        setDriverForm({
          name: '',
          phone_number: '',
          license_number: '',
          status: 'Available',
        })
    )
  }


  async function addShipment(event) {
  event.preventDefault()

  setMessage('')
  setError('')

  try {
    const params = new URLSearchParams(shipmentForm)

    const response = await fetch(
      `${API}/api/shipments?${params.toString()}`,
      {
        method: 'POST',
        headers: authHeaders(),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.detail || 'Unable to create shipment.')
    }

    setMessage('Shipment created successfully.')

    setShipmentForm({
      shipment_number: '',
      customer_name: '',
      origin: '',
      destination: '',
      shipment_date: '',
      expected_delivery: '',
    })

    await loadData()
  } catch (err) {
    setError(err.message)
  }
}

async function assignShipmentToTrip(shipmentId, tripId) {
  if (!tripId) return

  setError('')
  setMessage('')

  try {
    const params = new URLSearchParams({
      trip_id: String(tripId),
    })

    const response = await fetch(
      `${API}/api/shipments/${shipmentId}/assign-trip?${params}`,
      {
        method: 'PUT',
        headers: authHeaders(),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.detail || 'Unable to assign trip.')
    }

    setMessage('Shipment assigned to trip successfully.')
    await loadData()
  } catch (err) {
    setError(err.message)
  }
}

async function updateShipmentStatus(shipmentId, status) {
  if (!status) return

  setError('')
  setMessage('')

  try {
    const params = new URLSearchParams({ status })

    const response = await fetch(
      `${API}/api/shipments/${shipmentId}/status?${params}`,
      {
        method: 'PUT',
        headers: authHeaders(),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.detail || 'Unable to update shipment status.')
    }

    setMessage('Shipment status updated successfully.')
    await loadData()
  } catch (err) {
    setError(err.message)
  }
}

async function loadShipmentHistory(shipmentId) {
  try {
    const response = await fetch(
      `${API}/api/shipments/${shipmentId}/history`,
      {
        headers: authHeaders(),
      }
    )

    if (!response.ok) {
      throw new Error('Failed to load shipment history')
    }

    const data = await response.json()
    setShipmentHistory(data)
  } catch (error) {
    setMessage(error.message)
  }
}

  async function updateTripStatus(id, status) {
    try {
      const response = await fetch(`${API}/api/trips/${id}/status`, {
        method: 'PATCH',
        headers: authHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ status }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.detail || 'Unable to update trip.')
      }

      setMessage('Trip status updated successfully.')
      await loadData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function markNotificationRead(id) {
    try {
      const response = await fetch(
        `${API}/api/notifications/${id}/read`,
        {
          method: 'PATCH',
          headers: authHeaders(),
        }
      )

      if (!response.ok) {
        throw new Error('Unable to update notification.')
      }

      await loadData()
    } catch (err) {
      setError(err.message)
    }
  }

  const activeTrips = trips.filter(trip =>
    ['active', 'in progress', 'started'].includes(
      String(trip.status || '').toLowerCase()
    )
  ).length

  const metrics = useMemo(() => {
    if (isDriver) {
      return [
        ['My Trips', trips.length, '⇄', 'Trips assigned to you'],
        [
          'Completed Trips',
          trips.filter(
            trip => String(trip.status).toLowerCase() === 'completed'
          ).length,
          '✓',
          'Successfully completed',
        ],
        ['Notifications', notifications.length, '♢', 'Recent updates'],
        [
          'Active Trips',
          activeTrips,
          '⌖',
          'Trips currently in progress',
        ],
      ]
    }

    if (isManager) {
      return [
        ['Total Vehicles', vehicles.length, '▣', 'Registered vehicles'],
        ['Maintenance Records', maintenance.length, '⚒', 'Service records'],
        ['Fuel Records', fuel.length, '◉', 'Fuel entries'],
        ['Active Trips', activeTrips, '⇄', 'Trips in progress'],
      ]
    }

    if (isDispatcher) {
      return [
        ['Active Trips', activeTrips, '⇄', 'Trips in progress'],
        ['Shipments', shipments.length, '▤', 'Delivery records'],
        ['Drivers', drivers.length, '♙', 'Driver records'],
        ['Notifications', notifications.length, '♢', 'Recent updates'],
      ]
    }

    return [
      [
        'Total Vehicles',
        dashboard.total_vehicles ?? vehicles.length,
        '▣',
        'Registered fleet vehicles',
      ],
      [
        'Active Drivers',
        dashboard.active_drivers ?? drivers.length,
        '♙',
        'Available fleet drivers',
      ],
      ['Active Trips', dashboard.active_trips ?? activeTrips, '⇄', 'Trips in progress'],
      ['Shipments', shipments.length, '▤', 'Registered shipments'],
    ]
  }, [
    isDriver,
    isManager,
    isDispatcher,
    trips,
    notifications,
    vehicles,
    maintenance,
    fuel,
    shipments,
    drivers,
    dashboard,
    activeTrips,
  ])

  const titleMap = {
    overview: isDriver ? 'My Dashboard' : 'Dashboard Overview',
    vehicles: 'Vehicle Management',
    drivers: 'Driver Management',
    trips: isDriver ? 'My Trips' : 'Trip Management',
    shipments: 'Shipment Management',
    maintenance: 'Maintenance Management',
    fuel: 'Fuel Analytics',
    tracking: 'Live Tracking',
    routeOptimization: 'Route Optimization',
    trafficPlanning: 'Traffic-Aware Route Planning',
    notifications: 'Notifications',
    reports: 'Reports & Exports',
    users: 'User Management',
  }

  if (!auth?.access_token) {
    return <Login onLogin={handleLogin} />
  }

  function renderSection() {
    
    switch (activeSection) {
      case 'vehicles':
        return (
          <Panel title="Vehicle Records" subtitle={`${vehicles.length} vehicles`}>
            <DataTable
              rows={vehicles}
              columns={[
                { key: 'vehicle_number', label: 'Vehicle Number' },
                { key: 'model', label: 'Model' },
                { key: 'vehicle_type', label: 'Type' },
                {
                  key: 'status',
                  label: 'Status',
                  render: row => <StatusPill value={row.status} />,
                },
              ]}
            />

            {(isAdmin || isManager) && (
              <div className="form-area">
                <h3>Add New Vehicle</h3>
                <form className="record-form" onSubmit={addVehicle}>
                  <input
                    placeholder="Vehicle Number"
                    value={vehicleForm.vehicle_number}
                    onChange={e =>
                      setVehicleForm({
                        ...vehicleForm,
                        vehicle_number: e.target.value,
                      })
                    }
                    required
                  />
                  <input
                    placeholder="Model"
                    value={vehicleForm.model}
                    onChange={e =>
                      setVehicleForm({
                        ...vehicleForm,
                        model: e.target.value,
                      })
                    }
                    required
                  />
                  <input
                    placeholder="Vehicle Type"
                    value={vehicleForm.vehicle_type}
                    onChange={e =>
                      setVehicleForm({
                        ...vehicleForm,
                        vehicle_type: e.target.value,
                      })
                    }
                    required
                  />
                  <select
                    value={vehicleForm.status}
                    onChange={e =>
                      setVehicleForm({
                        ...vehicleForm,
                        status: e.target.value,
                      })
                    }
                  >
                    <option>Available</option>
                    <option>In Use</option>
                    <option>Maintenance</option>
                  </select>
                  <button className="primary-button" type="submit">
                    Add Vehicle
                  </button>
                </form>
              </div>
            )}
          </Panel>
        )

      case 'drivers':
        return (
          <Panel title="Driver Records" subtitle={`${drivers.length} drivers`}>
            <DataTable
              rows={drivers}
              columns={[
                { key: 'name', label: 'Driver Name' },
                { key: 'phone_number', label: 'Phone Number' },
                { key: 'license_number', label: 'License Number' },
                {
                  key: 'status',
                  label: 'Status',
                  render: row => <StatusPill value={row.status} />,
                },
              ]}
            />

            {isAdmin && (
              <div className="form-area">
                <h3>Add New Driver</h3>
                <form className="record-form" onSubmit={addDriver}>
                  <input
                    placeholder="Driver Name"
                    value={driverForm.name}
                    onChange={e =>
                      setDriverForm({
                        ...driverForm,
                        name: e.target.value,
                      })
                    }
                    required
                  />
                  <input
                    placeholder="Phone Number"
                    value={driverForm.phone_number}
                    onChange={e =>
                      setDriverForm({
                        ...driverForm,
                        phone_number: e.target.value,
                      })
                    }
                    required
                  />
                  <input
                    placeholder="License Number"
                    value={driverForm.license_number}
                    onChange={e =>
                      setDriverForm({
                        ...driverForm,
                        license_number: e.target.value,
                      })
                    }
                    required
                  />
                  <select
                    value={driverForm.status}
                    onChange={e =>
                      setDriverForm({
                        ...driverForm,
                        status: e.target.value,
                      })
                    }
                  >
                    <option>Available</option>
                    <option>On Trip</option>
                    <option>Unavailable</option>
                  </select>
                  <button className="primary-button" type="submit">
                    Add Driver
                  </button>
                </form>
              </div>
            )}
          </Panel>
        )

      case 'trips':
        return (
          <Panel title="Trip Records" subtitle={`${trips.length} trips`}>
            <DataTable
              rows={trips}
              columns={[
                { key: 'trip_name', label: 'Trip Name' },
                { key: 'origin', label: 'Origin' },
                { key: 'destination', label: 'Destination' },
                {
                  key: 'estimated_arrival',
                  label: 'Estimated Arrival',
                  render: (row) => row.estimated_arrival
                    ? new Date(row.estimated_arrival).toLocaleString()
                    : 'Not Available'
                },
                { key: 'vehicle_id', label: 'Vehicle ID' },
                ...(!isDriver
                  ? [{ key: 'driver_id', label: 'Driver ID' }]
                  : []),
                {
                  key: 'status',
                  label: 'Status',
                  render: row => <StatusPill value={row.status} />,
                },
                ...(isDriver
                  ? [
                      {
                        key: 'action',
                        label: 'Update Status',
                        render: row => (
                          <select
                            value={row.status}
                            onChange={e =>
                              updateTripStatus(row.id, e.target.value)
                            }
                          >
                            <option>Planned</option>
                            <option>In Progress</option>
                            <option>Completed</option>
                          </select>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Panel>
        )

      
      
case 'shipments': {
  const today = new Date()
  const todayString = `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const delayedShipments = shipments.filter((shipment) => {
    const expectedDate = String(
      shipment.expected_delivery || ''
    ).slice(0, 10)

    return (
      shipment.status === 'Delayed' ||
      (
        expectedDate &&
        expectedDate < new Date().toISOString().slice(0, 10) &&
        shipment.status !== 'Delivered' &&
        shipment.status !== 'Cancelled'
      )
    )
  })

  return (
    <>
      <Panel
        title="Delivery Overview"
        subtitle="Shipment delivery summary"
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px',
          }}
        >
          <MetricCard
            label="Total Shipments"
            value={shipments.length}
            icon="📦"
          />
          <MetricCard
            label="Pending"
            value={shipments.filter(s => s.status === 'Pending').length}
            icon="⏳"
          />
          <MetricCard
            label="In Transit"
            value={shipments.filter(s => s.status === 'In Transit').length}
            icon="🚚"
          />
          <MetricCard
            label="Delivered"
            value={shipments.filter(s => s.status === 'Delivered').length}
            icon="✅"
          />
          <MetricCard
            label="Delayed"
            value={delayedShipments.length}
            icon="⚠️"
          />
        </div>
      </Panel>

      
<Panel
  title="Delayed Shipments"
  subtitle={`${
    shipments.filter(s => {
      const date = String(s.expected_delivery || '').slice(0, 10)
      return s.status === 'Delayed' ||
        (date && date < todayString &&
          s.status !== 'Delivered' &&
          s.status !== 'Cancelled')
    }).length
  } shipments need attention`}
>
  <DataTable
    rows={shipments.filter(s => {
      const date = String(s.expected_delivery || '').slice(0, 10)
      return s.status === 'Delayed' ||
        (date && date < todayString &&
          s.status !== 'Delivered' &&
          s.status !== 'Cancelled')
    })}
    columns={[
      { key: 'shipment_number', label: 'Shipment Number' },
      { key: 'customer_name', label: 'Customer' },
      { key: 'origin', label: 'Origin' },
      { key: 'destination', label: 'Destination' },
      { key: 'expected_delivery', label: 'Expected Delivery' },
      { key: 'status', label: 'Status' },
    ]}
  />
</Panel>


      <Panel
        title="Shipment Records"
        subtitle={`${shipments.length} shipments`}
      >
        <DataTable
          rows={shipments}
          columns={[
            {
              key: 'shipment_number',
              label: 'Shipment Number',
            },
            {
              key: 'customer_name',
              label: 'Customer',
            },
            { key: 'origin', label: 'Origin' },
            { key: 'destination', label: 'Destination' },
            {
              key: 'expected_delivery',
              label: 'Expected Delivery',
            },
            {
              key: 'eta',
              label: 'Estimated Arrival',
              render: (row) => row.eta
                ? new Date(row.eta).toLocaleString()
                : 'Not Available'
            },
            {
              key: 'status',
              label: 'Current Status',
              render: row => <StatusPill value={row.status} />,
            },
            {
              key: 'update_status',
              label: 'Update Status',
              render: row => {
                const allowedStatuses = {
                  Pending: ['In Transit', 'Cancelled'],
                  'In Transit': [
                    'Delivered',
                    'Delayed',
                    'Cancelled',
                  ],
                  Delayed: [
                    'In Transit',
                    'Delivered',
                    'Cancelled',
                  ],
                  Delivered: [],
                  Cancelled: [],
                }

                return (
                  <select
                    className="shipment-action-select"
                    defaultValue=""
                    onChange={e =>
                      updateShipmentStatus(row.id, e.target.value)
                    }
                  >
                    <option value="">Change Status</option>
                    {(allowedStatuses[row.status] || []).map(
                      status => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      )
                    )}
                  </select>
                )
              },
            },
            {
              key: 'trip_id',
              label: 'Assigned Trip',
              render: row => (
                <select
                  className="shipment-action-select"
                  value={row.trip_id || ''}
                  onChange={e =>
                    assignShipmentToTrip(row.id, e.target.value)
                  }
                >
                  <option value="">Select Trip</option>
                  {trips.map(trip => (
                    <option key={trip.id} value={trip.id}>
                      {trip.trip_name}
                    </option>
                  ))}
                </select>
              ),
            },
            {
              key: 'history',
              label: 'Status History',
              render: row => (
                <button
                  onClick={() => loadShipmentHistory(row.id)}
                >
                  View History
                </button>
              ),
            },
          ]}
        />

        {shipmentHistory.length > 0 && (
          <Panel title="Shipment Status History">
            <DataTable
              columns={[
                {
                  key: 'status',
                  label: 'Status',
                  render: row => <StatusPill value={row.status} />,
                },
                {
                  key: 'changed_at',
                  label: 'Changed At',
                  render: row =>
                    new Date(row.changed_at).toLocaleString(),
                },
              ]}
              rows={shipmentHistory}
            />
          </Panel>
        )}

        <div className="form-area">
          <h3>Register New Shipment</h3>

          <form className="record-form" onSubmit={addShipment}>
            <input
              placeholder="Shipment Number"
              value={shipmentForm.shipment_number}
              onChange={e =>
                setShipmentForm({
                  ...shipmentForm,
                  shipment_number: e.target.value,
                })
              }
              required
            />

            <input
              placeholder="Customer Name"
              value={shipmentForm.customer_name}
              onChange={e =>
                setShipmentForm({
                  ...shipmentForm,
                  customer_name: e.target.value,
                })
              }
              required
            />

            <input
              placeholder="Origin"
              value={shipmentForm.origin}
              onChange={e =>
                setShipmentForm({
                  ...shipmentForm,
                  origin: e.target.value,
                })
              }
              required
            />

            <input
              placeholder="Destination"
              value={shipmentForm.destination}
              onChange={e =>
                setShipmentForm({
                  ...shipmentForm,
                  destination: e.target.value,
                })
              }
              required
            />

            <label>Shipment Date</label>
            <input
              type="date"
              value={shipmentForm.shipment_date}
              onChange={e =>
                setShipmentForm({
                  ...shipmentForm,
                  shipment_date: e.target.value,
                })
              }
              required
            />

            <label>Expected Delivery</label>
            <input
              type="date"
              value={shipmentForm.expected_delivery}
              onChange={e =>
                setShipmentForm({
                  ...shipmentForm,
                  expected_delivery: e.target.value,
                })
              }
              required
            />

            <button className="primary-button" type="submit">
              Add Shipment
            </button>
          </form>
        </div>
      </Panel>
    </>
  )
}



      case 'maintenance':
        return (
          <Panel title="Maintenance Records" subtitle={`${maintenance.length} records`}>
            <DataTable
              rows={maintenance}
              columns={[
                { key: 'vehicle_id', label: 'Vehicle ID' },
                { key: 'service_type', label: 'Service Type' },
                { key: 'service_date', label: 'Service Date' },
                { key: 'due_date', label: 'Due Date' },
                {
                  key: 'status',
                  label: 'Status',
                  render: row => <StatusPill value={row.status} />,
                },
              ]}
            />
          </Panel>
        )

      case 'fuel':
        return (
          <Panel title="Fuel Records" subtitle={`${fuel.length} entries`}>
            <DataTable
              rows={fuel}
              columns={[
                { key: 'vehicle_id', label: 'Vehicle ID' },
                { key: 'fuel_type', label: 'Fuel Type' },
                { key: 'quantity', label: 'Quantity' },
                { key: 'cost', label: 'Cost' },
                { key: 'fuel_date', label: 'Date' },
                { key: 'odometer_reading', label: 'Odometer' },
              ]}
            />
          </Panel>
        )
      

      case 'routeOptimization':
  return (
    <div>
      <Panel
        title="Route Optimization"
        subtitle="Calculate the driving route between two locations"
      >
        <div className="form-area">
          <form className="record-form" onSubmit={calculateRoute}>
            <input
              placeholder="Enter Origin"
              value={routeOrigin}
              onChange={e => setRouteOrigin(e.target.value)}
              required
            />

            <input
              placeholder="Enter Destination"
              value={routeDestination}
              onChange={e => setRouteDestination(e.target.value)}
              required
            />

            <button
              className="primary-button"
              type="submit"
              disabled={routeLoading}
            >
              {routeLoading ? 'Calculating...' : 'Optimize Route'}
            </button>
          </form>

          {routeError && (
            <div className="alert error-alert">
              {routeError}
            </div>
          )}

          {routeResult && (
            <>
              <div className="metric-grid">
                <MetricCard
                  label="Distance"
                  value={`${routeResult.distance_km} km`}
                  icon="📍"
                  note="Total route distance"
                />

                <MetricCard
                  label="Duration"
                  value={`${routeResult.duration_minutes} min`}
                  icon="⏱️"
                  note="Estimated travel time"
                />
              </div>
              {/* ETA Display */}
{routeEta && (
  <div className="metric-grid">
    <MetricCard
      label="Estimated Arrival"
      value={routeEta.toLocaleString()}
      icon="🕒"
      note="Expected arrival time"
    />
  </div>
)}
              

              <MapContainer
                center={routeResult.route_coordinates[0]}
                zoom={7}
                style={{
                  height: '420px',
                  width: '100%',
                  borderRadius: '12px',
                }}
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <Polyline
                  positions={routeResult.route_coordinates}
                  pathOptions={{
                    color: 'blue',
                    weight: 5,
                  }}
                />
              </MapContainer>
            </>
          )}
        </div>
      </Panel>
    </div>
  ) 




  case 'trafficPlanning':
  return (
    <div className="section">
      <h2>Traffic-Aware Route Planning</h2>
      <p>
        Plan routes using simulated traffic conditions.
      </p>

      <div className="form-group">
        <label>Origin</label>
        <input
          type="text"
          value={routeOrigin}
          onChange={(e) => setRouteOrigin(e.target.value)}
          placeholder="Enter origin"
        />

        <label>Destination</label>
        <input
          type="text"
          value={routeDestination}
          onChange={(e) => setRouteDestination(e.target.value)}
          placeholder="Enter destination"
        />

        <label>Traffic Level</label>
        <select
          value={trafficLevel}
          onChange={(e) => setTrafficLevel(e.target.value)}
        >
          <option value="low">Low Traffic</option>
          <option value="moderate">Moderate Traffic</option>
          <option value="high">High Traffic</option>
          <option value="severe">Severe Traffic</option>
        </select>

        <button
          onClick={calculateTrafficRoute}
          disabled={trafficLoading}
        >
          {trafficLoading ? 'Calculating...' : 'Calculate Traffic Route'}
        </button>
      </div>

      {trafficError && (
        <p className="error">{trafficError}</p>
      )}

      {trafficResult && (
        <div className="route-result">
          <h3>Traffic Planning Results</h3>

          <p><strong>Origin:</strong> {trafficResult.origin}</p>
          <p><strong>Destination:</strong> {trafficResult.destination}</p>
          <p><strong>Distance:</strong> {trafficResult.distance_km} km</p>
          <p>
            <strong>Normal Travel Time:</strong>{' '}
            {trafficResult.original_duration_minutes} minutes
          </p>
          <p>
            <strong>Traffic-Adjusted Time:</strong>{' '}
            {trafficResult.estimated_duration_minutes} minutes
          </p>
          <p>
            <strong>Expected Delay:</strong>{' '}
            {trafficResult.delay_minutes} minutes
          </p>
          <p>
            <strong>Traffic Level:</strong>{' '}
            {trafficResult.traffic_level.toUpperCase()}
          </p>

          <p className="traffic-notice">
            {trafficResult.traffic_status}
          </p>

          {trafficResult.route_coordinates?.length > 0 && (
            <MapContainer
              center={trafficResult.route_coordinates[0]}
              zoom={7}
              style={{ height: '400px', width: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
              <Polyline
                positions={trafficResult.route_coordinates}
                pathOptions={{ color: 'orange', weight: 5 }}
              />
            </MapContainer>
          )}
        </div>
      )}
    </div>
  )



      case 'tracking':
  return (
    <div>

      {/* Real-Time GPS Tracking */}
      <Panel
        title="Real-Time GPS Tracking"
        subtitle="Live vehicle location updates through WebSocket"
      >
        <div className="tracking-status">
          <p>
            <strong>Connection:</strong>{' '}
            {connectionStatus}
          </p>

          {liveGps && (
            <>
              <p>
                <strong>Vehicle ID:</strong>{' '}
                {liveGps.vehicle_id}
              </p>

              <p>
                <strong>Latitude:</strong>{' '}
                {liveGps.latitude.toFixed(6)}
              </p>

              <p>
                <strong>Longitude:</strong>{' '}
                {liveGps.longitude.toFixed(6)}
              </p>

              <p>
                <strong>GPS Update:</strong>{' '}
                {liveGps.update_number}
              </p>

              <p>
                <strong>Status:</strong>{' '}
                {liveGps.status}
              </p>
            </>
          )}
        </div>
      </Panel>

      {/* Existing Live Vehicle Map — preserved */}
      <Panel
        title="Live Vehicle Map"
        subtitle={`${tracking.length} vehicle updates`}
      >
        <MapContainer
  center={
    liveGps
      ? [
          Number(liveGps.latitude),
          Number(liveGps.longitude),
        ]
      : tracking.length
        ? [
            Number(tracking[0].latitude),
            Number(tracking[0].longitude),
          ]
        : [20.5937, 78.9629]
  }
  zoom={7}
  style={{
    height: '420px',
    width: '100%',
    borderRadius: '12px',
  }}
>
  <TileLayer
    attribution="&copy; OpenStreetMap contributors"
    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  />

  

  {liveGps && (
    <Marker
      position={[
        Number(liveGps.latitude),
        Number(liveGps.longitude),
      ]}
    >
      <Popup>
  <strong>Real-Time Vehicle</strong>
  <br />
  Vehicle ID: {liveGps.vehicle_id}
  <br />
  Latitude: {liveGps.latitude.toFixed(6)}
  <br />
  Longitude: {liveGps.longitude.toFixed(6)}
  <br />
  Update: {liveGps.update_number}
  <br />
  Status: {liveGps.status}
  <br />
  <strong>Estimated Arrival:</strong>{" "}
{liveEta?.estimated_arrival
  ? new Date(liveEta.estimated_arrival).toLocaleString()
  : "Not Available"}
</Popup>
    </Marker>
  )}
</MapContainer>
      </Panel>

      {/* Existing Tracking Records — preserved */}
      <Panel title="Vehicle Tracking Records">
        <DataTable
          rows={tracking}
          columns={[
            { key: 'vehicle_id', label: 'Vehicle ID' },
            { key: 'location_name', label: 'Location' },
            { key: 'latitude', label: 'Latitude' },
            { key: 'longitude', label: 'Longitude' },
            { key: 'speed', label: 'Speed' },
            { key: 'recorded_at', label: 'Recorded At' },
          ]}
        />
      </Panel>

    </div>
  )
      case 'notifications':
        return (
          <Panel title="Notifications" subtitle={`${notifications.length} updates`}>
            <DataTable
              rows={notifications}
              columns={[
                { key: 'title', label: 'Title' },
                { key: 'message', label: 'Message' },
                { key: 'notification_type', label: 'Type' },
                {
                  key: 'is_read',
                  label: 'Read',
                  render: row => (
                    <StatusPill value={row.is_read ? 'Read' : 'Unread'} />
                  ),
                },
                {
                  key: 'action',
                  label: 'Action',
                  render: row =>
                    !row.is_read ? (
                      <button
                        className="secondary-button"
                        onClick={() => markNotificationRead(row.id)}
                      >
                        Mark Read
                      </button>
                    ) : (
                      '—'
                    ),
                },
              ]}
            />
          </Panel>
        )

      case 'users':
        return (
          <Panel title="Registered Users" subtitle={`${users.length} accounts`}>
            <DataTable
              rows={users}
              columns={[
                { key: 'username', label: 'Username' },
                { key: 'email', label: 'Email' },
                { key: 'role', label: 'Role' },
              ]}
            />
          </Panel>
        )

      case 'reports':
        return (
          <Panel title="Reports & Exports" subtitle="Download operational reports">
            <div className="report-grid">
              <ReportButton
                title="Delivery PDF"
                endpoint="/api/reports/delivery/pdf"
              />
              <ReportButton
                title="Maintenance PDF"
                endpoint="/api/reports/maintenance/pdf"
              />
              <ReportButton
                title="Delivery Excel"
                endpoint="/api/reports/delivery/excel"
              />
              <ReportButton
                title="Maintenance Excel"
                endpoint="/api/reports/maintenance/excel"
              />
            </div>
          </Panel>
        )

      default:
        return (
          <>
            <section className="welcome-banner">
              <div>
                <span className="welcome-kicker">FLEETFLOW CONTROL CENTER</span>
                <h2>
                  {isDriver
                    ? 'Welcome to your driver workspace.'
                    : isManager
                      ? 'Keep your fleet moving.'
                      : isDispatcher
                        ? 'Manage daily fleet operations.'
                        : 'Your fleet. One clear view.'}
                </h2>
                <p>
                  Monitor fleet operations, review records and manage daily
                  activities from one place.
                </p>
              </div>
              <div className="welcome-art">
                <span>F</span>
              </div>
            </section>

            <div className="metric-grid">
              {metrics.map(([label, value, icon, note]) => (
                <MetricCard
                  key={label}
                  label={label}
                  value={value}
                  icon={icon}
                  note={note}
                />
              ))}
            </div>

            <div className="overview-grid">
              <Panel title="Recent Trips" subtitle="Latest trip records">
                <DataTable
                  rows={trips.slice(0, 5)}
                  columns={[
                    { key: 'trip_name', label: 'Trip' },
                    { key: 'origin', label: 'Origin' },
                    { key: 'destination', label: 'Destination' },
                    {
                      key: 'status',
                      label: 'Status',
                      render: row => <StatusPill value={row.status} />,
                    },
                  ]}
                />
              </Panel>

              <Panel title="Recent Notifications" subtitle="Latest updates">
                <div className="activity-list">
                  {notifications.length === 0 ? (
                    <div className="empty-state">No recent notifications.</div>
                  ) : (
                    notifications.slice(0, 5).map(item => (
                      <div className="activity-item" key={item.id}>
                        <span className="activity-bullet">♢</span>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.message}</p>
                        </div>
                        <StatusPill
                          value={item.is_read ? 'Read' : 'Unread'}
                        />
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          </>
        )
    }
  }

  return (
    <div className={`app-shell role-${role}`}>
      <div
        className={`sidebar-overlay ${mobileMenuOpen ? 'show' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="brand-block">
          <div className="brand-mark">F</div>
          <div>
            <strong>FleetFlow</strong>
            <span>FLEET MANAGEMENT</span>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="side-nav">
          {allowedNavigation.map(([id, label, icon]) => (
            <button
              key={id}
              className={`nav-item ${
                activeSection === id ? 'active' : ''
              }`}
              onClick={() => {
                setActiveSection(id)
                setMobileMenuOpen(false)
                setMessage('')
                setError('')
              }}
            >
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-mini">
            <div className="user-avatar">
              {(auth.username || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="user-mini-copy">
              <strong>{auth.username}</strong>
              <span>{roleLabels[role] || auth.role}</span>
            </div>
          </div>

          <button className="logout-button" onClick={handleLogout}>
            <span>↪</span> Sign out
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu-button"
            onClick={() => setMobileMenuOpen(value => !value)}
            aria-label="Toggle menu"
          >
            ☰
          </button>

          <div className="breadcrumb">
            <span>FleetFlow</span>
            <b>/</b>
            <strong>{titleMap[activeSection] || 'Dashboard'}</strong>
          </div>

          <div className="topbar-actions">
            <span className="system-status">
              <i /> System online
            </span>

            <div className="topbar-avatar">
              {(auth.username || 'U').charAt(0).toUpperCase()}
            </div>

            <div className="topbar-user">
              <strong>{auth.username}</strong>
              <span>{roleLabels[role] || auth.role}</span>
            </div>

            <button
              className="refresh-button"
              onClick={loadData}
              disabled={loading}
            >
              ↻ <span>Refresh</span>
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="page-intro">
            <div>
              <div className="eyebrow">{roleLabels[role]}</div>
              <h1>{titleMap[activeSection] || 'Dashboard'}</h1>
              <p>
                {isDriver
                  ? 'View your trips and important notifications.'
                  : 'Monitor and manage your fleet operations.'}
              </p>
            </div>

            <div className="date-chip">● Live workspace</div>
          </div>

          {message && (
            <div className="alert success-alert">
              {message}
              <button onClick={() => setMessage('')}>×</button>
            </div>
          )}

          {error && <div className="alert error-alert">{error}</div>}

          {loading && (
            <div className="loading-line">
              <span /> Loading FleetFlow data...
            </div>
          )}

          {renderSection()}

          <footer className="app-footer">
            <span>FleetFlow</span>
            <span>Fleet Management Platform · 2026</span>
          </footer>
        </div>
      </main>
    </div>
  )
}

function ReportButton({ title, endpoint }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function downloadReport() {
    setLoading(true)
    setError('')

    try {
      const saved =
        localStorage.getItem('fleetflow_auth') ||
        sessionStorage.getItem('fleetflow_auth')

      const auth = saved ? JSON.parse(saved) : null

      const response = await fetch(`${API}${endpoint}`, {
        headers: auth?.access_token
          ? { Authorization: `Bearer ${auth.access_token}` }
          : {},
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.detail || 'Report download failed.')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = `${title.toLowerCase().replaceAll(' ', '_')}.${endpoint.endsWith('excel') ? 'xlsx' : 'pdf'}`

      document.body.appendChild(link)
      link.click()
      link.remove()

      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="report-card">
      <div className="report-icon">▥</div>
      <h3>{title}</h3>
      <p>Download the latest FleetFlow report.</p>
      <button
        className="secondary-button"
        onClick={downloadReport}
        disabled={loading}
      >
        {loading ? 'Downloading...' : 'Download Report'}
      </button>
      {error && <small className="report-feedback">{error}</small>}
    </article>
  )
}

export default App