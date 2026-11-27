import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import Login from './login'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

 const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
 const WS_API = API.replace(/^http/, 'ws')

const roleLabels = {
  admin: 'Administrator',
  manager: 'Fleet Manager',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
}

const navigation = {
  admin: [
    ['overview', 'Overview', '⌂'],
    ['performance', 'Fleet Performance', '▥'],
    ['vehicles', 'Vehicles', '▣'],
    ['drivers', 'Drivers', '♙'],
    ['trips', 'Trips & Assignments', '⇄'],
    ['shipments', 'Shipments', '▤'],
    ['maintenance', 'Maintenance', '⚒'],
    ['fuel', 'Fuel Analytics', '◉'],
    ['fuelAnalytics', 'Fuel Consumption Analysis', '◉'],
    ['tracking', 'Live Tracking', '⌖'],
    ['routeOptimization', 'Route Optimization', '↗'],
    ['trafficPlanning', 'Traffic Planning', '🚦'],
    ['reports', 'Reports & Exports', '▥'],
    ['users', 'User Management', '♧'],
  ],
  manager: [
    ['overview', 'Overview', '⌂'],
    ['performance', 'Fleet Performance', '▥'],
    ['vehicles', 'Vehicles', '▣'],
    ['drivers', 'Drivers', '♙'],
    ['trips', 'Trips', '⇄'],
    ['shipments', 'Shipments', '▤'],
    ['maintenance', 'Maintenance', '⚒'],
    ['fuel', 'Fuel Analytics', '◉'],
    ['fuelAnalytics', 'Fuel Consumption Analysis', '◉'],
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
  ],
  driver: [
    ['overview', 'My Dashboard', '⌂'],
    ['trips', 'My Trips', '⇄'],
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

function MetricCard({ label, value, note }) {
  return (
    <article className="metric-card">
      <div className="metric-card-top">
        <span className="metric-label">{label}</span>
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
  const [assignmentAvailability, setAssignmentAvailability] = useState({drivers: [],vehicles: [],})
  const [assignmentForm, setAssignmentForm] = useState({trip_id: '',driver_id: '',vehicle_id: '',})
  const [assignmentHistory, setAssignmentHistory] = useState([])
  const [assignmentLoading, setAssignmentLoading] = useState(false)
  const [trips, setTrips] = useState([])
  const [shipments, setShipments] = useState([])
  const [shipmentHistory, setShipmentHistory] = useState([])
  
  
  const [maintenance, setMaintenance] = useState([])
  const [historyVehicleId, setHistoryVehicleId] = useState('all')
  const [serviceHistory, setServiceHistory] = useState([])

const [serviceHistoryForm, setServiceHistoryForm] = useState({
  maintenance_id: '',
  service_date: '',
  repair_description: '',
  replacement_parts: '',
  actual_expense: '',
})

const [historyLoading, setHistoryLoading] = useState(false)
  const [fuel, setFuel] = useState([])
  const [performanceData, setPerformanceData] = useState(null)
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
  const [notificationOpen, setNotificationOpen] = useState(false)

  const unreadNotificationCount = notifications.filter(
    item => !item.is_read
  ).length
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


  const [fuelForm, setFuelForm] = useState({
  vehicle_id: '',
  fuel_type: 'Diesel',
  quantity: '',
  price_per_litre: '',
  fuel_date: new Date().toISOString().slice(0, 10),
  odometer_reading: '',
})

const [fuelFilters, setFuelFilters] = useState({
  vehicle_id: '',
  fuel_type: '',
  start_date: '',
  end_date: '',
})


const [maintenanceForm, setMaintenanceForm] = useState({
  vehicle_id: '',
  service_type: 'Engine Servicing',
  description: '',
  service_date: '',
  due_date: '',
  service_centre: '',
  estimated_cost: '',
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
        fetchData('/api/drivers'),
        fetchData('/api/assignments/availability'),
        fetchData('/api/assignments/history')
      )
    }

    if (isAdmin || isManager || isDispatcher) {
      requests.push(fetchData('/api/shipments'))
    }

    if (isAdmin || isManager || isDispatcher) {
      requests.push(fetchData('/api/maintenance'))
    }

    if (isAdmin || isManager) {
      requests.push(
        fetchData('/api/fuel'),
        fetchData('/api/analytics/fleet-performance')
      )
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

      setAssignmentAvailability(
        results[index] || { drivers: [], vehicles: [] }
      )
      index++

      setAssignmentHistory(results[index] || [])
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

      setPerformanceData(results[index] || null)
      index++
    } else {
      setFuel([])
      setPerformanceData(null)
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
  if (!auth?.access_token || (!isAdmin && !isManager)) return

  const refreshPerformance = async () => {
    try {
      const result = await fetchData('/api/analytics/fleet-performance')
      setPerformanceData(result || null)
    } catch (err) {
      console.error('Fleet Performance refresh failed:', err)
    }
  }

  const interval = setInterval(refreshPerformance, 30000)

  return () => clearInterval(interval)
}, [auth?.access_token, fetchData, isAdmin, isManager])


useEffect(() => {
  let socket
  let reconnectTimer
  let shouldReconnect = true

  const connectWebSocket = () => {
    if (!shouldReconnect) return

    setConnectionStatus('Connecting...')

    socket = new WebSocket(
  `${WS_API}/ws/tracking/1`
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



function addMaintenance(event) {
  event.preventDefault()

  const payload = {
    vehicle_id: Number(maintenanceForm.vehicle_id),
    service_type: maintenanceForm.service_type,
    description: maintenanceForm.description,
    service_date: maintenanceForm.service_date,
    due_date: maintenanceForm.due_date || null,
    service_centre: maintenanceForm.service_centre,
    estimated_cost:
      maintenanceForm.estimated_cost === ''
        ? null
        : Number(maintenanceForm.estimated_cost),
  }

  submitRecord(
    '/api/maintenance',
    payload,
    'Maintenance scheduled successfully.',
    () =>
      setMaintenanceForm({
        vehicle_id: '',
        service_type: 'Engine Servicing',
        description: '',
        service_date: '',
        due_date: '',
        service_centre: '',
        estimated_cost: '',
      })
  )
}

  async function addFuelRecord(event) {
  event.preventDefault()
  setError('')
  setMessage('')

  const totalCost =
    Number(fuelForm.quantity) * Number(fuelForm.price_per_litre)

  const params = new URLSearchParams({
    vehicle_id: fuelForm.vehicle_id,
    fuel_type: fuelForm.fuel_type,
    quantity: fuelForm.quantity,
    cost: totalCost.toFixed(2),
    fuel_date: fuelForm.fuel_date,
    odometer_reading: fuelForm.odometer_reading,
  })

  try {
    const response = await fetch(`${API}/api/fuel?${params.toString()}`, {
      method: 'POST',
      headers: authHeaders(),
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(result.detail || 'Unable to save fuel record.')
    }

    setMessage('Fuel record added successfully.')

    setFuelForm({
      vehicle_id: '',
      fuel_type: 'Diesel',
      quantity: '',
      price_per_litre: '',
      fuel_date: new Date().toISOString().slice(0, 10),
      odometer_reading: '',
    })

    await loadData()
  } catch (err) {
    setError(err.message)
  }
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

async function loadMaintenanceHistory(vehicleId = 'all') {
  setHistoryLoading(true)
  setError('')

  try {
    const endpoint =
      vehicleId === 'all'
        ? '/api/maintenance/history'
        : `/api/vehicles/${vehicleId}/maintenance-history`

    const data = await fetchData(endpoint)

    setServiceHistory(Array.isArray(data) ? data : [])
  } catch (err) {
    setError(err.message || 'Unable to load maintenance history.')
    setServiceHistory([])
  } finally {
    setHistoryLoading(false)
  }
}

async function addMaintenanceHistory(event) {
  event.preventDefault()
  setMessage('')
  setError('')

  const payload = {
    maintenance_id: Number(serviceHistoryForm.maintenance_id),
    service_date: serviceHistoryForm.service_date,
    repair_description: serviceHistoryForm.repair_description.trim(),
    replacement_parts:
      serviceHistoryForm.replacement_parts.trim() || null,
    actual_expense: Number(serviceHistoryForm.actual_expense),
  }

  try {
    const response = await fetch(`${API}/api/maintenance/history`, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(result.detail || 'Unable to save service history.')
    }

    setMessage('Maintenance service history saved successfully.')

    setServiceHistoryForm({
      maintenance_id: '',
      service_date: '',
      repair_description: '',
      replacement_parts: '',
      actual_expense: '',
    })

    await loadMaintenanceHistory(historyVehicleId)
  } catch (err) {
    setError(err.message)
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
  
  async function assignTrip() {
  setAssignmentLoading(true)
  setError('')
  setMessage('')

  try {
    const response = await fetch(
      `${API}/api/trips/${assignmentForm.trip_id}/assign`,
      {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          driver_id: Number(assignmentForm.driver_id),
          vehicle_id: Number(assignmentForm.vehicle_id),
        }),
      }
    )

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(
        result.detail || 'Unable to assign driver and vehicle.'
      )
    }

    setMessage(
      result.message || 'Driver and vehicle assigned successfully.'
    )

    setAssignmentForm({
      trip_id: '',
      driver_id: '',
      vehicle_id: '',
    })

    await loadData()

  } catch (err) {
    setError(err.message)
  } finally {
    setAssignmentLoading(false)
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
    performance: 'Fleet Performance',
    vehicles: 'Vehicle Management',
    drivers: 'Driver Management',
    trips: isDriver ? 'My Trips' : 'Trip Management',
    shipments: 'Shipment Management',
    maintenance: 'Maintenance Management',
    fuel: 'Fuel  Analysis',
    fuelAnalytics: 'Fuel Consumption Analysis',
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
    <>
      {!isDriver && (
        <>
          <Panel
            title="Driver & Vehicle Assignment"
            subtitle="Assign an available driver and vehicle to an existing trip"
          >
            <form
              className="assignment-form"
              onSubmit={e => {
                e.preventDefault()
                assignTrip()
              }}
            >
              <div className="assignment-trip-field">
                <label>Select Trip</label>
                <select
                  required
                  value={assignmentForm.trip_id}
                  onChange={e =>
                    setAssignmentForm({
                      ...assignmentForm,
                      trip_id: e.target.value,
                    })
                  }
                >
                  <option value="">Select Trip</option>
                  {trips
                    .filter(
                      trip =>
                        !['Completed', 'Cancelled'].includes(trip.status)
                    )
                    .map(trip => (
                      <option key={trip.id} value={trip.id}>
                        {trip.trip_name} ({trip.origin} - {trip.destination})
                      </option>
                    ))}
                </select>
              </div>

              <div className="assignment-fields-row">
                <div>
                  <label>Select Driver</label>
                  <select
                    required
                    value={assignmentForm.driver_id}
                    onChange={e =>
                      setAssignmentForm({
                        ...assignmentForm,
                        driver_id: e.target.value,
                      })
                    }
                  >
                    <option value="">Select Available Driver</option>
                    {assignmentAvailability.drivers.map(driver => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Select Vehicle</label>
                  <select
                    required
                    value={assignmentForm.vehicle_id}
                    onChange={e =>
                      setAssignmentForm({
                        ...assignmentForm,
                        vehicle_id: e.target.value,
                      })
                    }
                  >
                    <option value="">Select Available Vehicle</option>
                    {assignmentAvailability.vehicles.map(vehicle => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.vehicle_number} - {vehicle.model}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="assignment-submit-row">
                <button
                  type="submit"
                  className="assignment-submit-button"
                  disabled={assignmentLoading}
                >
                  {assignmentLoading ? 'Assigning...' : 'Assign Trip'}
                </button>
              </div>
            </form>
          </Panel>

          <Panel
            title="Assignment History"
            subtitle={`${assignmentHistory.length} assignment records`}
          >
            <DataTable
              rows={assignmentHistory}
              columns={[
                { key: 'driver_name', label: 'Driver' },
                { key: 'vehicle_number', label: 'Vehicle' },
                { key: 'trip_name', label: 'Trip' },
                { key: 'origin', label: 'Origin' },
                { key: 'destination', label: 'Destination' },
                {
                  key: 'assignment_date',
                  label: 'Assignment Date',
                  render: row =>
                    row.assignment_date
                      ? new Date(row.assignment_date).toLocaleString()
                      : 'Not Available',
                },
                {
                  key: 'assignment_status',
                  label: 'Assignment Status',
                  render: row => (
                    <StatusPill value={row.assignment_status} />
                  ),
                },
                {
                  key: 'trip_status',
                  label: 'Trip Status',
                  render: row => <StatusPill value={row.trip_status} />,
                },
              ]}
            />
          </Panel>
        </>
      )}

      <Panel
        title="Trip Records"
        subtitle={`${trips.length} trips`}
      >
        <DataTable
          rows={trips}
          columns={[
            { key: 'trip_name', label: 'Trip Name' },
            { key: 'origin', label: 'Origin' },
            { key: 'destination', label: 'Destination' },
            {
              key: 'estimated_arrival',
              label: 'Estimated Arrival',
              render: row =>
                row.estimated_arrival
                  ? new Date(row.estimated_arrival).toLocaleString()
                  : 'Not Available',
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
    </>
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



      

case 'maintenance': {
  const today = new Date().toISOString().split('T')[0]

  const activeMaintenance = maintenance.filter(
    row => !['Completed', 'Cancelled'].includes(row.status)
  )

  const underMaintenance = vehicles.filter(
    vehicle =>
      String(vehicle.status || '').toLowerCase().includes('maintenance')
  ).length

  const upcomingMaintenance = activeMaintenance.filter(
    row => row.due_date >= today
  ).length

  const overdueMaintenance = activeMaintenance.filter(
    row => row.due_date < today
  ).length

  const updateMaintenanceStatus = async (id, status) => {
  setMessage('')
  setError('')

  try {
    let operationalConfirmed = false

    if (status === 'Completed') {
      operationalConfirmed = window.confirm(
        'Is the vehicle operational and ready for use?'
      )
    }

    const response = await fetch(
      `${API}/api/maintenance/${id}/status?status=${encodeURIComponent(status)}&operational_confirmed=${operationalConfirmed}`,
      {
        method: 'PATCH',
        headers: authHeaders(),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to update maintenance status')
    }

    setMessage('Maintenance status updated successfully.')
    await loadData()

  } catch (err) {
    setError(err.message)
  }
}

  return (
    <div className="dashboard-content">

      <Panel
        title="Maintenance Management"
        subtitle="Monitor vehicle maintenance and service schedules"
      >
        <div className="metric-grid">
          <MetricCard label="Total Vehicles" value={vehicles.length} />
          <MetricCard label="Under Maintenance" value={underMaintenance} />
          <MetricCard label="Upcoming Maintenance" value={upcomingMaintenance} />
          <MetricCard label="Overdue Maintenance" value={overdueMaintenance} />
        </div>
      </Panel>

      <Panel
        title="Registered Vehicles"
        subtitle={`${vehicles.length} registered vehicles`}
      >
        <DataTable
          rows={vehicles}
          columns={[
            { key: 'vehicle_number', label: 'Registration Number' },
            { key: 'vehicle_type', label: 'Vehicle Type' },
            {
              key: 'status',
              label: 'Availability Status',
              render: row => <StatusPill value={row.status} />,
            },
          ]}
          empty="No registered vehicles found."
        />
      </Panel>

      {(isAdmin || isManager) && (
        <Panel
          title="Schedule Maintenance"
          subtitle="Create a new vehicle service appointment"
        >
          <div className="form-area">
            <form className="record-form" onSubmit={addMaintenance}>
              <select
                value={maintenanceForm.vehicle_id}
                onChange={e =>
                  setMaintenanceForm({
                    ...maintenanceForm,
                    vehicle_id: e.target.value,
                  })
                }
                required
              >
                <option value="">Select Vehicle</option>
                {vehicles.map(vehicle => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.vehicle_number} - {vehicle.model}
                  </option>
                ))}
              </select>

              <select
                value={maintenanceForm.service_type}
                onChange={e =>
                  setMaintenanceForm({
                    ...maintenanceForm,
                    service_type: e.target.value,
                  })
                }
                required
              >
                <option>Engine Servicing</option>
                <option>Oil Change</option>
                <option>Tyre Replacement</option>
                <option>Brake Inspection</option>
                <option>General Servicing</option>
                <option>Unexpected Repairs</option>
              </select>

              <input
                type="text"
             placeholder="Service Description"
                value={maintenanceForm.description}
                onChange={e =>
                  setMaintenanceForm({
                    ...maintenanceForm,
                    description: e.target.value,
                  })
                }
              />

              <label>Scheduled Service Date</label>
              <input
                type="date"
                value={maintenanceForm.service_date}
                onChange={e =>
                  setMaintenanceForm({
                    ...maintenanceForm,
                    service_date: e.target.value,
                  })
                }
                required
              />

              <label>Maintenance Due Date</label>
              <input
                type="date"
                min={maintenanceForm.service_date || undefined}
                value={maintenanceForm.due_date}
                onChange={e =>
                  setMaintenanceForm({
                    ...maintenanceForm,
                    due_date: e.target.value,
                  })
                }
              />

              <input
                type="text"
                placeholder="Service Centre"
                value={maintenanceForm.service_centre}
                onChange={e =>
                  setMaintenanceForm({
                    ...maintenanceForm,
                    service_centre: e.target.value,
                  })
                }
              />

              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Estimated Cost (₹)"
                value={maintenanceForm.estimated_cost}
                onChange={e =>
                  setMaintenanceForm({
                    ...maintenanceForm,
                    estimated_cost: e.target.value,
                  })
                }
              />

              <button className="primary-button" type="submit">
                Schedule Maintenance
              </button>
            </form>
          </div>
        </Panel>
      )}

      <Panel
        title="Maintenance Records"
        subtitle={`${maintenance.length} total records`}
      >
        <DataTable
          rows={maintenance}
          columns={[
            {
              key: 'vehicle_number',
              label: 'Vehicle Number',
              render: row => row.vehicle_number || `Vehicle ${row.vehicle_id}`,
            },
            { key: 'service_type', label: 'Maintenance Type' },
            { key: 'service_date', label: 'Service Date' },
            { key: 'due_date', label: 'Due Date' },
            {
              key: 'service_centre',
              label: 'Service Centre',
              render: row => row.service_centre || '—',
            },
            {
              key: 'estimated_cost',
              label: 'Estimated Cost',
              render: row =>
                row.estimated_cost != null
                  ? `₹${Number(row.estimated_cost).toLocaleString('en-IN')}`
                  : '—',
            },
            {
              key: 'status',
              label: 'Status',
              render: row => <StatusPill value={row.status} />,
            },
            {
              key: 'actions',
              label: 'Update Status',
              render: row =>
                isAdmin || isManager ? (
                
                  <select
                    value={row.status}
                    onChange={event =>
                      updateMaintenanceStatus(row.id, event.target.value)
                    }
                  >
                    <option value="Scheduled">Scheduled</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      </Panel>

      <Panel
        title="Vehicle Service History"
        subtitle="Actual completed service records from the database"
      >
        <div className="form-area">
          <label htmlFor="history-vehicle">Select Vehicle</label>

          <select
            id="history-vehicle"
            value={historyVehicleId}
            onChange={event => {
              const vehicleId = event.target.value
              setHistoryVehicleId(vehicleId)
              loadMaintenanceHistory(vehicleId)
            }}
          >
            <option value="all">All Vehicles</option>

            {vehicles.map(vehicle => (
              <option key={vehicle.id} value={String(vehicle.id)}>
                {vehicle.vehicle_number}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="secondary-button"
            onClick={() => loadMaintenanceHistory(historyVehicleId)}
            disabled={historyLoading}
          >
            {historyLoading ? 'Loading...' : 'Refresh History'}
          </button>
        </div>

        <DataTable
          rows={serviceHistory}
          columns={[
            { key: 'vehicle_number', label: 'Vehicle Number' },
            { key: 'maintenance_id', label: 'Maintenance ID' },
            { key: 'service_date', label: 'Service Date' },
            { key: 'repair_description', label: 'Repair Description' },
            {
              key: 'replacement_parts',
              label: 'Replacement Parts',
              render: row => row.replacement_parts || '—',
            },
            {
              key: 'actual_expense',
              label: 'Actual Expense',
              render: row =>
                `₹${Number(row.actual_expense).toLocaleString('en-IN')}`,
            },
          ]}
          empty="No service history records found."
        />
      </Panel>

      {(isAdmin || isManager) && (
        <Panel
          title="Add Service History"
          subtitle="Record actual expenses and completed repair details"
        >
          <div className="form-area">
            <form
              className="record-form"
              onSubmit={addMaintenanceHistory}
            >
              <label>Completed Maintenance Record</label>

              <select
                value={serviceHistoryForm.maintenance_id}
                onChange={event =>
                  setServiceHistoryForm({
                    ...serviceHistoryForm,
                    maintenance_id: event.target.value,
                  })
                }
                required
              >
                <option value="">Select Completed Maintenance</option>

                {maintenance
                  .filter(row => row.status === 'Completed')
                  .map(row => (
                    <option key={row.id} value={row.id}>
                      {row.vehicle_number || `Vehicle ${row.vehicle_id}`}
                      {' - '}
                      {row.service_type}
                      {' (ID: '}
                      {row.id}
                      {')'}
                    </option>
                  ))}
              </select>

              <label>Actual Service Date</label>
              <input
                type="date"
                value={serviceHistoryForm.service_date}
                onChange={event =>
                  setServiceHistoryForm({
                    ...serviceHistoryForm,
                    service_date: event.target.value,
                  })
                }
                required
              />

              <input
                type="text"
                placeholder="Repair Description"
                value={serviceHistoryForm.repair_description}
                onChange={event =>
                  setServiceHistoryForm({
                    ...serviceHistoryForm,
                    repair_description: event.target.value,
                  })
                }
                required
              />

              <input
                type="text"
                placeholder="Replacement Parts (Optional)"
                value={serviceHistoryForm.replacement_parts}
                onChange={event =>
                  setServiceHistoryForm({
                    ...serviceHistoryForm,
                    replacement_parts: event.target.value,
                  })
                }
              />

              <label>Actual Expense (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Enter Actual Expense"
                value={serviceHistoryForm.actual_expense}
                onChange={event =>
                  setServiceHistoryForm({
                    ...serviceHistoryForm,
                    actual_expense: event.target.value,
                  })
                }
                required
              />

              <button className="primary-button" type="submit">
                Save Service History
              </button>
            </form>
          </div>
        </Panel>
      )}

    </div>
  )
}



      case 'fuel': {
  const filteredFuel = fuel.filter(item => {
    const vehicleMatch =
      !fuelFilters.vehicle_id ||
      String(item.vehicle_id) === fuelFilters.vehicle_id

    const typeMatch =
      !fuelFilters.fuel_type ||
      item.fuel_type === fuelFilters.fuel_type

    const recordDate = String(item.fuel_date || '').slice(0, 10)

    const startMatch =
      !fuelFilters.start_date || recordDate >= fuelFilters.start_date

    const endMatch =
      !fuelFilters.end_date || recordDate <= fuelFilters.end_date

    return vehicleMatch && typeMatch && startMatch && endMatch
  })

  const totalQuantity = filteredFuel.reduce(
    (sum, item) => sum + Number(item.quantity || 0), 0
  )

  const totalExpense = filteredFuel.reduce(
    (sum, item) => sum + Number(item.cost || 0), 0
  )

  const vehicleExpenses = vehicles.map(vehicle => {
    const records = filteredFuel.filter(
      item => Number(item.vehicle_id) === Number(vehicle.id)
    )

    return {
      id: vehicle.id,
      name: vehicle.vehicle_number,
      quantity: records.reduce(
        (sum, item) => sum + Number(item.quantity || 0), 0
      ),
      cost: records.reduce(
        (sum, item) => sum + Number(item.cost || 0), 0
      ),
    }
  }).filter(item => item.cost > 0)

  const maxExpense = Math.max(
    ...vehicleExpenses.map(item => item.cost),
    1
  )

  const calculatedCost =
    Number(fuelForm.quantity || 0) *
    Number(fuelForm.price_per_litre || 0)

  return (
    <>
      <Panel title="Fuel Monitoring Overview" subtitle="Live fuel consumption and expenditure">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16
        }}>
          <MetricCard
            label="Total Fuel Consumed"
            value={`${totalQuantity.toFixed(2)} L`}
            icon="⛽"
          />
          <MetricCard
            label="Total Fuel Expense"
            value={`₹${totalExpense.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
            icon="₹"
          />
          <MetricCard
            label="Fuel Records"
            value={filteredFuel.length}
            icon="▤"
          />
          <MetricCard
            label="Vehicles Refuelled"
            value={vehicleExpenses.length}
            icon="🚚"
          />
        </div>
      </Panel>

      <Panel title="Registered Vehicles" subtitle={`${vehicles.length} registered vehicles`}>
        <DataTable
          rows={vehicles}
          columns={[
            { key: 'vehicle_number', label: 'Registration Number' },
            { key: 'vehicle_type', label: 'Vehicle Type' },
            {
              key: 'id',
              label: 'Fuel Type',
              render: () => 'Recorded per transaction',
            },
          ]}
        />
      </Panel>

      <Panel title="Add Fuel Record" subtitle="Record a new vehicle refuelling transaction">
        <div className="form-area">
          <form className="record-form" onSubmit={addFuelRecord}>
            <select
              value={fuelForm.vehicle_id}
              onChange={e => setFuelForm({
                ...fuelForm,
                vehicle_id: e.target.value,
              })}
              required
            >
              <option value="">Select Vehicle</option>
              {vehicles.map(vehicle => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.vehicle_number} - {vehicle.vehicle_type}
                </option>
              ))}
            </select>

            <select
              value={fuelForm.fuel_type}
              onChange={e => setFuelForm({
                ...fuelForm,
                fuel_type: e.target.value,
              })}
            >
              <option value="Diesel">Diesel</option>
              <option value="Petrol">Petrol</option>
              <option value="CNG">CNG</option>
              <option value="Electric">Electric</option>
            </select>

            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Fuel Quantity (Litres)"
              value={fuelForm.quantity}
              onChange={e => setFuelForm({
                ...fuelForm,
                quantity: e.target.value,
              })}
              required
            />

            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Price Per Litre (₹)"
              value={fuelForm.price_per_litre}
              onChange={e => setFuelForm({
                ...fuelForm,
                price_per_litre: e.target.value,
              })}
              required
            />

            <input
              type="date"
              value={fuelForm.fuel_date}
              onChange={e => setFuelForm({
                ...fuelForm,
                fuel_date: e.target.value,
              })}
              required
            />

            <input
              type="number"
              min="0"
              step="0.1"
              placeholder="Odometer Reading (km)"
              value={fuelForm.odometer_reading}
              onChange={e => setFuelForm({
                ...fuelForm,
                odometer_reading: e.target.value,
              })}
              required
            />

            <div style={{
              gridColumn: '1 / -1',
              padding: 16,
              background: '#f1f5f9',
              borderRadius: 10,
              fontWeight: 700,
              color: '#17365d',
            }}>
              Total Expenditure: ₹{calculatedCost.toFixed(2)}
            </div>

            <button className="primary-button" type="submit">
              Save Fuel Record
            </button>
          </form>
        </div>
      </Panel>

      <Panel title="Fuel Analytics" subtitle="Filter fuel consumption and expenses">
        <div className="record-form" style={{ marginBottom: 20 }}>
          <select
            value={fuelFilters.vehicle_id}
            onChange={e => setFuelFilters({
              ...fuelFilters,
              vehicle_id: e.target.value,
            })}
          >
            <option value="">All Vehicles</option>
            {vehicles.map(vehicle => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.vehicle_number}
              </option>
            ))}
          </select>

          <select
            value={fuelFilters.fuel_type}
            onChange={e => setFuelFilters({
              ...fuelFilters,
              fuel_type: e.target.value,
            })}
          >
            <option value="">All Fuel Types</option>
            <option value="Diesel">Diesel</option>
            <option value="Petrol">Petrol</option>
            <option value="CNG">CNG</option>
            <option value="Electric">Electric</option>
          </select>

          <input
            type="date"
            value={fuelFilters.start_date}
            onChange={e => setFuelFilters({
              ...fuelFilters,
              start_date: e.target.value,
            })}
          />

          <input
            type="date"
            value={fuelFilters.end_date}
            onChange={e => setFuelFilters({
              ...fuelFilters,
              end_date: e.target.value,
            })}
          />

          <button
            type="button"
            className="secondary-button"
            onClick={() => setFuelFilters({
              vehicle_id: '',
              fuel_type: '',
              start_date: '',
              end_date: '',
            })}
          >
            Clear Filters
          </button>
        </div>

        <h3>Vehicle-wise Fuel Expenses</h3>

        {vehicleExpenses.length === 0 ? (
          <p>No fuel expense records available for these filters.</p>
        ) : vehicleExpenses.map(item => (
          <div key={item.id} style={{ marginBottom: 18 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 6,
            }}>
              <strong>{item.name}</strong>
              <strong>₹{item.cost.toFixed(2)}</strong>
            </div>
            <div style={{
              height: 10,
              background: '#e2e8f0',
              borderRadius: 20,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${(item.cost / maxExpense) * 100}%`,
                height: '100%',
                background: '#2563eb',
                borderRadius: 20,
              }} />
            </div>
            <small>{item.quantity.toFixed(2)} Litres consumed</small>
          </div>
        ))}
      </Panel>

      <Panel title="Fuel History" subtitle={`${filteredFuel.length} matching transactions`}>
        <DataTable
          rows={filteredFuel}
          columns={[
            {
              key: 'vehicle_id',
              label: 'Vehicle',
              render: row =>
                vehicles.find(v => Number(v.id) === Number(row.vehicle_id))
                  ?.vehicle_number || `Vehicle ${row.vehicle_id}`,
            },
            { key: 'fuel_type', label: 'Fuel Type' },
            {
              key: 'quantity',
              label: 'Quantity (L)',
              render: row => Number(row.quantity).toFixed(2),
            },
            {
              key: 'cost',
              label: 'Total Expense',
              render: row => `₹${Number(row.cost).toFixed(2)}`,
            },
            {
              key: 'cost',
              label: 'Price/Litre',
              render: row =>
                Number(row.quantity) > 0
                  ? `₹${(Number(row.cost) / Number(row.quantity)).toFixed(2)}`
                  : '—',
            },
            { key: 'fuel_date', label: 'Date' },
            { key: 'odometer_reading', label: 'Odometer (km)' },
          ]}
        />
      </Panel>
    </>
  )
}

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
    <div className="traffic-planning-page">

      <div className="traffic-page-heading">
        <div>
          <h2>Traffic-Aware Route Planning</h2>
          <p>
            Plan efficient routes and monitor traffic conditions
            before starting your journey.
          </p>
        </div>

        <span className="traffic-live-label">
          <span className="traffic-live-dot"></span>
          Route Planning
        </span>
      </div>

      <Panel
        title="Plan Your Route"
        subtitle="Enter journey details and select the expected traffic level"
      >
        <form
          className="traffic-planning-form"
          onSubmit={e => {
            e.preventDefault()
            calculateTrafficRoute()
          }}
        >
          <div className="traffic-form-grid">

            <div className="traffic-field">
              <label>Origin</label>
              <input
                type="text"
                value={routeOrigin}
                onChange={e => setRouteOrigin(e.target.value)}
                placeholder="Enter starting location"
                required
              />
            </div>

            <div className="traffic-field">
              <label>Destination</label>
              <input
                type="text"
                value={routeDestination}
                onChange={e => setRouteDestination(e.target.value)}
                placeholder="Enter destination"
                required
              />
            </div>

            <div className="traffic-field traffic-level-field">
              <label>Traffic Level</label>
              <select
                value={trafficLevel}
                onChange={e => setTrafficLevel(e.target.value)}
              >
                <option value="low">Low Traffic</option>
                <option value="moderate">Moderate Traffic</option>
                <option value="high">High Traffic</option>
                <option value="severe">Severe Traffic</option>
              </select>
            </div>

          </div>

          <div className="traffic-form-footer">
            <p>Enter both locations to calculate your route.</p>

            <button
              type="submit"
              className="traffic-calculate-button"
              disabled={trafficLoading}
            >
              {trafficLoading
                ? 'Calculating Route...'
                : 'Calculate Traffic Route'}
            </button>
          </div>
        </form>
      </Panel>

      {trafficError && (
        <div className="traffic-error-message">
          {trafficError}
        </div>
      )}

      {trafficResult && (
        <div className="traffic-results-section">

          <div className="traffic-results-heading">
            <div>
              <h3>Route Analysis Results</h3>
              <p>Traffic-adjusted journey information</p>
            </div>
            <span className="traffic-result-badge">
              Route Calculated
            </span>
          </div>

          <div className="traffic-route-summary">
            <div className="traffic-location-card">
              <span>ORIGIN</span>
              <strong>{trafficResult.origin}</strong>
            </div>

            <div className="traffic-location-arrow">
              →
            </div>

            <div className="traffic-location-card">
              <span>DESTINATION</span>
              <strong>{trafficResult.destination}</strong>
            </div>
          </div>

          <div className="traffic-metrics-grid">

            <div className="traffic-metric-card">
              <span>Distance</span>
              <strong>{trafficResult.distance_km} km</strong>
            </div>

            <div className="traffic-metric-card">
              <span>Normal Travel Time</span>
              <strong>
                {trafficResult.original_duration_minutes} min
              </strong>
            </div>

            <div className="traffic-metric-card traffic-highlight-card">
              <span>Traffic-Adjusted Time</span>
              <strong>
                {trafficResult.estimated_duration_minutes} min
              </strong>
            </div>

            <div className="traffic-metric-card">
              <span>Expected Delay</span>
              <strong>
                {trafficResult.delay_minutes} min
              </strong>
            </div>

          </div>

          <div className="traffic-status-card">
            <div>
              <span>Traffic Condition</span>
              <strong>
                {trafficResult.traffic_level.toUpperCase()}
              </strong>
            </div>

            <p>{trafficResult.traffic_status}</p>
          </div>

          {trafficResult.route_coordinates?.length > 0 && (
            <div className="traffic-map-section">
              <div className="traffic-map-heading">
                <h3>Route Map</h3>
                <p>Visual representation of the calculated route</p>
              </div>

              <div className="traffic-map-container">
                <MapContainer
                  center={trafficResult.route_coordinates[0]}
                  zoom={7}
                  style={{
                    height: '420px',
                    width: '100%',
                  }}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap contributors"
                  />
                  <Polyline
                    positions={trafficResult.route_coordinates}
                    pathOptions={{
                      color: '#2563a6',
                      weight: 5,
                    }}
                  />
                </MapContainer>
              </div>
            </div>
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



case 'fuelAnalytics': {
  const fuelAnalytics = performanceData?.fuel_analytics || {}
  const fuelRecords = Array.isArray(fuel) ? fuel : []

  const totalQuantity = Number(fuelAnalytics.total_quantity || 0)
  const totalCost = Number(fuelAnalytics.total_cost || 0)
  const totalRecords = Number(fuelAnalytics.total_records || 0)

  // Vehicle-wise fuel analysis
  const vehicleFuel = fuelRecords.reduce((result, item) => {
    const vehicleName =
      item.vehicle_number ||
      item.vehicle?.vehicle_number ||
      `Vehicle ${item.vehicle_id || 'Unknown'}`

    if (!result[vehicleName]) {
      result[vehicleName] = {
        quantity: 0,
        cost: 0,
        records: 0,
      }
    }

    result[vehicleName].quantity += Number(
      item.quantity ?? item.fuel_quantity ?? 0
    )

    result[vehicleName].cost += Number(
      item.total_cost ?? item.cost ?? 0
    )

    result[vehicleName].records += 1

    return result
  }, {})

  const vehicleRows = Object.entries(vehicleFuel)

  // Monthly fuel analysis
  const monthlyFuel = fuelRecords.reduce((result, item) => {
    const date = item.date || item.fuel_date || item.created_at

    if (!date) return result

    const parsedDate = new Date(date)

    if (Number.isNaN(parsedDate.getTime())) return result

    const monthKey = `${parsedDate.getFullYear()}-${String(
      parsedDate.getMonth() + 1
    ).padStart(2, '0')}`

    const monthLabel = parsedDate.toLocaleString('en-IN', {
      month: 'short',
      year: 'numeric',
    })

    if (!result[monthKey]) {
      result[monthKey] = {
        month: monthLabel,
        quantity: 0,
        cost: 0,
        records: 0,
      }
    }

    result[monthKey].quantity += Number(
      item.quantity ?? item.fuel_quantity ?? 0
    )

    result[monthKey].cost += Number(
      item.total_cost ?? item.cost ?? 0
    )

    result[monthKey].records += 1

    return result
  }, {})

  const monthlyFuelRows = Object.entries(monthlyFuel)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, item]) => item)

  const maxMonthlyQuantity = Math.max(
    ...monthlyFuelRows.map((item) => item.quantity),
    1
  )

  return (
    <div>
      {/* Fuel Summary */}
      <Panel
        title="Fuel Consumption Analysis"
        subtitle="Actual fuel records from FleetFlow"
      >
        <div className="metrics-grid">
          <MetricCard
            label="Total Fuel Records"
            value={totalRecords}
          
          />

          <MetricCard
            label="Total Fuel Consumption"
            value={`${totalQuantity.toLocaleString('en-IN')} L`}
            
          />

          <MetricCard
            label="Total Fuel Expenditure"
            value={`₹${totalCost.toLocaleString('en-IN')}`}
            
          />

          <MetricCard
            label="Average Cost per Litre"
            value={`₹${
              totalQuantity > 0
                ? (totalCost / totalQuantity).toFixed(2)
                : '0.00'
            }`}
            
          />
        </div>
      </Panel>

      
{/* Vehicle-wise Fuel Consumption */}
<Panel
  title="Vehicle-wise Fuel Consumption"
  subtitle="Consumption and expenditure by vehicle"
>
  <div className="fuel-table-wrap">
    <table className="fuel-analysis-table">
      <thead>
        <tr>
          <th>Vehicle</th>
          <th>Fuel Records</th>
          <th>Quantity (L)</th>
          <th>Total Cost</th>
        </tr>
      </thead>

      <tbody>
        {vehicleRows.length > 0 ? (
          vehicleRows.map(([name, item]) => (
            <tr key={name}>
              <td className="fuel-vehicle-name">{name}</td>
              <td>{item.records}</td>
              <td>{item.quantity.toLocaleString('en-IN')}</td>
              <td className="fuel-cost">
                ₹{item.cost.toLocaleString('en-IN')}
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan="4" className="fuel-empty">
              No fuel records available.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</Panel>

{/* Monthly Fuel Consumption Table */}
<Panel
  title="Monthly Fuel Consumption"
  subtitle="Month-wise fuel quantity and expenditure"
>
  <div className="fuel-table-wrap">
    <table className="fuel-analysis-table">
      <thead>
        <tr>
          <th>Month</th>
          <th>Fuel Records</th>
          <th>Quantity (L)</th>
          <th>Total Cost</th>
        </tr>
      </thead>

      <tbody>
        {monthlyFuelRows.length > 0 ? (
          monthlyFuelRows.map(item => (
            <tr key={item.month}>
              <td className="fuel-vehicle-name">{item.month}</td>
              <td>{item.records}</td>
              <td>{item.quantity.toLocaleString('en-IN')}</td>
              <td className="fuel-cost">
                ₹{item.cost.toLocaleString('en-IN')}
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan="4" className="fuel-empty">
              No monthly fuel data available.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</Panel>

{/* Monthly Fuel Consumption Chart */}
<Panel
  title="Monthly Fuel Consumption Trend"
  subtitle="Visual comparison of month-wise fuel consumption"
>
  {monthlyFuelRows.length > 0 ? (
    <div className="fuel-chart-container">

      <div className="fuel-chart-heading">
        <div>
          <h4>Fuel Consumption</h4>
          <p>Monthly quantity in litres</p>
        </div>

        <div className="fuel-chart-legend">
          <span className="fuel-legend-dot" />
          <span>Fuel consumed</span>
        </div>
      </div>

      <div className="fuel-chart">
        {monthlyFuelRows.map(item => {
          const percentage =
            maxMonthlyQuantity > 0
              ? (item.quantity / maxMonthlyQuantity) * 100
              : 0

          return (
            <div
              className="fuel-chart-column"
              key={item.month}
            >
              <div className="fuel-chart-value">
                {item.quantity.toLocaleString('en-IN')} L
              </div>

              <div className="fuel-chart-bar-area">
                <div
                  className="fuel-chart-bar"
                  style={{
                    height: `${percentage}%`,
                    minHeight: item.quantity > 0 ? '5px' : '0',
                  }}
                  title={`${item.month}: ${item.quantity.toLocaleString('en-IN')} L`}
                />
              </div>

              <div className="fuel-chart-month">
                {item.month}
              </div>
            </div>
          )
        })}
      </div>

      <div className="fuel-chart-footer">
        <span>Monthly consumption overview</span>
        <strong>
          {monthlyFuelRows
            .reduce((total, item) => total + item.quantity, 0)
            .toLocaleString('en-IN')} L total
        </strong>
      </div>
    </div>
  ) : (
    <p>No monthly fuel data available.</p>
  )}
</Panel>
</div>
)
}
 
case 'performance': {
  const data = performanceData || {}

  const fleet = data.fleet_summary || {}
  const drivers = data.driver_summary || {}
  const trips = data.trip_analytics || {}
  const delivery = data.delivery_analytics || {}
  const maintenanceData = data.maintenance_analytics || {}
  const fuelData = data.fuel_analytics || {}

  const formatCurrency = (value) =>
    `₹${Number(value || 0).toLocaleString('en-IN')}`

  const formatPercent = (value) =>
    `${Number(value || 0).toFixed(1)}%`

  const vehicleRows = data.vehicle_performance || []
  const driverRows = data.driver_performance || []
  const routeRows = data.route_performance || []
  const insights = data.operational_insights || []

  return (
    <div>
      <Panel
        title="Fleet Overview"
        subtitle="Vehicle utilization and fleet availability"
      >
        <div className="metrics-grid">
          <MetricCard
            label="Total Vehicles"
            value={fleet.total_vehicles ?? 0}
        
          />
          <MetricCard
            label="Active Vehicles"
            value={fleet.active_vehicles ?? 0}
            
          />
          <MetricCard
            label="Available Vehicles"
            value={fleet.available_vehicles ?? 0}
            
          />
          <MetricCard
            label="Under Maintenance"
            value={fleet.maintenance_vehicles ?? 0}
            
          />
          <MetricCard
            label="Vehicle Utilization"
            value={formatPercent(fleet.vehicle_utilization_percentage)}
            
          />
        </div>
      </Panel>

      <Panel
        title="Driver Overview"
        subtitle="Current driver availability"
      >
        <div className="metrics-grid">
          <MetricCard label="Total Drivers" value={drivers.total_drivers ?? 0} />
          <MetricCard label="Available" value={drivers.available_drivers ?? 0} />
          <MetricCard label="On Trip" value={drivers.on_trip_drivers ?? 0} />
          <MetricCard label="Off Duty" value={drivers.off_duty_drivers ?? 0} />
        </div>
      </Panel>

      <Panel
        title="Trip Analytics"
        subtitle="Trip status summary"
      >
        <div className="metrics-grid">
          <MetricCard label="Total Trips" value={trips.total_trips ?? 0} />
          <MetricCard label="Completed" value={trips.completed_trips ?? 0} />
          <MetricCard label="Ongoing" value={trips.ongoing_trips ?? 0} />
          <MetricCard label="Delayed" value={trips.delayed_trips ?? 0} />
          <MetricCard label="Cancelled" value={trips.cancelled_trips ?? 0} />
        </div>
      </Panel>

      <Panel
        title="Delivery Analytics"
        subtitle="Shipment delivery performance"
      >
        <div className="metrics-grid">
          <MetricCard label="Total Shipments" value={delivery.total_shipments ?? 0} />
          <MetricCard label="Delivered" value={delivery.delivered ?? 0} />
          <MetricCard label="Pending" value={delivery.pending ?? 0} />
          <MetricCard label="Delayed" value={delivery.delayed ?? 0} />
          <MetricCard
            label="Delivery Rate"
            value={formatPercent(delivery.delivery_rate_percentage)}
          />
          <MetricCard
            label="On-Time Delivery"
            value={formatPercent(delivery.on_time_delivery_percentage)}
          />
        </div>
      </Panel>

      <Panel
        title="Maintenance & Fuel Analytics"
        subtitle="Fleet operating expenses"
      >
        <div className="metrics-grid">
          <MetricCard
            label="Maintenance Records"
            value={maintenanceData.total_records ?? 0}
          />
          <MetricCard
            label="Estimated Maintenance Cost"
            value={formatCurrency(maintenanceData.estimated_cost)}
          />
          <MetricCard
            label="Actual Maintenance Expense"
            value={formatCurrency(maintenanceData.actual_expense)}
          />
          <MetricCard
            label="Fuel Records"
            value={fuelData.total_records ?? 0}
          />
          <MetricCard
            label="Fuel Quantity"
            value={fuelData.total_quantity ?? 0}
          />
          <MetricCard
            label="Total Fuel Cost"
            value={formatCurrency(fuelData.total_cost)}
          />
        </div>
      </Panel>

      <Panel
        title="Vehicle Performance"
        subtitle="Trip count by vehicle"
      >
        <div className="performance-table-wrap">
          <table className="performance-table">
            <thead>
              <tr>
                <th>Vehicle Number</th>
                <th>Status</th>
                <th>Total Trips</th>
              </tr>
            </thead>
            <tbody>
              {vehicleRows.length > 0 ? vehicleRows.map((item) => (
                <tr key={item.vehicle_id}>
                  <td>{item.vehicle_number || '-'}</td>
                  <td>{item.status || '-'}</td>
                  <td>{item.total_trips ?? 0}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="3">No vehicle performance data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Driver Performance"
        subtitle="Trip completion and delay summary"
      >
        <div className="performance-table-wrap">
          <table className="performance-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Status</th>
                <th>Total Trips</th>
                <th>Completed</th>
                <th>Delayed</th>
              </tr>
            </thead>
            <tbody>
              {driverRows.length > 0 ? driverRows.map((item) => (
                <tr key={item.driver_id}>
                  <td>{item.driver_name || '-'}</td>
                  <td>{item.status || '-'}</td>
                  <td>{item.total_trips ?? 0}</td>
                  <td>{item.completed_trips ?? 0}</td>
                  <td>{item.delayed_trips ?? 0}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5">No driver performance data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Route Performance"
        subtitle="Trip delays by route"
      >
        <div className="performance-table-wrap">
          <table className="performance-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Total Trips</th>
                <th>Delayed Trips</th>
              </tr>
            </thead>
            <tbody>
              {routeRows.length > 0 ? routeRows.map((item, index) => (
                <tr key={`${item.route}-${index}`}>
                  <td>{item.route || '-'}</td>
                  <td>{item.total_trips ?? 0}</td>
                  <td>{item.delayed_trips ?? 0}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="3">No route performance data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Operational Insights"
        subtitle="System-generated fleet observations"
      >
        {insights.length > 0 ? (
          <div>
            {insights.map((item, index) => (
              <div
                key={`${item.type}-${index}`}
                style={{
                  padding: '12px',
                  marginBottom: '10px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px'
                }}
              >
                <strong>{item.type || 'Insight'}</strong>
                <p>{item.message || ''}</p>
              </div>
            ))}
          </div>
        ) : (
          <p>No operational insights available.</p>
        )}
      </Panel>
    </div>
  )
}
  
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
            <div className="notification-menu-wrapper">
  <button
    type="button"
    className="notification-bell-button"
    aria-label={`Notifications: ${unreadNotificationCount} unread`}
    aria-expanded={notificationOpen}
    onClick={() => setNotificationOpen(value => !value)}
  >
    <svg
      viewBox="0 0 24 24"
      width="23"
      height="23"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>

    {unreadNotificationCount > 0 && (
      <span className="notification-count-badge">
        {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
      </span>
    )}
  </button>

  {notificationOpen && (
    <div className="notification-dropdown">
      <div className="notification-dropdown-header">
        <strong>Notifications</strong>
        <span>{unreadNotificationCount} unread</span>
      </div>

      <div className="notification-dropdown-list">
        {notifications.length === 0 ? (
          <p className="notification-empty">
            No notifications available.
          </p>
        ) : (
          notifications.slice(0, 5).map(item => (
            <div
              className={`notification-dropdown-item ${
                item.is_read ? '' : 'unread'
              }`}
              key={item.id}
            >
              <div className="notification-item-content">
                <strong>{item.title}</strong>
                <p>{item.message}</p>
              </div>

              {!item.is_read && (
                <button
                  type="button"
                  className="notification-mark-read"
                  onClick={() => markNotificationRead(item.id)}
                >
                  Mark Read
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        className="notification-view-all"
        onClick={() => {
          setActiveSection('notifications')
          setNotificationOpen(false)
        }}
      >
        View All Notifications →
      </button>
    </div>
  )}
</div>

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