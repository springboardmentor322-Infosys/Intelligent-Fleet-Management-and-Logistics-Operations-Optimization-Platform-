import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'

const GPSMap = lazy(() => import('./GPSMap'))
import {

  Activity,

  AlertTriangle,

  Truck,

  Users,

  Search,
  MapPin,

  RefreshCw,

  LogIn,

  LogOut,

  Plus,

  X,

  Save,

  Pencil,

  Fuel,

  SlidersHorizontal,
  Package,
  ShieldCheck,
  UserCog,
  Wrench,
  Bell,
  ChartColumnIncreasing,
  Route,

} from 'lucide-react'

import api from './api'
import { DriverDashboard, DispatcherDashboard } from './RoleDashboards'
import AnalyticsDashboard from './AnalyticsDashboard'
import DriverManagementDashboard from './DriverManagementDashboard'
import { getRoleLandingView, shouldShowFleetDashboard } from './roleRouting'



const emptyLogin = { username: '', password: '' }



const emptyVehicle = {

  vehicle_id: '',

  registration_number: '',

  vehicle_type: 'Truck',

  capacity: '',

  fuel_type: 'Diesel',

  status: 'idle',

  assigned_driver_id: '',

}



const vehicleTypes = ['Truck', 'Van', 'Car', 'Bus', 'Trailer']

const fuelTypes = ['Diesel', 'Petrol', 'Electric', 'Hybrid', 'CNG']

const vehicleStatuses = ['idle', 'active', 'maintenance']
const shipmentStatuses = ['pending', 'assigned', 'in_transit', 'delayed', 'delivered', 'cancelled']
const fleetDashboardRoles = ['administrator', 'fleet_manager', 'dispatcher']
const emptyShipment = { tracking_number: '', origin: '', destination: '', cargo_description: '', weight: '' }
const emptyMaintenance = { vehicle_id: '', service_type: '', description: '', service_date: '', cost: '', next_due_date: '', status: 'completed' }
const emptyFuelLog = { vehicle_id: '', logged_at: '', odometer_km: '', liters: '', total_cost: '', is_full_tank: false }
const emptyInspection = { vehicle_id: '', category: 'general_inspection', result: 'passed', checklist: { brakes: true, tires: true, lights: true, engine: true }, notes: '' }
const emptyDriver = { full_name: '', email: '', password: '', license_number: '', license_expiry: '' }



const inputClass =

  'mt-1 w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 transition placeholder:text-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15'

const labelClass = 'block text-sm font-medium text-slate-300'

const toLocalInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}



function App() {

  const [token, setToken] = useState(

    () => localStorage.getItem('fleetflow_token')

  )

  const [login, setLogin] = useState(emptyLogin)
  const [currentUser, setCurrentUser] = useState(null)
  const [profileForm, setProfileForm] = useState({ full_name: '', email: '' })
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' })
  const [accountSaving, setAccountSaving] = useState(false)
  const [adminOverview, setAdminOverview] = useState(null)
  const [adminUsers, setAdminUsers] = useState([])
  const [driverProfileUserId, setDriverProfileUserId] = useState(null)
  const [driverProfileForm, setDriverProfileForm] = useState({ license_number: '', license_expiry: '' })
  const [provisioningDriverProfile, setProvisioningDriverProfile] = useState(false)
  const [resetPasswordUserId, setResetPasswordUserId] = useState(null)
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)
  const [adminAccountForm, setAdminAccountForm] = useState({ full_name: '', email: '', password: '', role: 'dispatcher' })
  const [provisioningAccount, setProvisioningAccount] = useState(false)

  const [summary, setSummary] = useState(null)

  const [vehicles, setVehicles] = useState([])
const [gpsVehicleId, setGpsVehicleId] = useState('')
const [gpsShipmentId, setGpsShipmentId] = useState('1')
const [gpsSimulationRunning, setGpsSimulationRunning] = useState(false)
const [gpsSimulationLoading, setGpsSimulationLoading] = useState(false)
const [gpsSimulationMessage, setGpsSimulationMessage] = useState('')
  const [drivers, setDrivers] = useState([])
  const [shipments, setShipments] = useState([])
  const [maintenanceRecords, setMaintenanceRecords] = useState([])
  const [fuelLogs, setFuelLogs] = useState([])
  const [fuelForm, setFuelForm] = useState(emptyFuelLog)
  const [savingFuelLog, setSavingFuelLog] = useState(false)
  const [attendanceForm, setAttendanceForm] = useState({ driver_id: '', status: 'present', note: '' })
  const [attendanceHistory, setAttendanceHistory] = useState([])
  const [inspections, setInspections] = useState([])
  const [inspectionForm, setInspectionForm] = useState(emptyInspection)
  const [healthReport, setHealthReport] = useState(null)
  const [reportName, setReportName] = useState('fleet')
  const [exportingReport, setExportingReport] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [activeView, setActiveView] = useState('vehicles')
  const [maintenanceForm, setMaintenanceForm] = useState(emptyMaintenance)
  const [editingMaintenanceId, setEditingMaintenanceId] = useState(null)
  const [savingMaintenance, setSavingMaintenance] = useState(false)
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false)
  const [driverForm, setDriverForm] = useState(emptyDriver)
  const [editingDriverId, setEditingDriverId] = useState(null)
  const [showDriverForm, setShowDriverForm] = useState(false)
  const [showShipmentForm, setShowShipmentForm] = useState(false)
  const [shipmentForm, setShipmentForm] = useState(emptyShipment)
  const [editingShipmentId, setEditingShipmentId] = useState(null)
  const [shipmentEditForm, setShipmentEditForm] = useState(null)
  const [savingShipment, setSavingShipment] = useState(false)
  const [updatingShipmentId, setUpdatingShipmentId] = useState(null)
  const [shipmentSearch, setShipmentSearch] = useState('')
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState('all')
  const [routeLoadingId, setRouteLoadingId] = useState(null)
  const [shipmentRoutes, setShipmentRoutes] = useState({})
  const [shipmentHistories, setShipmentHistories] = useState({})
  const [shipmentEtaHistories, setShipmentEtaHistories] = useState({})
  const [trips, setTrips] = useState([])
  const [tripForm, setTripForm] = useState({ vehicle_id: '', driver_id: '', origin: '', destination: '', scheduled_departure: '', shipment_ids: '', route_selection: 'fastest' })
  const [tripBusy, setTripBusy] = useState(false)

  const [search, setSearch] = useState('')

  const [statusFilter, setStatusFilter] = useState('all')

  const [typeFilter, setTypeFilter] = useState('all')

  const [showVehicleForm, setShowVehicleForm] = useState(false)

  const [vehicleForm, setVehicleForm] = useState(emptyVehicle)

  const [savingVehicle, setSavingVehicle] = useState(false)

  const [editingVehicleId, setEditingVehicleId] = useState(null)

  const [savingEdit, setSavingEdit] = useState(false)

  const [loading, setLoading] = useState(false)

  const [error, setError] = useState('')

  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (activeView !== 'trips' || !token) return
    api.get('/trips').then((response) => setTrips(response.data)).catch((err) => setError(err.response?.data?.detail || 'Could not load trips.'))
  }, [activeView, token])

  const createTrip = async (event) => {
    event.preventDefault(); setTripBusy(true); setError('')
    try {
      const payload = { ...tripForm, vehicle_id: Number(tripForm.vehicle_id), driver_id: Number(tripForm.driver_id), scheduled_departure: new Date(tripForm.scheduled_departure).toISOString(), shipment_ids: tripForm.shipment_ids.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0) }
      await api.post('/trips', payload)
      const response = await api.get('/trips'); setTrips(response.data); setNotice('Trip scheduled and route estimate saved.')
    } catch (err) { setError(err.response?.data?.detail || 'Could not schedule trip.') }
    finally { setTripBusy(false) }
  }

  const updateTripStatus = async (trip, status) => {
    try { await api.patch(`/trips/${trip.id}`, { status }); const response = await api.get('/trips'); setTrips(response.data) }
    catch (err) { setError(err.response?.data?.detail || 'Could not update trip.') }
  }


useEffect(() => {
  if (activeView !== 'gps' || !gpsShipmentId || Number(gpsShipmentId) < 1) {
    return
  }

  let cancelled = false

  const checkSimulationStatus = async () => {
    try {
      const response = await api.get(
        `/gps/shipments/${gpsShipmentId}/simulation-status`
      )

      if (!cancelled) {
        setGpsSimulationRunning(response.data.running === true)
      }
    } catch (error) {
      console.error('Could not fetch GPS simulation status:', error)
    }
  }

  const initialCheckId = window.setTimeout(checkSimulationStatus, 0)
  const intervalId = window.setInterval(checkSimulationStatus, 3000)

  return () => {
    cancelled = true
    window.clearTimeout(initialCheckId)
    window.clearInterval(intervalId)
  }
}, [activeView, gpsShipmentId])


  const logout = () => {

    localStorage.removeItem('fleetflow_token')

    setToken(null)

    setCurrentUser(null)
    setSummary(null)
    setAdminOverview(null)
    setAdminUsers([])
    setAdminAccountForm({ full_name: '', email: '', password: '', role: 'dispatcher' })
    setDriverProfileUserId(null)
    setDriverProfileForm({ license_number: '', license_expiry: '' })
    setResetPasswordUserId(null)
    setResetPasswordValue('')
    setPasswordForm({ current_password: '', new_password: '' })
    setActiveView('vehicles')

    setVehicles([])

    setDrivers([])
    setShipments([])
    setMaintenanceRecords([])
    setAlerts([])
    setAnalytics(null)
    setShowShipmentForm(false)

    setError('')

    setNotice('')

    setShowVehicleForm(false)

    setEditingVehicleId(null)

    setLogin(emptyLogin)

  }



  const loadDashboard = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')

    try {
      const meResponse = await api.get('/auth/me')
      const user = meResponse.data
      setCurrentUser(user)
      setProfileForm({ full_name: user.full_name, email: user.email })

      if (user.role === 'driver') {
        setSummary(null)
        setVehicles([])
        setDrivers([])
        setShipments([])
        setMaintenanceRecords([])
        setActiveView('drivers')
        return
      }

      if (!fleetDashboardRoles.includes(user.role)) {
        setSummary(null)
        setVehicles([])
        setDrivers([])
        setShipments([])
        setMaintenanceRecords([])
        setAlerts([])
        setAnalytics(null)
        setActiveView('restricted')
        setError('The fleet dashboard is available to administrators, fleet managers, and dispatchers.')
        return
      }

      if (user.role === 'administrator') {
        const [overviewResult, usersResult, vehiclesResult, driversResult, shipmentsResult, maintenanceResult, alertsResult, analyticsResult] =
          await Promise.allSettled([
            api.get('/admin/overview'),
            api.get('/admin/users'),
            api.get('/vehicles'),
            api.get('/drivers'),
            api.get('/shipments'),
            api.get('/maintenance'),
            api.get('/alerts'),
            api.get('/analytics/summary'),
          ])

        if (overviewResult.status === 'fulfilled') {
          setAdminOverview(overviewResult.value.data)
          setSummary({
            total_vehicles: overviewResult.value.data.total_vehicles,
            active_vehicles: overviewResult.value.data.active_vehicles ?? '—',
            maintenance_vehicles: overviewResult.value.data.maintenance_vehicles ?? '—',
            unassigned_drivers: overviewResult.value.data.unassigned_drivers ?? '—',
          })
        } else {
          throw overviewResult.reason
        }
        if (usersResult.status === 'fulfilled') setAdminUsers(usersResult.value.data)
        if (vehiclesResult.status === 'fulfilled') setVehicles(vehiclesResult.value.data)
        if (driversResult.status === 'fulfilled') setDrivers(driversResult.value.data)
        if (shipmentsResult.status === 'fulfilled') setShipments(shipmentsResult.value.data)
        if (maintenanceResult.status === 'fulfilled') setMaintenanceRecords(maintenanceResult.value.data)
        if (alertsResult.status === 'fulfilled') setAlerts(alertsResult.value.data.alerts)
        if (analyticsResult.status === 'fulfilled') setAnalytics(analyticsResult.value.data)
        setActiveView((view) => view === 'vehicles' ? getRoleLandingView(user.role) : view)
      } else {
        setAdminOverview(null)
        setAdminUsers([])
        const [summaryResponse, vehiclesResponse, driversResponse, shipmentsResponse, maintenanceResponse, alertsResponse, analyticsResponse] =
          await Promise.all([
            api.get('/dashboard/summary'),
            api.get('/vehicles'),
            api.get('/drivers'),
            api.get('/shipments'),
            api.get('/maintenance'),
            api.get('/alerts'),
            api.get('/analytics/summary'),
          ])
        setSummary(summaryResponse.data)
        setVehicles(vehiclesResponse.data)
        setDrivers(driversResponse.data)
        setShipments(shipmentsResponse.data)
        setMaintenanceRecords(maintenanceResponse.data)
        setAlerts(alertsResponse.data.alerts)
        setAnalytics(analyticsResponse.data)
        setActiveView((view) => view === 'admin' || view === 'vehicles' ? getRoleLandingView(user.role) : view)
      }
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        setError('Access denied or session expired. Sign in again with an account that has permission to access this dashboard.')
      } else {
        setError(err.response?.data?.detail || 'Could not connect to FleetFlow. Check that the backend is running.')
      }
    } finally {
      setLoading(false)
    }
  }, [token])

  const updateProfile = async (event) => {
    event.preventDefault()
    setAccountSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await api.patch('/auth/me', {
        full_name: profileForm.full_name.trim(),
        email: profileForm.email.trim(),
      })
      setCurrentUser(response.data)
      setProfileForm({ full_name: response.data.full_name, email: response.data.email })
      setNotice('Account profile updated.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update your profile.')
    } finally {
      setAccountSaving(false)
    }
  }

  const changePassword = async (event) => {
    event.preventDefault()
    setAccountSaving(true)
    setError('')
    setNotice('')
    try {
      await api.post('/auth/change-password', passwordForm)
      setPasswordForm({ current_password: '', new_password: '' })
      setNotice('Password changed successfully.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not change your password.')
    } finally {
      setAccountSaving(false)
    }
  }

  const handleLinkDriverProfile = async (event) => {
    event.preventDefault()
    if (!driverProfileUserId) return
    setProvisioningDriverProfile(true)
    setError('')
    setNotice('')
    try {
      const payload = { license_number: driverProfileForm.license_number.trim() }
      if (driverProfileForm.license_expiry) payload.license_expiry = new Date(`${driverProfileForm.license_expiry}T00:00:00`).toISOString()
      await api.post(`/admin/users/${driverProfileUserId}/driver-profile`, payload)
      setDriverProfileUserId(null)
      setDriverProfileForm({ license_number: '', license_expiry: '' })
      setNotice('Driver profile created for the selected existing account. Assignments remain attached to their existing driver records.')
      await loadDashboard()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create this driver profile.')
    } finally {
      setProvisioningDriverProfile(false)
    }
  }

  const handleProvisionFleetAccount = async (event) => {
    event.preventDefault()
    setProvisioningAccount(true)
    setError('')
    setNotice('')
    try {
      await api.post('/admin/users', { ...adminAccountForm, full_name: adminAccountForm.full_name.trim(), email: adminAccountForm.email.trim() })
      setAdminAccountForm({ full_name: '', email: '', password: '', role: 'dispatcher' })
      setNotice('Fleet account created. Share the initial password through your approved secure channel.')
      await loadDashboard()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create the fleet account.')
    } finally {
      setProvisioningAccount(false)
    }
  }

  const handleAdminPasswordReset = async (event) => {
    event.preventDefault()
    if (!resetPasswordUserId) return
    setResettingPassword(true)
    setError('')
    setNotice('')
    try {
      await api.post(`/admin/users/${resetPasswordUserId}/reset-password`, { new_password: resetPasswordValue })
      const account = adminUsers.find((user) => user.id === resetPasswordUserId)
      setResetPasswordUserId(null)
      setResetPasswordValue('')
      setNotice(`Password reset for ${account?.email || 'the selected account'}. Share the new password through your approved secure channel.`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not reset this account password.')
    } finally {
      setResettingPassword(false)
    }
  }

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => loadDashboard(), 0)
    return () => window.clearTimeout(initialLoadId)

  }, [loadDashboard])

  useEffect(() => {
    const expireSession = () => {
      setToken(null)
      setCurrentUser(null)
      setSummary(null)
      setVehicles([])
      setDrivers([])
      setShipments([])
      setAdminAccountForm({ full_name: '', email: '', password: '', role: 'dispatcher' })
      setDriverProfileUserId(null)
      setDriverProfileForm({ license_number: '', license_expiry: '' })
      setResetPasswordUserId(null)
      setResetPasswordValue('')
      setPasswordForm({ current_password: '', new_password: '' })
      setError('Your session expired. Sign in again to continue.')
    }
    window.addEventListener('fleetflow:session-expired', expireSession)
    return () => window.removeEventListener('fleetflow:session-expired', expireSession)
  }, [])



  const handleLogin = async (event) => {

    event.preventDefault()

    setLoading(true)

    setError('')

    setNotice('')



    try {

      const body = new URLSearchParams()

      body.append('username', login.username.trim())

      body.append('password', login.password)

      const response = await api.post('/auth/login', body, {

        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },

      })

      localStorage.setItem('fleetflow_token', response.data.access_token)

      setToken(response.data.access_token)

      setLogin(emptyLogin)

    } catch (err) {
      if (!err.response) {
        setError('Cannot reach the FleetFlow API. Check that the backend is running at the API URL configured in frontend/.env.')
      } else if (err.response.status === 401 || err.response.status === 400) {
        setError('The email or password was not accepted. Use the existing account credentials that worked previously.')
      } else {
        setError(err.response.data?.detail || `Sign-in failed (HTTP ${err.response.status}). Check the backend terminal for details.`)
      }
    } finally {

      setLoading(false)

    }

  }



  const handleCreateVehicle = async (event) => {

    event.preventDefault()

    setSavingVehicle(true)

    setError('')

    setNotice('')



    try {

      const payload = {

        ...vehicleForm,

        vehicle_id: vehicleForm.vehicle_id.trim(),

        registration_number: vehicleForm.registration_number

          .trim()

          .toUpperCase(),

        capacity: Number(vehicleForm.capacity),

        assigned_driver_id: vehicleForm.assigned_driver_id

          ? Number(vehicleForm.assigned_driver_id)

          : null,

      }

      await api.post('/vehicles', payload)

      setVehicleForm(emptyVehicle)

      setShowVehicleForm(false)

      setNotice('Vehicle registered successfully.')

      await loadDashboard()

    } catch (err) {

      setError(

        err.response?.data?.detail ||

          'Could not register the vehicle. Check the details and try again.'

      )

    } finally {

      setSavingVehicle(false)

    }

  }



  const handleUpdateVehicle = async (event, vehicleId) => {

    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    const payload = {

      registration_number: String(

        formData.get('registration_number') || ''

      ).trim().toUpperCase(),

      vehicle_type: formData.get('vehicle_type'),

      capacity: Number(formData.get('capacity')),

      fuel_type: formData.get('fuel_type'),

      status: formData.get('status'),

      assigned_driver_id:

        formData.get('assigned_driver_id') === ''

          ? null

          : Number(formData.get('assigned_driver_id')),

    }



    if (

      !payload.registration_number ||

      !Number.isFinite(payload.capacity) ||

      payload.capacity <= 0

    ) {

      setError('Enter a valid registration number and positive capacity.')

      return

    }



    setSavingEdit(true)

    setError('')

    setNotice('')

    try {

      await api.patch(`/vehicles/${vehicleId}`, payload)

      setEditingVehicleId(null)

      setNotice('Vehicle updated successfully.')

      await loadDashboard()

    } catch (err) {

      setError(

        err.response?.data?.detail ||

          'Could not update the vehicle. Check the details and try again.'

      )

    } finally {

      setSavingEdit(false)

    }

  }



  const filteredVehicles = useMemo(() => {

    return vehicles.filter((vehicle) => {

      const query = search.trim().toLowerCase()

      const matchesSearch =

        !query ||

        [

          vehicle.vehicle_id,

          vehicle.registration_number,

          vehicle.vehicle_type,

          vehicle.fuel_type,

        ].some((value) => String(value ?? '').toLowerCase().includes(query))

      const matchesStatus =

        statusFilter === 'all' || vehicle.status === statusFilter

      const matchesType =

        typeFilter === 'all' ||

        String(vehicle.vehicle_type).toLowerCase() === typeFilter.toLowerCase()

      return matchesSearch && matchesStatus && matchesType

    })

  }, [vehicles, search, statusFilter, typeFilter])


  const startGpsSimulation = async () => {
    if (!gpsShipmentId || Number(gpsShipmentId) < 1) {
      setGpsSimulationMessage('Enter a valid shipment ID.')
      return
    }

    setGpsSimulationLoading(true)
    setGpsSimulationMessage('')

    try {
      const response = await api.post(
        `/gps/shipments/${gpsShipmentId}/simulate-live`,
      )

      setGpsSimulationRunning(true)
      setGpsSimulationMessage(
        response.data.message || 'GPS simulation started.',
      )
    } catch (err) {
      setGpsSimulationMessage(
        err.response?.data?.detail || 'Could not start GPS simulation.',
      )
    } finally {
      setGpsSimulationLoading(false)
    }
  }

  const stopGpsSimulation = async () => {
    if (!gpsShipmentId || Number(gpsShipmentId) < 1) {
      setGpsSimulationMessage('Enter a valid shipment ID.')
      return
    }

    setGpsSimulationLoading(true)
    setGpsSimulationMessage('')

    try {
      const response = await api.post(
        `/gps/shipments/${gpsShipmentId}/stop-live`,
      )

      setGpsSimulationRunning(false)
      setGpsSimulationMessage(
        response.data.message || 'GPS simulation stopped.',
      )
    } catch (err) {
      setGpsSimulationMessage(
        err.response?.data?.detail || 'Could not stop GPS simulation.',
      )
    } finally {
      setGpsSimulationLoading(false)
    }
  }


  const handleCreateShipment = async (event) => {
    event.preventDefault()
    setSavingShipment(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        ...shipmentForm,
        tracking_number: shipmentForm.tracking_number.trim().toUpperCase(),
        origin: shipmentForm.origin.trim(),
        destination: shipmentForm.destination.trim(),
        cargo_description: shipmentForm.cargo_description.trim(),
        weight: Number(shipmentForm.weight),
      }
      if (!payload.tracking_number || !payload.origin || !payload.destination || !payload.cargo_description || !Number.isFinite(payload.weight) || payload.weight <= 0) {
        setError('Complete all shipment fields and enter a positive weight.')
        return
      }
      await api.post('/shipments', payload)
      setShipmentForm(emptyShipment)
      setShowShipmentForm(false)
      setNotice('Shipment created successfully.')
      await loadDashboard()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create the shipment. Check the details and try again.')
    } finally {
      setSavingShipment(false)
    }
  }

  const handleUpdateShipmentDetails = async (event) => {
    event.preventDefault()
    if (!editingShipmentId || !shipmentEditForm) return
    setError('')
    setNotice('')
    try {
      await api.patch(`/shipments/${editingShipmentId}`, {
        tracking_number: shipmentEditForm.tracking_number.trim().toUpperCase(),
        origin: shipmentEditForm.origin.trim(),
        destination: shipmentEditForm.destination.trim(),
        cargo_description: shipmentEditForm.cargo_description.trim(),
        weight: Number(shipmentEditForm.weight),
      })
      setEditingShipmentId(null)
      setShipmentEditForm(null)
      setNotice('Shipment details updated.')
      await loadDashboard()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update shipment details.')
    }
  }

  const handleSaveMaintenance = async (event) => {
    event.preventDefault()
    setSavingMaintenance(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        ...maintenanceForm,
        vehicle_id: Number(maintenanceForm.vehicle_id),
        service_date: new Date(maintenanceForm.service_date).toISOString(),
        next_due_date: maintenanceForm.next_due_date ? new Date(maintenanceForm.next_due_date).toISOString() : null,
        cost: maintenanceForm.cost === '' ? null : Number(maintenanceForm.cost),
      }
      if (editingMaintenanceId) {
        delete payload.vehicle_id
        await api.patch(`/maintenance/${editingMaintenanceId}`, payload)
        setNotice('Maintenance record updated.')
      } else {
        await api.post('/maintenance', payload)
        setNotice('Maintenance record created.')
      }
      setMaintenanceForm(emptyMaintenance)
      setEditingMaintenanceId(null)
      setShowMaintenanceForm(false)
      await loadDashboard()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Could not save the maintenance record.')
    } finally {
      setSavingMaintenance(false)
    }
  }

  const openMaintenanceView = async () => {
    setActiveView('maintenance')
    setError('')
    try {
      const response = await api.get('/maintenance/inspections')
      setInspections(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load vehicle inspections.')
    }
  }

  const handleCreateInspection = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      const response = await api.post('/maintenance/inspections', {
        ...inspectionForm,
        vehicle_id: Number(inspectionForm.vehicle_id),
        notes: inspectionForm.notes.trim() || null,
      })
      setInspections((previous) => [response.data, ...previous])
      const health = await api.get(`/maintenance/vehicles/${inspectionForm.vehicle_id}/health`)
      setHealthReport(health.data)
      setInspectionForm(emptyInspection)
      setNotice('Vehicle inspection recorded.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not record the inspection.')
    }
  }

  const handleLoadVehicleHealth = async (vehicleId) => {
    try {
      const response = await api.get(`/maintenance/vehicles/${vehicleId}/health`)
      setHealthReport(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load the vehicle health report.')
    }
  }

  const openFuelView = async () => {
    setActiveView('fuel')
    setError('')
    try {
      const response = await api.get('/fuel-logs')
      setFuelLogs(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load fuel logs.')
    }
  }

  const handleCreateFuelLog = async (event) => {
    event.preventDefault()
    setSavingFuelLog(true)
    setError('')
    setNotice('')
    try {
      await api.post('/fuel-logs', {
        vehicle_id: Number(fuelForm.vehicle_id),
        logged_at: fuelForm.logged_at ? new Date(fuelForm.logged_at).toISOString() : null,
        odometer_km: Number(fuelForm.odometer_km),
        liters: Number(fuelForm.liters),
        total_cost: Number(fuelForm.total_cost),
        is_full_tank: fuelForm.is_full_tank,
      })
      setFuelForm(emptyFuelLog)
      setNotice('Fuel log recorded.')
      const [logs] = await Promise.all([api.get('/fuel-logs'), loadDashboard()])
      setFuelLogs(logs.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not save the fuel log.')
    } finally {
      setSavingFuelLog(false)
    }
  }

  const handleCreateDriver = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api.post('/drivers', {
        ...driverForm,
        email: driverForm.email.trim().toLowerCase(),
        full_name: driverForm.full_name.trim(),
        license_number: driverForm.license_number.trim(),
        license_expiry: driverForm.license_expiry ? new Date(driverForm.license_expiry).toISOString() : null,
      })
      setDriverForm(emptyDriver)
      setShowDriverForm(false)
      setNotice('Driver added. Share the initial password securely with the driver.')
      await loadDashboard()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create the driver.')
    }
  }

  const handleLoadAttendance = async (driverId) => {
    setAttendanceForm((form) => ({ ...form, driver_id: driverId }))
    setAttendanceHistory([])
    if (!driverId) return
    try {
      const response = await api.get(`/drivers/${driverId}/attendance`)
      setAttendanceHistory(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load attendance history.')
    }
  }

  const handleRecordAttendance = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      const response = await api.post(`/drivers/${attendanceForm.driver_id}/attendance`, {
        status: attendanceForm.status,
        note: attendanceForm.note.trim() || null,
      })
      setAttendanceHistory((previous) => [response.data, ...previous])
      setDrivers((previous) => previous.map((driver) => driver.id === Number(attendanceForm.driver_id) ? { ...driver, attendance_status: attendanceForm.status } : driver))
      setAttendanceForm((form) => ({ ...form, note: '' }))
      setNotice('Attendance recorded.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not record attendance.')
    }
  }

  const downloadReport = async (extension) => {
    setExportingReport(true)
    setError('')
    try {
      const response = await api.get(`/reports/${reportName}.${extension}`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `fleetflow-${reportName}-report.${extension}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setNotice(`${reportName} ${extension.toUpperCase()} report downloaded.`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not export the report.')
    } finally {
      setExportingReport(false)
    }
  }

  const handleUpdateDriver = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api.patch(`/drivers/${editingDriverId}`, {
        full_name: driverForm.full_name.trim(),
        email: driverForm.email.trim().toLowerCase(),
        license_number: driverForm.license_number.trim(),
        license_expiry: driverForm.license_expiry ? new Date(driverForm.license_expiry).toISOString() : null,
      })
      setEditingDriverId(null)
      setDriverForm(emptyDriver)
      setNotice('Driver details updated.')
      await loadDashboard()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update driver details.')
    }
  }

  const handleViewShipmentRoute = async (shipment) => {
    setError('')
    setNotice('')
    setRouteLoadingId(shipment.id)

    try {
      const response = await api.get(`/routes/shipments/${shipment.id}`)
      setShipmentRoutes((previous) => ({
        ...previous,
        [shipment.id]: response.data,
      }))
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          'Unable to calculate this shipment route.'
      )
    } finally {
      setRouteLoadingId(null)
    }
  }
  
const handleCalculateShipmentEta = async (shipment) => {
  setError('')
  setNotice('')
  setRouteLoadingId(shipment.id)

  try {
    const response = await api.post(
      `/routes/shipments/${shipment.id}/calculate-eta`
    )

    setNotice(
      `ETA saved for ${shipment.tracking_number}: ${
        new Date(response.data.estimated_arrival).toLocaleString()
      }`
    )

    await handleViewShipmentHistory(shipment.id)

    await loadDashboard()
  } catch (err) {
    setError(
      err.response?.data?.detail ||
        'Could not calculate and save shipment ETA.'
    )
  } finally {
    setRouteLoadingId(null)
  }
}

const handleScheduleDeparture = async (shipment, localDateTime) => {
  if (!localDateTime) {
    setError('Choose a scheduled departure time.')
    return
  }

  setError('')
  setNotice('')
  setUpdatingShipmentId(shipment.id)

  try {
    const departure = new Date(localDateTime)

    if (Number.isNaN(departure.getTime())) {
      setError('Enter a valid departure time.')
      return
    }

    await api.patch(`/shipments/${shipment.id}`, {
      scheduled_departure: departure.toISOString(),
    })

    setNotice(`Departure scheduled for ${shipment.tracking_number}.`)
    await loadDashboard()
  } catch (err) {
    setError(
      err.response?.data?.detail ||
        'Could not save the scheduled departure.'
    )
  } finally {
    setUpdatingShipmentId(null)
  }
}

  const handleShipmentStatusChange = async (shipmentId, status) => {
    setError('')
    setNotice('')
    try {
      await api.patch(`/shipments/${shipmentId}`, { status })
      setNotice('Shipment status updated successfully.')
      await loadDashboard()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update shipment status.')
    }
  }

  const handleViewShipmentHistory = async (shipmentId) => {
    setError('')
    try {
      const [response, etaResponse] = await Promise.all([
        api.get(`/shipments/${shipmentId}/history`),
        api.get(`/shipments/${shipmentId}/eta-history`),
      ])
      setShipmentHistories((previous) => ({ ...previous, [shipmentId]: response.data }))
      setShipmentEtaHistories((previous) => ({ ...previous, [shipmentId]: etaResponse.data }))
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load shipment history.')
    }
  }

  const handleShipmentAssignmentChange = async (shipmentId, field, value) => {
    setUpdatingShipmentId(shipmentId)
    setError('')
    setNotice('')
    try {
      await api.patch(`/shipments/${shipmentId}`, {
        [field]: value === '' ? null : Number(value),
      })
      setNotice('Shipment assignment updated successfully.')
      await loadDashboard()
    } catch (err) {
      await loadDashboard()
      setError(err.response?.data?.detail || 'Could not update shipment assignment.')
    } finally {
      setUpdatingShipmentId(null)
    }
  }

  const filteredShipments = useMemo(() => {
    const query = shipmentSearch.trim().toLowerCase()
    return shipments.filter((shipment) => {
      const matchesSearch = !query || [shipment.tracking_number, shipment.origin, shipment.destination, shipment.cargo_description].some((value) => String(value ?? '').toLowerCase().includes(query))
      const matchesStatus = shipmentStatusFilter === 'all' || shipment.status === shipmentStatusFilter
      return matchesSearch && matchesStatus
    })
  }, [shipments, shipmentSearch, shipmentStatusFilter])

  const showFleetDashboard = shouldShowFleetDashboard(currentUser?.role)
  const cards = [
    { label: 'Total vehicles', value: summary?.total_vehicles ?? '—', icon: Truck, tone: 'text-emerald-300', bg: 'bg-emerald-400/10', detail: 'Registered fleet' },
    { label: 'Active vehicles', value: summary?.active_vehicles ?? '—', icon: Activity, tone: 'text-emerald-300', bg: 'bg-emerald-400/10', detail: 'Currently active' },
    { label: 'In maintenance', value: summary?.maintenance_vehicles ?? '—', icon: AlertTriangle, tone: 'text-amber-300', bg: 'bg-amber-400/10', detail: 'Service status' },
    { label: 'Unassigned drivers', value: summary?.unassigned_drivers ?? '—', icon: Users, tone: 'text-violet-300', bg: 'bg-violet-400/10', detail: 'Awaiting assignment' },
  ]

  if (!token) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 lg:grid lg:grid-cols-2">
        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12 xl:px-20">
          <div className="w-full max-w-md">
            <div className="mb-10 flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-500 p-3 text-slate-950 shadow-lg shadow-emerald-950/40">
                <Truck size={28} />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">FleetFlow</h1>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">Fleet operations platform</p>
              </div>
            </div>

            <div className="mb-8">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Welcome back</p>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Sign in to your workspace</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">Manage vehicles, coordinate drivers, and track every shipment from one place.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <label className={labelClass}>
                Email
                <input
                  required
                  type="email"
                  autoComplete="username"
                  value={login.username}
                  onChange={(event) => setLogin({ ...login, username: event.target.value })}
                  className={inputClass}
                  placeholder="you@company.com"
                />
              </label>
              <label className={labelClass}>
                Password
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={login.password}
                  onChange={(event) => setLogin({ ...login, password: event.target.value })}
                  className={inputClass}
                  placeholder="Enter your password"
                />
              </label>

              {error && (
                <p role="alert" className="rounded-xl border border-red-900 bg-red-950/60 p-3 text-sm leading-5 text-red-200">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 font-semibold text-slate-950 shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogIn size={18} />
                {loading ? 'Signing in...' : 'Sign in to FleetFlow'}
              </button>
            </form>

            <div className="mt-8 border-t border-slate-800 pt-5">
              <p className="text-xs leading-5 text-slate-500">Sign in with your existing FleetFlow account. Public registration is disabled.</p>
              <p className="mt-2 text-xs text-slate-600">Secure access · Fleet operations workspace</p>
            </div>
          </div>
        </section>

        <aside className="relative hidden min-h-screen overflow-hidden border-l border-slate-800 lg:block">
          <img src="/fleet-login-hero.png" alt="Fleet trucks outside a modern logistics distribution center at dusk" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-slate-950/10" />
          <div className="absolute inset-x-0 bottom-0 p-10 xl:p-16">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-slate-950/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> One connected fleet
            </div>
            <h2 className="max-w-xl text-3xl font-bold leading-tight tracking-tight text-white xl:text-5xl">Every route. Every vehicle. One clear view.</h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-slate-200/80 xl:text-base">Bring fleet operations together with live visibility into vehicles, drivers, and shipment progress.</p>
            <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-200">
              <span className="rounded-xl border border-white/15 bg-slate-950/35 px-4 py-2.5 backdrop-blur">Vehicle operations</span>
              <span className="rounded-xl border border-white/15 bg-slate-950/35 px-4 py-2.5 backdrop-blur">Driver coordination</span>
              <span className="rounded-xl border border-white/15 bg-slate-950/35 px-4 py-2.5 backdrop-blur">Shipment tracking</span>
            </div>
          </div>
        </aside>
      </main>
    )
  }

  return (

    <main className="min-h-screen bg-slate-950 text-slate-100">

      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 shadow-lg shadow-black/10 backdrop-blur-xl">

        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8 2xl:px-10">

          <div className="flex items-center gap-3">

            <div className="rounded-xl bg-emerald-500 p-2.5 text-slate-950 shadow-lg shadow-emerald-950/40">

              <Truck size={23} />

            </div>

            <div>

              <h1 className="text-xl font-bold tracking-tight text-white">

                FleetFlow

              </h1>

              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">

                Fleet operations

              </p>

            </div>

          </div>



          <div className="flex items-center gap-2 sm:gap-3">

            <span className="hidden text-sm text-slate-400 md:inline">

              {currentUser?.role === 'administrator' ? 'Administrator workspace' : currentUser?.role === 'driver' ? 'Driver workspace' : 'Live fleet overview'}

            </span>

            <button

              type="button"

              onClick={() => ['driverDashboard', 'dispatcherDashboard'].includes(activeView) ? window.dispatchEvent(new Event('fleetflow:refresh-role-dashboard')) : loadDashboard()}

              disabled={loading}

              title="Refresh dashboard"

              aria-label="Refresh dashboard"

              className="rounded-xl border border-slate-700/80 bg-slate-900 p-2.5 text-slate-300 transition hover:border-emerald-500/50 hover:bg-slate-800 hover:text-emerald-300 disabled:opacity-50"

            >

              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />

            </button>

            <button type="button" onClick={() => { setProfileForm({ full_name: currentUser?.full_name || '', email: currentUser?.email || '' }); setError(''); setNotice(''); setActiveView('account') }} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${activeView === 'account' ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700/80 bg-slate-900 text-slate-300 hover:border-emerald-500/50 hover:bg-slate-800 hover:text-white'}`}>
              <UserCog size={16} /><span className="hidden sm:inline">Account</span>
            </button>

            <button

              type="button"

              onClick={logout}

              className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:border-emerald-500/50 hover:bg-slate-800 hover:text-white"

            >

              <LogOut size={16} />

              <span className="hidden sm:inline">Sign out</span>

            </button>

          </div>

        </div>

      </header>



      <section className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">

        <div className={`${showFleetDashboard ? 'mb-8' : 'mb-5'} flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              Overview / {currentUser?.role === 'administrator' ? 'Administration' : currentUser?.role === 'driver' ? 'Driver operations' : 'Fleet operations'}
            </p>
            {showFleetDashboard && <>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {activeView === 'dispatcherDashboard' ? 'Dispatcher dashboard' : activeView === 'admin' ? 'Admin dashboard' : activeView === 'routes' ? 'Route planning' : activeView === 'trips' ? 'Trip scheduling' : activeView === 'shipments' ? 'Shipment dashboard' : 'Fleet dashboard'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
                Monitor vehicles, manage assignments, and oversee fleet availability from one workspace.
              </p>
            </>}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            {activeView === 'dispatcherDashboard' && currentUser?.role === 'dispatcher' && <label className="flex items-center gap-2">Open page<select aria-label="Open management page" defaultValue="" onChange={(event) => { const view = event.target.value; if (view === 'maintenance') openMaintenanceView(); else if (view === 'fuel') openFuelView(); else if (view) setActiveView(view); event.target.value = '' }} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"><option value="" disabled>Select…</option><option value="vehicles">Vehicles</option><option value="shipments">Shipments</option><option value="routes">Route Planning</option><option value="trips">Trips</option><option value="gps">GPS Tracking</option><option value="drivers">Drivers</option><option value="maintenance">Maintenance</option><option value="fuel">Fuel Logs</option><option value="alerts">Alerts</option><option value="analytics">Analytics</option></select></label>}
            {showFleetDashboard && <>
              <span className={`h-2 w-2 rounded-full ${loading ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'}`} />
              {loading ? 'Updating data' : 'Connected to dashboard API'}
              <button type="button" onClick={() => setActiveView('drivers')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-emerald-500/50 hover:text-white">Driver dashboard</button>
            </>}
          </div>
        </div>



        {error && (

          <div

            role="alert"

            className="mb-5 rounded-xl border border-red-900 bg-red-950/50 p-4 text-sm text-red-200"

          >

            {error}

          </div>

        )}

        {notice && (

          <div

            role="status"

            className="mb-5 rounded-xl border border-emerald-800 bg-emerald-950/50 p-4 text-sm text-emerald-200"

          >

            {notice}

          </div>

        )}

        {activeView === 'driverDashboard' && currentUser?.role === 'driver' && <DriverDashboard />}
        {activeView === 'dispatcherDashboard' && currentUser?.role === 'dispatcher' && <DispatcherDashboard onNavigate={(view, trackingNumber, shipmentId) => { if (trackingNumber) setShipmentSearch(trackingNumber); setActiveView(view); if (shipmentId) void handleViewShipmentHistory(shipmentId) }} />}
        {loading && ['maintenance', 'alerts', 'analytics'].includes(activeView) && (
          <p role="status" className="mb-4 text-sm text-slate-400">
            Loading {activeView} data…
          </p>
        )}

        {activeView === 'account' && currentUser && (
          <section className="grid gap-5 lg:grid-cols-2" aria-label="Account settings">
            <form onSubmit={updateProfile} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div><h3 className="text-lg font-semibold text-white">Profile</h3><p className="mt-1 text-sm text-slate-400">Update your name and sign-in email.</p></div>
              <label className={labelClass}>Full name<input required minLength={2} maxLength={150} value={profileForm.full_name} onChange={(event) => setProfileForm({ ...profileForm, full_name: event.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Email<input required type="email" value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} className={inputClass} /></label>
              <button disabled={accountSaving} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">Save profile</button>
            </form>
            <form onSubmit={changePassword} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div><h3 className="text-lg font-semibold text-white">Change password</h3><p className="mt-1 text-sm text-slate-400">Confirm your current password to set a new one.</p></div>
              <label className={labelClass}>Current password<input required type="password" autoComplete="current-password" value={passwordForm.current_password} onChange={(event) => setPasswordForm({ ...passwordForm, current_password: event.target.value })} className={inputClass} /></label>
              <label className={labelClass}>New password<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={passwordForm.new_password} onChange={(event) => setPasswordForm({ ...passwordForm, new_password: event.target.value })} className={inputClass} /></label>
              <button disabled={accountSaving} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">Change password</button>
            </form>
          </section>
        )}

        {fleetDashboardRoles.includes(currentUser?.role) && activeView !== 'account' && activeView !== 'dispatcherDashboard' && (
        <nav className="mb-6 flex flex-wrap gap-3" aria-label="FleetFlow sections">
          {currentUser?.role === 'dispatcher' && <button type="button" onClick={() => setActiveView('dispatcherDashboard')} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${activeView === 'dispatcherDashboard' ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>Dispatcher dashboard</button>}
          {currentUser?.role === 'administrator' && (
            <button
              type="button"
              onClick={() => setActiveView('admin')}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${activeView === 'admin' ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-500/50 hover:text-white'}`}
            >
              <ShieldCheck size={17} /> Admin dashboard
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveView('vehicles')}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${activeView === 'vehicles' ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-500/50 hover:text-white'}`}
          >
            <Truck size={17} /> Vehicles
          </button>
          <button
            type="button"
            onClick={() => setActiveView('shipments')}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${activeView === 'shipments' ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-500/50 hover:text-white'}`}
          >
            <Package size={17} /> Shipments
            <span className={`rounded-full px-2 py-0.5 text-xs ${activeView === 'shipments' ? 'bg-slate-950/15' : 'bg-slate-800 text-slate-300'}`}>{shipments.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('routes')}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${activeView === 'routes' ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-500/50 hover:text-white'}`}
          >
            <Route size={17} /> Route Planning
          </button>
          <button type="button" onClick={() => setActiveView('trips')} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${activeView === 'trips' ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300'}`}><Truck size={17} /> Trips</button>
          
<button
  type="button"
  onClick={() => setActiveView('gps')}
  className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
    activeView === 'gps'
      ? 'border-emerald-500 bg-emerald-500 text-slate-950'
      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-500/50 hover:text-white'
  }`}
>
  <MapPin size={17} /> GPS Tracking
</button>

          <button type="button" onClick={() => setActiveView('drivers')} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${activeView === 'drivers' ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-500/50 hover:text-white'}`}>
            <Users size={17} /> Drivers
          </button>
          <button type="button" onClick={openMaintenanceView} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${activeView === 'maintenance' ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-500/50 hover:text-white'}`}>
            <Wrench size={17} /> Maintenance
          </button>
          <button type="button" onClick={openFuelView} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${activeView === 'fuel' ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-500/50 hover:text-white'}`}>
            <Fuel size={17} /> Fuel Logs
          </button>
          <button type="button" onClick={() => setActiveView('alerts')} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${activeView === 'alerts' ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-500/50 hover:text-white'}`}>
            <Bell size={17} /> Alerts <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs">{alerts.length}</span>
          </button>
          <button type="button" onClick={() => setActiveView('analytics')} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${activeView === 'analytics' ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-500/50 hover:text-white'}`}>
            <ChartColumnIncreasing size={17} /> Analytics
          </button>

        </nav>
        )}

        {activeView === 'restricted' && (
          <div role="status" className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
            Your account can view its own profile but does not have access to fleet operations.
          </div>
        )}

        {showFleetDashboard && activeView !== 'restricted' && activeView !== 'account' && <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, icon: Icon, tone, bg, detail }) => (
            <article key={label} className="group rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900 to-slate-900/70 p-5 shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-emerald-950/20">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-400">{label}</p>
                <span className={`rounded-xl p-3 transition duration-200 group-hover:scale-105 ${bg} ${tone}`}><Icon size={21} /></span>
              </div>
              <p className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">{value}</p>
              <p className="mt-1 text-xs text-slate-500">{detail}</p>
            </article>
          ))}
        </div>}

        {activeView === 'admin' && currentUser?.role === 'administrator' && (
          <section className="space-y-6">
            <div className="rounded-2xl border border-emerald-800/50 bg-gradient-to-br from-emerald-950/60 to-slate-900 p-6">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-emerald-400/10 p-3 text-emerald-300"><ShieldCheck size={24} /></div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Administrator workspace</p>
                  <h3 className="mt-1 text-2xl font-bold text-white">System overview</h3>
                  <p className="mt-2 text-sm text-slate-400">Signed in as {currentUser.full_name || currentUser.email}. These metrics come from the protected Admin API.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Total users', value: adminOverview?.total_users ?? '—', icon: Users },
                { label: 'Active accounts', value: adminOverview?.active_users ?? '—', icon: Activity },
                { label: 'Registered vehicles', value: adminOverview?.total_vehicles ?? '—', icon: Truck },
                { label: 'Total shipments', value: adminOverview?.total_shipments ?? '—', icon: Package },
              ].map(({ label, value, icon: Icon }) => (
                <article key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                  <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-400">{label}</p><span className="rounded-xl bg-emerald-400/10 p-3 text-emerald-300"><Icon size={20} /></span></div>
                  <p className="mt-4 text-3xl font-bold text-white">{value}</p>
                </article>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">Drivers</p>
                <p className="mt-2 text-2xl font-bold text-white">{adminOverview?.total_drivers ?? '—'}</p>
                <p className="mt-1 text-xs text-slate-500">Total driver records reported by the Admin API.</p>
              </article>
              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">Access control</p>
                <p className="mt-2 text-lg font-semibold text-emerald-300">Administrator only</p>
                <p className="mt-1 text-xs text-slate-500">The backend checks the logged-in role for these Admin endpoints.</p>
              </article>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="flex items-center gap-3 border-b border-slate-800 p-5">
                <div className="rounded-lg bg-emerald-400/10 p-2 text-emerald-300"><UserCog size={19} /></div>
                <div><h3 className="font-semibold text-white">User directory</h3><p className="mt-1 text-sm text-slate-400">Create fleet accounts and add profiles to existing unlinked driver accounts. Existing role changes are disabled.</p></div>
                <span className="ml-auto rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">{adminUsers.length} users</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-left text-sm">
                  <thead className="bg-slate-950/70 text-[11px] uppercase tracking-[0.14em] text-slate-500"><tr><th className="px-5 py-4">ID</th><th className="px-5 py-4">Name</th><th className="px-5 py-4">Email</th><th className="px-5 py-4">Role</th><th className="px-5 py-4">Account status</th><th className="px-5 py-4">Driver profile</th><th className="px-5 py-4">Created</th><th className="px-5 py-4">Action</th></tr></thead>
                  <tbody className="divide-y divide-slate-800">
                    {adminUsers.map((user) => <tr key={user.id} className="hover:bg-slate-800/40"><td className="px-5 py-4 text-slate-400">{user.id}</td><td className="px-5 py-4 font-medium text-white">{user.full_name}</td><td className="px-5 py-4 text-slate-300">{user.email}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs capitalize text-emerald-300">{user.role}</span></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${user.is_active ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}>{user.is_active ? 'Active' : 'Disabled'}</span></td><td className="px-5 py-4 text-slate-300">{user.role === 'driver' ? (user.has_driver_profile ? 'Linked' : 'Missing') : 'Not applicable'}</td><td className="px-5 py-4 text-slate-400">{user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Not recorded'}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-2">{user.role === 'driver' && !user.has_driver_profile && user.is_active && <button type="button" onClick={() => { setDriverProfileUserId(user.id); setDriverProfileForm({ license_number: '', license_expiry: '' }); }} className="rounded-lg border border-emerald-700 px-3 py-2 text-xs text-emerald-300">Create driver profile</button>}<button type="button" onClick={() => { setResetPasswordUserId(user.id); setResetPasswordValue(''); }} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">Reset password</button></div></td></tr>)}
                    {!loading && adminUsers.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">No users returned by the Admin API.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            {resetPasswordUserId && <form onSubmit={handleAdminPasswordReset} className="grid gap-3 border-t border-slate-800 p-5 sm:grid-cols-3" aria-label="Reset existing account password">
              <p className="text-sm text-slate-300 sm:col-span-3">Set a new password for {adminUsers.find((user) => user.id === resetPasswordUserId)?.email}. The current password cannot be viewed or recovered.</p>
              <label className={labelClass}>New password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={resetPasswordValue} onChange={(event) => setResetPasswordValue(event.target.value)} className={inputClass} /></label>
              <div className="flex items-end gap-2"><button disabled={resettingPassword} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{resettingPassword ? 'Resetting...' : 'Set new password'}</button><button type="button" onClick={() => { setResetPasswordUserId(null); setResetPasswordValue(''); }} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300">Cancel</button></div>
              <p className="text-xs text-slate-500 sm:col-span-3">Use at least 12 characters. The password is hashed by the backend and is not returned; share it only through your approved secure channel.</p>
            </form>}
            {driverProfileUserId && <form onSubmit={handleLinkDriverProfile} className="grid gap-3 border-t border-slate-800 p-5 sm:grid-cols-3" aria-label="Create driver profile for existing account">
              <p className="text-sm text-slate-300 sm:col-span-3">Create a profile for {adminUsers.find((user) => user.id === driverProfileUserId)?.email}. This does not move existing assignments or reuse another driver's record.</p>
              <label className={labelClass}>Verified license number<input required maxLength={100} value={driverProfileForm.license_number} onChange={(event) => setDriverProfileForm({ ...driverProfileForm, license_number: event.target.value })} className={inputClass} /></label>
              <label className={labelClass}>License expiry (optional)<input type="date" value={driverProfileForm.license_expiry} onChange={(event) => setDriverProfileForm({ ...driverProfileForm, license_expiry: event.target.value })} className={inputClass} /></label>
              <div className="flex items-end gap-2"><button disabled={provisioningDriverProfile} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{provisioningDriverProfile ? 'Creating...' : 'Create profile'}</button><button type="button" onClick={() => setDriverProfileUserId(null)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300">Cancel</button></div>
            </form>}
            <form onSubmit={handleProvisionFleetAccount} className="grid gap-3 border-t border-slate-800 p-5 sm:grid-cols-2 lg:grid-cols-5" aria-label="Create fleet account">
              <label className={labelClass}>Full name<input required minLength={2} maxLength={150} value={adminAccountForm.full_name} onChange={(event) => setAdminAccountForm({ ...adminAccountForm, full_name: event.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Email<input required type="email" value={adminAccountForm.email} onChange={(event) => setAdminAccountForm({ ...adminAccountForm, email: event.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Initial password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={adminAccountForm.password} onChange={(event) => setAdminAccountForm({ ...adminAccountForm, password: event.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Role<select value={adminAccountForm.role} onChange={(event) => setAdminAccountForm({ ...adminAccountForm, role: event.target.value })} className={inputClass}><option value="dispatcher">Dispatcher</option><option value="fleet_manager">Fleet manager</option></select></label>
              <div className="flex items-end"><button disabled={provisioningAccount} className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{provisioningAccount ? 'Creating...' : 'Create fleet account'}</button></div>
              <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-5">The administrator provides the initial password. Share it through your approved secure channel; FleetFlow stores only its password hash. This action cannot create an administrator account or change existing roles.</p>
            </form>
          </section>
        )}

        {activeView === 'vehicles' && (
        <section className="w-full overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/80 shadow-xl shadow-black/10">

          <div className="border-b border-slate-800/80 p-5 sm:p-6">

            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">

              <div>

                <div className="flex items-center gap-2">

                  <div className="rounded-lg bg-emerald-400/10 p-2 text-emerald-300">

                    <Truck size={18} />

                  </div>

                  <h3 className="text-lg font-semibold text-white">

                    Vehicle fleet

                  </h3>

                </div>

                <p className="mt-2 text-sm text-slate-400">

                  Showing {filteredVehicles.length} of {vehicles.length} vehicle(s)

                </p>

              </div>



              <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center">

                <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950 px-3 transition focus-within:border-emerald-500/70 focus-within:ring-2 focus-within:ring-emerald-500/10 xl:w-64">

                  <Search size={17} className="shrink-0 text-slate-500" />

                  <input

                    value={search}

                    onChange={(event) => setSearch(event.target.value)}

                    placeholder="Search fleet..."

                    aria-label="Search vehicles"

                    className="min-w-0 w-full bg-transparent py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600"

                  />

                </label>



                <label className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950 px-3">

                  <SlidersHorizontal size={16} className="text-slate-500" />

                  <select

                    value={statusFilter}

                    onChange={(event) => setStatusFilter(event.target.value)}

                    aria-label="Filter by status"

                    className="w-full bg-transparent py-2.5 text-sm text-slate-200 outline-none"

                  >

                    <option value="all">All statuses</option>

                    <option value="idle">Idle</option>

                    <option value="active">Active</option>

                    <option value="maintenance">Maintenance</option>

                  </select>

                </label>



                <label className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950 px-3">

                  <Truck size={16} className="text-slate-500" />

                  <select

                    value={typeFilter}

                    onChange={(event) => setTypeFilter(event.target.value)}

                    aria-label="Filter by vehicle type"

                    className="w-full bg-transparent py-2.5 text-sm text-slate-200 outline-none"

                  >

                    <option value="all">All vehicle types</option>

                    {vehicleTypes.map((type) => (

                      <option key={type} value={type}>

                        {type}

                      </option>

                    ))}

                  </select>

                </label>



                <button

                  type="button"

                  onClick={() => {

                    setError('')

                    setNotice('')

                    setShowVehicleForm((visible) => !visible)

                    setEditingVehicleId(null)

                  }}

                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-400"

                >

                  {showVehicleForm ? <X size={17} /> : <Plus size={17} />}

                  {showVehicleForm ? 'Cancel' : 'Add vehicle'}

                </button>

              </div>

            </div>



            {showVehicleForm && (

              <form

                onSubmit={handleCreateVehicle}

                className="mt-5 rounded-2xl border border-slate-700/80 bg-slate-950/80 p-5 sm:p-6"

              >

                <div className="mb-5">

                  <h4 className="font-semibold text-white">Register a vehicle</h4>

                  <p className="mt-1 text-sm text-slate-500">

                    Add vehicle details and optionally assign a driver.

                  </p>

                </div>



                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

                  <label className={labelClass}>

                    Vehicle ID \*

                    <input

                      required

                      maxLength={50}

                      value={vehicleForm.vehicle_id}

                      onChange={(event) =>

                        setVehicleForm({ ...vehicleForm, vehicle_id: event.target.value })

                      }

                      placeholder="VH-003"

                      className={inputClass}

                    />

                  </label>

                  <label className={labelClass}>

                    Registration number \*

                    <input

                      required

                      maxLength={50}

                      value={vehicleForm.registration_number}

                      onChange={(event) =>

                        setVehicleForm({

                          ...vehicleForm,

                          registration_number: event.target.value,

                        })

                      }

                      placeholder="AP21AB5678"

                      className={inputClass}

                    />

                  </label>

                  <label className={labelClass}>

                    Vehicle type \*

                    <select

                      value={vehicleForm.vehicle_type}

                      onChange={(event) =>

                        setVehicleForm({ ...vehicleForm, vehicle_type: event.target.value })

                      }

                      className={inputClass}

                    >

                      {vehicleTypes.map((type) => (

                        <option key={type} value={type}>{type}</option>

                      ))}

                    </select>

                  </label>

                  <label className={labelClass}>

                    Capacity \*

                    <input

                      required

                      type="number"

                      min="0.01"

                      max="99999999.99"

                      step="0.01"

                      value={vehicleForm.capacity}

                      onChange={(event) =>

                        setVehicleForm({ ...vehicleForm, capacity: event.target.value })

                      }

                      placeholder="5000"

                      className={inputClass}

                    />

                  </label>

                  <label className={labelClass}>

                    Fuel type \*

                    <select

                      value={vehicleForm.fuel_type}

                      onChange={(event) =>

                        setVehicleForm({ ...vehicleForm, fuel_type: event.target.value })

                      }

                      className={inputClass}

                    >

                      {fuelTypes.map((fuel) => (

                        <option key={fuel} value={fuel}>{fuel}</option>

                      ))}

                    </select>

                  </label>

                  <label className={labelClass}>

                    Status \*

                    <select

                      value={vehicleForm.status}

                      onChange={(event) =>

                        setVehicleForm({ ...vehicleForm, status: event.target.value })

                      }

                      className={inputClass}

                    >

                      {vehicleStatuses.map((status) => (

                        <option key={status} value={status}>

                          {status.charAt(0).toUpperCase() + status.slice(1)}

                        </option>

                      ))}

                    </select>

                  </label>

                  <label className={labelClass}>

                    Assigned driver

                    <select

                      value={vehicleForm.assigned_driver_id}

                      onChange={(event) =>

                        setVehicleForm({

                          ...vehicleForm,

                          assigned_driver_id: event.target.value,

                        })

                      }

                      className={inputClass}

                    >

                      <option value="">Unassigned</option>

                      {drivers.map((driver) => (

                        <option key={driver.id} value={driver.id}>

                          {driver.full_name} ({driver.license_number})

                        </option>

                      ))}

                    </select>

                  </label>

                </div>



                <div className="mt-6 flex justify-end">

                  <button

                    type="submit"

                    disabled={savingVehicle}

                    className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"

                  >

                    <Save size={17} />

                    {savingVehicle ? 'Saving...' : 'Save vehicle'}

                  </button>

                </div>

              </form>

            )}

          </div>



          {editingVehicleId !== null && (() => {

            const vehicle = vehicles.find((item) => item.id === editingVehicleId)

            if (!vehicle) return null



            return (

              <form

                key={vehicle.id}

                onSubmit={(event) => handleUpdateVehicle(event, vehicle.id)}

                className="border-b border-slate-800 bg-slate-950/80 p-5 sm:p-6"

              >

                <div className="mb-5 flex items-center justify-between gap-3">

                  <div>

                    <h4 className="font-semibold text-white">

                      Edit vehicle: {vehicle.vehicle_id}

                    </h4>

                    <p className="mt-1 text-sm text-slate-500">

                      Update vehicle details and driver assignment.

                    </p>

                  </div>

                  <button

                    type="button"

                    onClick={() => setEditingVehicleId(null)}

                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-white"

                  >

                    <X size={16} /> Cancel

                  </button>

                </div>



                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

                  <label className={labelClass}>

                    Registration number \*

                    <input

                      name="registration_number"

                      required

                      maxLength={50}

                      defaultValue={vehicle.registration_number}

                      className={inputClass}

                    />

                  </label>

                  <label className={labelClass}>

                    Vehicle type

                    <select name="vehicle_type" defaultValue={vehicle.vehicle_type} className={inputClass}>

                      {vehicleTypes.map((type) => (

                        <option key={type} value={type}>{type}</option>

                      ))}

                    </select>

                  </label>

                  <label className={labelClass}>

                    Capacity \*

                    <input

                      name="capacity"

                      type="number"

                      min="0.01"

                      max="99999999.99"

                      step="0.01"

                      required

                      defaultValue={vehicle.capacity}

                      className={inputClass}

                    />

                  </label>

                  <label className={labelClass}>

                    Fuel type

                    <select name="fuel_type" defaultValue={vehicle.fuel_type} className={inputClass}>

                      {fuelTypes.map((fuel) => (

                        <option key={fuel} value={fuel}>{fuel}</option>

                      ))}

                    </select>

                  </label>

                  <label className={labelClass}>

                    Status

                    <select name="status" defaultValue={vehicle.status} className={inputClass}>

                      {vehicleStatuses.map((status) => (

                        <option key={status} value={status}>

                          {status.charAt(0).toUpperCase() + status.slice(1)}

                        </option>

                      ))}

                    </select>

                  </label>

                  <label className={labelClass}>

                    Assigned driver

                    <select

                      name="assigned_driver_id"

                      defaultValue={vehicle.assigned_driver_id ?? ''}

                      className={inputClass}

                    >

                      <option value="">Unassigned</option>

                      {drivers.map((driver) => (

                        <option key={driver.id} value={driver.id}>

                          {driver.full_name} ({driver.license_number})

                        </option>

                      ))}

                    </select>

                  </label>

                </div>



                <button

                  type="submit"

                  disabled={savingEdit}

                  className="mt-6 flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"

                >

                  <Save size={17} />

                  {savingEdit ? 'Saving...' : 'Save changes'}

                </button>

              </form>

            )

          })()}



          <div className="overflow-x-auto">

            <table className="w-full min-w-[900px] text-left text-sm">

              <thead className="bg-slate-950/80 text-[11px] uppercase tracking-[0.14em] text-slate-500">

                <tr>

                  <th className="px-5 py-4 font-semibold">Vehicle ID</th>

                  <th className="px-5 py-4 font-semibold">Registration</th>

                  <th className="px-5 py-4 font-semibold">Assigned driver</th>

                  <th className="px-5 py-4 font-semibold">Type</th>

                  <th className="px-5 py-4 font-semibold">Capacity</th>

                  <th className="px-5 py-4 font-semibold">Fuel</th>

                  <th className="px-5 py-4 font-semibold">Status</th>

                  <th className="px-5 py-4 font-semibold">Actions</th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-800/80">

                {filteredVehicles.map((vehicle) => {

                  const assignedDriver = drivers.find(

                    (driver) => driver.id === vehicle.assigned_driver_id

                  )

                  const statusClass =

                    vehicle.status === 'active'

                      ? 'border border-emerald-700/50 bg-emerald-400/10 text-emerald-300'

                      : vehicle.status === 'maintenance'

                        ? 'border border-amber-700/50 bg-amber-400/10 text-amber-300'

                        : 'border border-slate-700 bg-slate-800/80 text-slate-300'



                  return (

                    <tr

                      key={vehicle.id}

                      className="transition-colors hover:bg-emerald-400/[0.035]"

                    >

                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-white">

                        {vehicle.vehicle_id}

                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-slate-300">

                        {vehicle.registration_number}

                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-slate-300">

                        {assignedDriver?.full_name ?? 'Unassigned'}

                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-slate-300">

                        {vehicle.vehicle_type}

                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-slate-300">

                        {vehicle.capacity}

                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-slate-300">

                        <span className="inline-flex items-center gap-2">

                          <Fuel size={14} className="text-slate-500" />

                          {vehicle.fuel_type}

                        </span>

                      </td>

                      <td className="whitespace-nowrap px-5 py-4">

                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusClass}`}>

                          {vehicle.status}

                        </span>

                      </td>

                      <td className="whitespace-nowrap px-5 py-4">

                        <button

                          type="button"

                          onClick={() => {

                            setError('')

                            setNotice('')

                            setEditingVehicleId(vehicle.id)

                            setShowVehicleForm(false)

                          }}

                          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-emerald-300 transition hover:border-emerald-500/50 hover:bg-emerald-500/10"

                        >

                          <Pencil size={14} />

                          Edit

                        </button>

                      </td>

                    </tr>

                  )

                })}

                {!loading && filteredVehicles.length === 0 && (

                  <tr>

                    <td colSpan={9} className="px-5 py-12 text-center text-slate-400">

                      {vehicles.length

                        ? 'No vehicles match your filters.'

                        : 'No vehicles found. Add one to get started.'}

                    </td>

                  </tr>

                )}

              </tbody>

            </table>

          </div>

        </section>


        )}
        

{fleetDashboardRoles.includes(currentUser?.role) && activeView === 'gps' && (
  <section className="space-y-5">
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-emerald-400/10 p-2.5 text-emerald-300">
              <MapPin size={21} />
            </div>
            <h3 className="text-lg font-semibold text-white">
              Live vehicle tracking
            </h3>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Monitor recorded vehicle positions and manage simulated GPS tracking.
          </p>
        </div>

        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
            gpsSimulationRunning
              ? 'border-emerald-700/50 bg-emerald-400/10 text-emerald-300'
              : 'border-slate-700 bg-slate-800 text-slate-300'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              gpsSimulationRunning ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'
            }`}
          />
          {gpsSimulationRunning ? 'Simulation running' : 'Simulation stopped'}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <label className="text-sm font-medium text-slate-300">
          Select vehicle
          <select
            value={gpsVehicleId}
            onChange={(event) => setGpsVehicleId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100 outline-none focus:border-emerald-500"
          >
            <option value="">Choose a vehicle</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={String(vehicle.id)}>
                {vehicle.registration_number || vehicle.vehicle_id || `Vehicle ${vehicle.id}`}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-300">
          Shipment ID
          <input
            type="number"
            min="1"
            value={gpsShipmentId}
            onChange={(event) => setGpsShipmentId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100 outline-none focus:border-emerald-500"
          />
        </label>

        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={startGpsSimulation}
            disabled={gpsSimulationLoading || gpsSimulationRunning}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Activity size={17} />
            {gpsSimulationLoading ? 'Please wait…' : 'Start'}
          </button>

          <button
            type="button"
            onClick={stopGpsSimulation}
            disabled={gpsSimulationLoading || !gpsSimulationRunning}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={17} />
            Stop
          </button>
        </div>
      </div>

      {gpsSimulationMessage && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-300"
        >
          {gpsSimulationMessage}
        </p>
      )}

      <p className="mt-3 text-xs leading-5 text-slate-500">
        Simulation uses generated coordinates, not a physical vehicle GPS device.
        Each run generates up to 20 positions at five-second intervals.
      </p>
    </div>

    <Suspense fallback={<div role="status" className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">Loading GPS map…</div>}>
      <GPSMap
        key={gpsVehicleId || 'none'}
        vehicleId={gpsVehicleId}
        shipmentId={gpsShipmentId || null}
      />
    </Suspense>
  </section>
)}


        {activeView === 'trips' && <section className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-5"><div><h3 className="text-lg font-semibold text-white">Schedule trip</h3><p className="mt-1 text-sm text-slate-400">Route distance and duration are fetched from OSRM. Traffic and fuel estimates are not available from this provider.</p></div><form onSubmit={createTrip} className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"><label className={labelClass}>Vehicle<select required value={tripForm.vehicle_id} onChange={(e) => setTripForm({...tripForm,vehicle_id:e.target.value})} className={inputClass}><option value="">Choose vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.registration_number}</option>)}</select></label><label className={labelClass}>Driver<select required value={tripForm.driver_id} onChange={(e) => setTripForm({...tripForm,driver_id:e.target.value})} className={inputClass}><option value="">Choose driver</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label><label className={labelClass}>Route option<select value={tripForm.route_selection} onChange={(e)=>setTripForm({...tripForm,route_selection:e.target.value})} className={inputClass}><option value="fastest">Fastest returned route</option><option value="shortest">Shortest returned route</option></select></label><label className={labelClass}>Origin<input required value={tripForm.origin} onChange={(e)=>setTripForm({...tripForm,origin:e.target.value})} className={inputClass}/></label><label className={labelClass}>Destination<input required value={tripForm.destination} onChange={(e)=>setTripForm({...tripForm,destination:e.target.value})} className={inputClass}/></label><label className={labelClass}>Departure<input required type="datetime-local" value={tripForm.scheduled_departure} onChange={(e)=>setTripForm({...tripForm,scheduled_departure:e.target.value})} className={inputClass}/></label><label className={labelClass}>Shipment IDs (comma separated, optional)<input value={tripForm.shipment_ids} onChange={(e)=>setTripForm({...tripForm,shipment_ids:e.target.value})} placeholder="e.g. 12, 13" className={inputClass}/></label><div className="flex items-end"><button disabled={tripBusy} className="rounded-xl bg-emerald-500 px-4 py-2.5 font-semibold text-slate-950 disabled:opacity-50">{tripBusy?'Scheduling…':'Create trip'}</button></div></form><div className="space-y-3">{trips.map(trip=><article key={trip.id} className="rounded-xl border border-slate-700 bg-slate-950 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold text-white">Trip {trip.id} · {trip.origin} → {trip.destination}</h4><p className="mt-1 text-sm text-slate-400">Vehicle {trip.vehicle_id} · Driver {trip.driver_id} · {trip.route_selection} ({trip.route_distance_km} km, {trip.route_duration_minutes} min)</p><p className="mt-1 text-xs text-slate-500">ETA {trip.estimated_arrival ? new Date(trip.estimated_arrival).toLocaleString() : 'Unavailable'} · Shipments {trip.shipment_ids.join(', ') || 'none'} · Traffic {trip.traffic_data}</p></div><div className="flex items-center gap-2"><span className="text-xs capitalize text-slate-300">{trip.status.replace('_',' ')}</span>{trip.status==='scheduled'&&<button onClick={()=>updateTripStatus(trip,'in_progress')} className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200">Start</button>}{trip.status==='in_progress'&&<button onClick={()=>updateTripStatus(trip,'completed')} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950">Complete</button>}{['scheduled','in_progress'].includes(trip.status)&&<button onClick={()=>updateTripStatus(trip,'cancelled')} className="rounded-lg border border-rose-700 px-3 py-2 text-xs text-rose-300">Cancel</button>}</div></div></article>)}{!trips.length&&<p className="text-sm text-slate-400">No trips scheduled.</p>}</div></section>}

        {(activeView === 'shipments' || activeView === 'routes') && (
          <section className="w-full overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/80 shadow-xl shadow-black/10">
            <div className="border-b border-slate-800/80 p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2"><div className="rounded-lg bg-emerald-400/10 p-2 text-emerald-300">{activeView === 'routes' ? <Route size={18} /> : <Package size={18} />}</div><h3 className="text-lg font-semibold text-white">{activeView === 'routes' ? 'Route planning' : 'Shipment management'}</h3></div>
                  <p className="mt-2 text-sm text-slate-400">{activeView === 'routes' ? 'Select a shipment below to view its OSRM route estimate or calculate and save an ETA.' : `Showing ${filteredShipments.length} of ${shipments.length} shipment(s)`}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
                  <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950 px-3"><Search size={17} className="shrink-0 text-slate-500" /><input value={shipmentSearch} onChange={(event) => setShipmentSearch(event.target.value)} placeholder="Search shipments..." aria-label="Search shipments" className="min-w-0 w-full bg-transparent py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600" /></label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950 px-3"><SlidersHorizontal size={16} className="text-slate-500" /><select value={shipmentStatusFilter} onChange={(event) => setShipmentStatusFilter(event.target.value)} aria-label="Filter shipments by status" className="w-full bg-transparent py-2.5 text-sm text-slate-200 outline-none"><option value="all">All statuses</option>{shipmentStatuses.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950 px-3 text-xs text-slate-400">Edit<select value={editingShipmentId ?? ''} aria-label="Choose shipment to edit" onChange={(event) => { const selected = shipments.find((item) => item.id === Number(event.target.value)); setEditingShipmentId(selected?.id ?? null); setShipmentEditForm(selected ? { tracking_number: selected.tracking_number, origin: selected.origin, destination: selected.destination, cargo_description: selected.cargo_description, weight: selected.weight } : null); }} className="max-w-40 bg-transparent py-2.5 text-sm text-slate-200 outline-none"><option value="">Choose shipment</option>{shipments.map((item) => <option key={item.id} value={item.id}>{item.tracking_number}</option>)}</select></label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950 px-3 text-xs text-slate-400">History<select defaultValue="" aria-label="Load shipment status history" onChange={(event) => event.target.value && handleViewShipmentHistory(Number(event.target.value))} className="max-w-44 bg-transparent py-2.5 text-sm text-slate-200 outline-none"><option value="">Choose shipment</option>{shipments.map((item) => <option key={item.id} value={item.id}>{item.tracking_number}</option>)}</select></label>
                  <button type="button" onClick={() => { setError(''); setNotice(''); setShowShipmentForm((visible) => !visible); }} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">{showShipmentForm ? <X size={17} /> : <Plus size={17} />}{showShipmentForm ? 'Cancel' : 'Add shipment'}</button>
                </div>
              </div>
              {showShipmentForm && (
                <form onSubmit={handleCreateShipment} className="mt-5 rounded-2xl border border-slate-700/80 bg-slate-950/80 p-5 sm:p-6">
                  <h4 className="mb-4 font-semibold text-white">Create a shipment</h4>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className={labelClass}>Tracking number *<input required maxLength={50} value={shipmentForm.tracking_number} onChange={(event) => setShipmentForm({ ...shipmentForm, tracking_number: event.target.value })} placeholder="FF-2026-001" className={inputClass} /></label>
                    <label className={labelClass}>Origin *<input required maxLength={255} value={shipmentForm.origin} onChange={(event) => setShipmentForm({ ...shipmentForm, origin: event.target.value })} placeholder="Kurnool" className={inputClass} /></label>
                    <label className={labelClass}>Destination *<input required maxLength={255} value={shipmentForm.destination} onChange={(event) => setShipmentForm({ ...shipmentForm, destination: event.target.value })} placeholder="Hyderabad" className={inputClass} /></label>
                    <label className={labelClass}>Cargo description *<input required maxLength={255} value={shipmentForm.cargo_description} onChange={(event) => setShipmentForm({ ...shipmentForm, cargo_description: event.target.value })} placeholder="General goods" className={inputClass} /></label>
                    <label className={labelClass}>Weight (kg) *<input required type="number" min="0.01" max="99999999.99" step="0.01" value={shipmentForm.weight} onChange={(event) => setShipmentForm({ ...shipmentForm, weight: event.target.value })} placeholder="250" className={inputClass} /></label>
                  </div>
                  <div className="mt-5 flex justify-end"><button type="submit" disabled={savingShipment} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"><Save size={17} />{savingShipment ? 'Saving...' : 'Save shipment'}</button></div>
                </form>
              )}
              {editingShipmentId && shipmentEditForm && <form onSubmit={handleUpdateShipmentDetails} className="mt-5 rounded-2xl border border-slate-700/80 bg-slate-950/80 p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><h4 className="font-semibold text-white">Edit shipment details</h4><button type="button" onClick={() => { setEditingShipmentId(null); setShipmentEditForm(null); }} className="rounded-lg border border-slate-700 p-2 text-slate-300" aria-label="Cancel shipment edit"><X size={16} /></button></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label className={labelClass}>Tracking number<input required maxLength={50} value={shipmentEditForm.tracking_number} onChange={(e) => setShipmentEditForm({ ...shipmentEditForm, tracking_number: e.target.value })} className={inputClass} /></label><label className={labelClass}>Origin<input required maxLength={255} value={shipmentEditForm.origin} onChange={(e) => setShipmentEditForm({ ...shipmentEditForm, origin: e.target.value })} className={inputClass} /></label><label className={labelClass}>Destination<input required maxLength={255} value={shipmentEditForm.destination} onChange={(e) => setShipmentEditForm({ ...shipmentEditForm, destination: e.target.value })} className={inputClass} /></label><label className={labelClass}>Cargo description<input required maxLength={255} value={shipmentEditForm.cargo_description} onChange={(e) => setShipmentEditForm({ ...shipmentEditForm, cargo_description: e.target.value })} className={inputClass} /></label><label className={labelClass}>Weight (kg)<input required type="number" min="0.01" step="0.01" value={shipmentEditForm.weight} onChange={(e) => setShipmentEditForm({ ...shipmentEditForm, weight: e.target.value })} className={inputClass} /></label></div><div className="mt-4 flex justify-end"><button className="rounded-xl bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950">Save shipment</button></div></form>}
            </div>
            {Object.entries(shipmentHistories).map(([shipmentId, history]) => <article key={shipmentId} className="m-5 rounded-xl border border-slate-700 bg-slate-950 p-4"><h4 className="font-semibold text-white">Status and ETA history · {shipments.find((item) => item.id === Number(shipmentId))?.tracking_number || `Shipment ${shipmentId}`}</h4><ol className="mt-3 space-y-2">{history.map((event) => <li key={`status-${event.id}`} className="flex flex-wrap items-center gap-x-2 text-sm text-slate-300"><time className="text-xs text-slate-500">{new Date(event.changed_at).toLocaleString()}</time><span>{event.previous_status ? `${event.previous_status.replace('_', ' ')} → ` : 'Created as '}{event.status.replace('_', ' ')}</span><span className="text-xs text-slate-500">by user {event.changed_by_user_id ?? 'unknown'}</span></li>)}{(shipmentEtaHistories[shipmentId] || []).map((event) => <li key={`eta-${event.id}`} className="flex flex-wrap items-center gap-x-2 text-sm text-slate-300"><time className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</time><span>ETA revised to {new Date(event.estimated_arrival).toLocaleString()}</span><span className="text-xs text-slate-500">source: {event.source}</span></li>)}</ol></article>)}
            <div className="overflow-x-auto"><table className="w-full min-w-[1900px] text-left text-sm"><thead className="bg-slate-950/80 text-[11px] uppercase tracking-[0.14em] text-slate-500"><tr><th className="px-5 py-4 font-semibold">Tracking number</th><th className="px-5 py-4 font-semibold">Route</th><th className="px-5 py-4 font-semibold">Cargo</th><th className="px-5 py-4 font-semibold">Vehicle</th><th className="px-5 py-4 font-semibold">Driver</th><th className="px-5 py-4 font-semibold">Weight</th><th className="px-5 py-4 font-semibold">Status</th><th className="px-5 py-4 font-semibold">Update status</th><th className="px-5 py-4 font-semibold">Route / ETA</th><th className="px-5 py-4 font-semibold">Scheduling</th></tr></thead>
              <tbody className="divide-y divide-slate-800/80">{filteredShipments.map((shipment) => <tr key={shipment.id} className="transition-colors hover:bg-emerald-400/[0.035]"><td className="whitespace-nowrap px-5 py-4 font-semibold text-white">{shipment.tracking_number}</td><td className="px-5 py-4 text-slate-300"><span>{shipment.origin}</span><span className="mx-2 text-emerald-400">→</span><span>{shipment.destination}</span></td><td className="px-5 py-4 text-slate-300">{shipment.cargo_description}</td><td className="px-5 py-4"><select value={shipment.vehicle_id ?? ''} disabled={updatingShipmentId === shipment.id} onChange={(event) => handleShipmentAssignmentChange(shipment.id, 'vehicle_id', event.target.value)} aria-label={`Assign vehicle to ${shipment.tracking_number}`} className="w-44 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 disabled:opacity-50"><option value="">Unassigned</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration_number || vehicle.vehicle_id || `Vehicle ${vehicle.id}`}</option>)}</select></td><td className="px-5 py-4"><select value={shipment.driver_id ?? ''} disabled={updatingShipmentId === shipment.id} onChange={(event) => handleShipmentAssignmentChange(shipment.id, 'driver_id', event.target.value)} aria-label={`Assign driver to ${shipment.tracking_number}`} className="w-44 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 disabled:opacity-50"><option value="">Unassigned</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name || `Driver ${driver.id}`}</option>)}</select></td><td className="whitespace-nowrap px-5 py-4 text-slate-300">{shipment.weight} kg</td><td className="whitespace-nowrap px-5 py-4"><span className="rounded-full border border-emerald-700/50 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium capitalize text-emerald-300">{shipment.status.replace('_', ' ')}</span></td><td className="px-5 py-4"><select value={shipment.status} disabled={updatingShipmentId === shipment.id} onChange={(event) => handleShipmentStatusChange(shipment.id, event.target.value)} aria-label={`Update ${shipment.tracking_number} status`} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500">{shipmentStatuses.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></td><td className="px-5 py-4"><div className="flex min-w-48 flex-col gap-2"><button type="button" disabled={routeLoadingId === shipment.id} onClick={() => handleViewShipmentRoute(shipment)} className="rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">{routeLoadingId === shipment.id ? 'Calculating...' : 'View Route / ETA'}</button>{shipmentRoutes[shipment.id] && <div className="space-y-1 text-xs text-slate-300"><p>Fastest: {shipmentRoutes[shipment.id].fastest_route?.distance_km ?? shipmentRoutes[shipment.id].distance_km} km · {shipmentRoutes[shipment.id].fastest_route?.duration_minutes ?? shipmentRoutes[shipment.id].duration_minutes} min</p><p>Shortest: {shipmentRoutes[shipment.id].shortest_route?.distance_km ?? shipmentRoutes[shipment.id].shortest_distance_km} km</p><p>Available routes: {shipmentRoutes[shipment.id].alternatives_found}</p><p className="text-amber-300">Traffic and fuel options unavailable from OSRM</p></div>}</div></td><td className="px-5 py-4"><div className="flex min-w-64 flex-col gap-3"><div className="space-y-1 text-xs text-slate-300"><p><span className="text-slate-500">Departure:</span> {shipment.scheduled_departure ? new Date(shipment.scheduled_departure).toLocaleString() : 'Not scheduled'}</p><p><span className="text-slate-500">Saved arrival:</span> {shipment.estimated_arrival ? new Date(shipment.estimated_arrival).toLocaleString() : 'Not calculated'}</p>{shipment.actual_arrival&&<p><span className="text-slate-500">Actual arrival:</span> {new Date(shipment.actual_arrival).toLocaleString()}</p>}{shipment.actual_arrival&&shipment.estimated_arrival&&<p className="text-xs text-emerald-300">{Math.round((new Date(shipment.actual_arrival)-new Date(shipment.estimated_arrival))/60000)<=0?'Arrived on or before ETA':`Arrived ${Math.round((new Date(shipment.actual_arrival)-new Date(shipment.estimated_arrival))/60000)} minutes after ETA`}</p>}</div><form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); handleScheduleDeparture(shipment, formData.get('scheduled_departure')); }}><label className="text-xs text-slate-400">Scheduled departure<input name="scheduled_departure" type="datetime-local" required defaultValue={shipment.scheduled_departure ? (() => { const date = new Date(shipment.scheduled_departure); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); })() : ''} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500" /></label><button type="submit" disabled={updatingShipmentId === shipment.id} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-500/50 disabled:opacity-50">{updatingShipmentId === shipment.id ? 'Saving...' : 'Save Departure'}</button></form><button type="button" disabled={!shipment.scheduled_departure || routeLoadingId === shipment.id} onClick={() => handleCalculateShipmentEta(shipment)} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">{routeLoadingId === shipment.id ? 'Calculating...' : 'Calculate & Save ETA'}</button></div></td></tr>)}
              {!loading && filteredShipments.length === 0 && <tr><td colSpan={10} className="px-5 py-12 text-center text-slate-400">{shipments.length ? 'No shipments match your filters.' : 'No shipments found. Add one to get started.'}</td></tr>}</tbody></table></div>
          </section>
        )}

        {activeView === 'drivers' && (fleetDashboardRoles.includes(currentUser?.role) || currentUser?.role === 'driver') && <DriverManagementDashboard currentUser={currentUser} />}

        {activeView === 'driversLegacy' && (
          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-lg font-semibold text-white">Driver management</h3><p className="mt-1 text-sm text-slate-400">Driver profiles and license details.</p></div>
              {['administrator', 'fleet_manager'].includes(currentUser?.role) && <button type="button" onClick={() => { setDriverForm(emptyDriver); setEditingDriverId(null); setShowDriverForm((shown) => !shown); }} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950"><Plus size={16} />Add driver</button>}
            </div>
            {showDriverForm && !editingDriverId && <form onSubmit={handleCreateDriver} className="mt-5 grid gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className={labelClass}>Full name<input required minLength={2} value={driverForm.full_name} onChange={(e) => setDriverForm({ ...driverForm, full_name: e.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Email<input required type="email" value={driverForm.email} onChange={(e) => setDriverForm({ ...driverForm, email: e.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Initial password<input required type="password" minLength={8} maxLength={128} value={driverForm.password} onChange={(e) => setDriverForm({ ...driverForm, password: e.target.value })} className={inputClass} /></label>
              <label className={labelClass}>License number<input required value={driverForm.license_number} onChange={(e) => setDriverForm({ ...driverForm, license_number: e.target.value })} className={inputClass} /></label>
              <label className={labelClass}>License expiry<input type="datetime-local" value={driverForm.license_expiry} onChange={(e) => setDriverForm({ ...driverForm, license_expiry: e.target.value })} className={inputClass} /></label>
              <div className="flex items-end"><button className="rounded-xl bg-emerald-500 px-4 py-2.5 font-semibold text-slate-950">Create driver</button></div>
            </form>}
            {editingDriverId && <form onSubmit={handleUpdateDriver} className="mt-5 grid gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className={labelClass}>Full name<input required value={driverForm.full_name} onChange={(e) => setDriverForm({ ...driverForm, full_name: e.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Email<input required type="email" value={driverForm.email} onChange={(e) => setDriverForm({ ...driverForm, email: e.target.value })} className={inputClass} /></label>
              <label className={labelClass}>License number<input required value={driverForm.license_number} onChange={(e) => setDriverForm({ ...driverForm, license_number: e.target.value })} className={inputClass} /></label>
              <label className={labelClass}>License expiry<input type="datetime-local" value={driverForm.license_expiry} onChange={(e) => setDriverForm({ ...driverForm, license_expiry: e.target.value })} className={inputClass} /></label>
              <div className="flex items-end gap-2"><button className="rounded-xl bg-emerald-500 px-4 py-2.5 font-semibold text-slate-950">Save</button><button type="button" onClick={() => setEditingDriverId(null)} className="rounded-xl border border-slate-700 px-4 py-2.5">Cancel</button></div>
            </form>}
            <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="p-3">Driver</th><th className="p-3">Email</th><th className="p-3">License</th><th className="p-3">Expiry</th><th className="p-3">Attendance</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-800">{drivers.map((driver) => <tr key={driver.id}><td className="p-3 font-medium text-white">{driver.full_name}</td><td className="p-3 text-slate-300">{driver.email}</td><td className="p-3 text-slate-300">{driver.license_number}</td><td className="p-3 text-slate-300">{driver.license_expiry ? new Date(driver.license_expiry).toLocaleDateString() : 'Not recorded'}</td><td className="p-3 capitalize text-slate-300">{driver.attendance_status}</td><td className="p-3">{['administrator', 'fleet_manager'].includes(currentUser?.role) && <button type="button" onClick={() => { setEditingDriverId(driver.id); setShowDriverForm(false); setDriverForm({ full_name: driver.full_name, email: driver.email, password: '', license_number: driver.license_number, license_expiry: toLocalInput(driver.license_expiry) }); }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-emerald-300">Edit</button>}</td></tr>)}{drivers.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-400">No drivers recorded yet.</td></tr>}</tbody></table></div>
          </section>
        )}

        {activeView === 'fuel' && (
          <section className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
            <div><h3 className="text-lg font-semibold text-white">Fuel records</h3><p className="mt-1 text-sm text-slate-400">Recorded fuel purchases and odometer readings. Efficiency uses only full-tank intervals.</p></div>
            {['administrator', 'fleet_manager'].includes(currentUser?.role) && <form onSubmit={handleCreateFuelLog} className="grid gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className={labelClass}>Vehicle<select required value={fuelForm.vehicle_id} onChange={(event) => setFuelForm({ ...fuelForm, vehicle_id: event.target.value })} className={inputClass}><option value="">Choose vehicle</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration_number} · {vehicle.vehicle_id}</option>)}</select></label>
              <label className={labelClass}>Logged at<input type="datetime-local" value={fuelForm.logged_at} onChange={(event) => setFuelForm({ ...fuelForm, logged_at: event.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Odometer (km)<input required type="number" min="0" step="0.01" value={fuelForm.odometer_km} onChange={(event) => setFuelForm({ ...fuelForm, odometer_km: event.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Fuel (liters)<input required type="number" min="0.001" step="0.001" value={fuelForm.liters} onChange={(event) => setFuelForm({ ...fuelForm, liters: event.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Total cost<input required type="number" min="0" step="0.01" value={fuelForm.total_cost} onChange={(event) => setFuelForm({ ...fuelForm, total_cost: event.target.value })} className={inputClass} /></label>
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={fuelForm.is_full_tank} onChange={(event) => setFuelForm({ ...fuelForm, is_full_tank: event.target.checked })} className="accent-emerald-500" />Filled tank completely</label>
              <button disabled={savingFuelLog} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{savingFuelLog ? 'Saving…' : 'Record fuel log'}</button>
            </form>}
            <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="p-3">Vehicle</th><th className="p-3">Date</th><th className="p-3">Odometer</th><th className="p-3">Liters</th><th className="p-3">Cost</th><th className="p-3">Tank</th></tr></thead><tbody className="divide-y divide-slate-800">{fuelLogs.map((log) => <tr key={log.id}><td className="p-3 text-white">{vehicles.find((vehicle) => vehicle.id === log.vehicle_id)?.registration_number || `Vehicle ${log.vehicle_id}`}</td><td className="p-3 text-slate-300">{new Date(log.logged_at).toLocaleString()}</td><td className="p-3 text-slate-300">{Number(log.odometer_km).toLocaleString()} km</td><td className="p-3 text-slate-300">{Number(log.liters).toFixed(3)} L</td><td className="p-3 text-slate-300">{Number(log.total_cost).toLocaleString(undefined, { style: 'currency', currency: 'INR' })}</td><td className="p-3 text-slate-300">{log.is_full_tank ? 'Full' : 'Partial'}</td></tr>)}{fuelLogs.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-400">No fuel records. Enter actual fuel events to calculate reports.</td></tr>}</tbody></table></div>
          </section>
        )}

        {activeView === 'driversLegacy' && (
          <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="font-semibold text-white">Attendance history</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className={labelClass}>Driver<select required value={attendanceForm.driver_id} onChange={(event) => handleLoadAttendance(event.target.value)} className={inputClass}><option value="">Choose driver</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name}</option>)}</select></label>
              {['administrator', 'fleet_manager'].includes(currentUser?.role) && <><label className={labelClass}>Status<select value={attendanceForm.status} onChange={(event) => setAttendanceForm({ ...attendanceForm, status: event.target.value })} className={inputClass}><option value="present">Present</option><option value="absent">Absent</option><option value="leave">Leave</option></select></label><label className={labelClass}>Note<input maxLength={2000} value={attendanceForm.note} onChange={(event) => setAttendanceForm({ ...attendanceForm, note: event.target.value })} className={inputClass} /></label><div className="flex items-end"><button type="button" disabled={!attendanceForm.driver_id} onClick={handleRecordAttendance} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">Record attendance</button></div></>}
            </div>
            {attendanceHistory.length > 0 && <ul className="mt-4 space-y-1">{attendanceHistory.slice(0, 10).map((record) => <li key={record.id} className="text-sm text-slate-300">{new Date(record.recorded_at).toLocaleString()} · <span className="capitalize">{record.status}</span>{record.note ? ` · ${record.note}` : ''}</li>)}</ul>}
          </section>
        )}

        {activeView === 'maintenance' && (
          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold text-white">Maintenance history</h3><p className="mt-1 text-sm text-slate-400">Service records and due dates from saved vehicle history.</p></div>{['administrator', 'fleet_manager'].includes(currentUser?.role) && <button type="button" onClick={() => { setEditingMaintenanceId(null); setMaintenanceForm(emptyMaintenance); setShowMaintenanceForm((shown) => !shown); }} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950"><Plus size={16} />Record service</button>}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3"><article className="rounded-xl border border-red-900/60 bg-red-950/30 p-4"><p className="text-sm text-slate-400">Overdue</p><p className="mt-1 text-2xl font-bold text-red-300">{analytics?.maintenance?.overdue ?? '—'}</p></article><article className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4"><p className="text-sm text-slate-400">Due within 30 days</p><p className="mt-1 text-2xl font-bold text-amber-300">{analytics?.maintenance?.upcoming_next_30_days ?? '—'}</p></article><article className="rounded-xl border border-slate-700 bg-slate-950/50 p-4"><p className="text-sm text-slate-400">Scheduled service within 30 days</p><p className="mt-1 text-2xl font-bold text-white">{analytics?.maintenance?.scheduled_next_30_days ?? '—'}</p></article></div>
            <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-4">
              <h3 className="font-semibold text-white">Vehicle inspections</h3>
              {['administrator', 'fleet_manager'].includes(currentUser?.role) && <form onSubmit={handleCreateInspection} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className={labelClass}>Vehicle<select required value={inspectionForm.vehicle_id} onChange={(event) => setInspectionForm({ ...inspectionForm, vehicle_id: event.target.value })} className={inputClass}><option value="">Choose vehicle</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration_number}</option>)}</select></label>
                <label className={labelClass}>Category<select value={inspectionForm.category} onChange={(event) => setInspectionForm({ ...inspectionForm, category: event.target.value })} className={inputClass}><option value="general_inspection">General inspection</option><option value="oil_change">Oil change</option><option value="tire_replacement">Tire replacement</option><option value="engine_service">Engine service</option><option value="brake_service">Brake service</option></select></label>
                <label className={labelClass}>Result<select value={inspectionForm.result} onChange={(event) => setInspectionForm({ ...inspectionForm, result: event.target.value })} className={inputClass}><option value="passed">Passed</option><option value="attention_required">Attention required</option><option value="failed">Failed</option></select></label>
                <label className={labelClass}>Notes<input maxLength={2000} value={inspectionForm.notes} onChange={(event) => setInspectionForm({ ...inspectionForm, notes: event.target.value })} className={inputClass} /></label>
                <fieldset className="flex flex-wrap gap-3 text-sm text-slate-300 sm:col-span-2 lg:col-span-4"><legend className="text-xs uppercase text-slate-500">Checklist · checked means passed</legend>{Object.entries(inspectionForm.checklist).map(([item, passed]) => <label key={item} className="flex items-center gap-2 capitalize"><input type="checkbox" checked={passed} onChange={(event) => setInspectionForm({ ...inspectionForm, checklist: { ...inspectionForm.checklist, [item]: event.target.checked } })} className="accent-emerald-500" />{item}</label>)}</fieldset>
                <button className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950">Record inspection</button>
              </form>}
              {healthReport && <div className="mt-4 rounded-lg border border-slate-700 p-3 text-sm text-slate-300"><strong className="text-white">Vehicle {healthReport.vehicle_id} health record:</strong> {healthReport.health_assessment.replaceAll('_', ' ')} · vehicle status {healthReport.vehicle_status} · {healthReport.latest_inspection?.notes || healthReport.assessment_source}</div>}
              <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="p-2">Vehicle</th><th className="p-2">Category</th><th className="p-2">Result</th><th className="p-2">Inspected</th><th className="p-2">Checklist</th><th className="p-2">Report</th></tr></thead><tbody className="divide-y divide-slate-800">{inspections.map((inspection) => <tr key={inspection.id}><td className="p-2 text-white">{vehicles.find((vehicle) => vehicle.id === inspection.vehicle_id)?.registration_number || `Vehicle ${inspection.vehicle_id}`}</td><td className="p-2 capitalize text-slate-300">{inspection.category.replaceAll('_', ' ')}</td><td className="p-2 capitalize text-slate-300">{inspection.result.replaceAll('_', ' ')}</td><td className="p-2 text-slate-300">{new Date(inspection.inspected_at).toLocaleString()}</td><td className="p-2 text-slate-300">{Object.entries(inspection.checklist).map(([item, passed]) => `${item}: ${passed ? 'pass' : 'issue'}`).join(', ')}</td><td className="p-2"><button type="button" onClick={() => handleLoadVehicleHealth(inspection.vehicle_id)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-emerald-300">Health record</button></td></tr>)}{inspections.length === 0 && <tr><td colSpan="6" className="p-6 text-center text-slate-400">No inspection records.</td></tr>}</tbody></table></div>
            </div>
            {(showMaintenanceForm || editingMaintenanceId) && <form onSubmit={handleSaveMaintenance} className="mt-5 grid gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {!editingMaintenanceId && <label className={labelClass}>Vehicle<select required value={maintenanceForm.vehicle_id} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, vehicle_id: e.target.value })} className={inputClass}><option value="">Select a vehicle</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration_number} ({vehicle.vehicle_id})</option>)}</select></label>}
              <label className={labelClass}>Service type<input required maxLength={80} value={maintenanceForm.service_type} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, service_type: e.target.value })} placeholder="Oil change" className={inputClass} /></label>
              <label className={labelClass}>Status<select value={maintenanceForm.status} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, status: e.target.value })} className={inputClass}><option value="completed">Completed</option><option value="scheduled">Scheduled</option><option value="cancelled">Cancelled</option></select></label>
              <label className={labelClass}>Service date<input required type="datetime-local" value={maintenanceForm.service_date} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, service_date: e.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Next due date<input type="datetime-local" value={maintenanceForm.next_due_date} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, next_due_date: e.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Cost (optional)<input type="number" min="0" step="0.01" value={maintenanceForm.cost} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, cost: e.target.value })} className={inputClass} /></label>
              <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>Description<textarea required maxLength={2000} rows={3} value={maintenanceForm.description} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })} className={inputClass} /></label>
              <div className="flex gap-2"><button disabled={savingMaintenance} className="rounded-xl bg-emerald-500 px-4 py-2.5 font-semibold text-slate-950">{savingMaintenance ? 'Saving…' : 'Save record'}</button><button type="button" onClick={() => { setShowMaintenanceForm(false); setEditingMaintenanceId(null); }} className="rounded-xl border border-slate-700 px-4 py-2.5">Cancel</button></div>
            </form>}
            <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="p-3">Vehicle</th><th className="p-3">Service</th><th className="p-3">Service date</th><th className="p-3">Next due</th><th className="p-3">Cost</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-slate-800">{maintenanceRecords.map((record) => { const vehicle = vehicles.find((item) => item.id === record.vehicle_id); return <tr key={record.id}><td className="p-3 text-white">{vehicle?.registration_number || `Vehicle ${record.vehicle_id}`}</td><td className="p-3"><p className="font-medium text-white">{record.service_type}</p><p className="max-w-sm text-xs text-slate-400">{record.description}</p></td><td className="p-3 text-slate-300">{new Date(record.service_date).toLocaleString()}</td><td className="p-3 text-slate-300">{record.next_due_date ? new Date(record.next_due_date).toLocaleDateString() : 'Not set'}</td><td className="p-3 text-slate-300">{record.cost == null ? 'Not recorded' : Number(record.cost).toLocaleString(undefined, { style: 'currency', currency: 'INR' })}</td><td className="p-3 capitalize text-slate-300">{record.status}</td><td className="p-3">{['administrator', 'fleet_manager'].includes(currentUser?.role) && <button type="button" onClick={() => { setShowMaintenanceForm(false); setEditingMaintenanceId(record.id); setMaintenanceForm({ vehicle_id: String(record.vehicle_id), service_type: record.service_type, description: record.description, service_date: toLocalInput(record.service_date), cost: record.cost ?? '', next_due_date: toLocalInput(record.next_due_date), status: record.status }); }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-emerald-300">Edit</button>}</td></tr> })}{maintenanceRecords.length === 0 && <tr><td colSpan="7" className="p-8 text-center text-slate-400">No maintenance records yet.</td></tr>}</tbody></table></div>
          </section>
        )}

        {activeView === 'alerts' && <section className="space-y-3"><div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">These alerts are calculated from current application records and shown in this dashboard only. They are not persisted and no notifications are sent.</div>{alerts.map((alert) => <article key={alert.id} className={`rounded-xl border p-4 ${alert.severity === 'critical' ? 'border-red-900/70 bg-red-950/20' : alert.severity === 'warning' ? 'border-amber-900/70 bg-amber-950/20' : 'border-slate-700 bg-slate-900'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{alert.title}</p><p className="mt-1 text-sm text-slate-300">{alert.detail}</p></div><span className="rounded-full bg-slate-950/60 px-2.5 py-1 text-xs capitalize text-slate-300">{alert.severity}</span></div></article>)}{alerts.length === 0 && <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">No current alerts from the stored fleet data.</div>}</section>}

        {activeView === 'analytics' && <AnalyticsDashboard onExport={downloadReport} exportingReport={exportingReport} reportName={reportName} setReportName={setReportName} />}

        <p className="mt-6 text-center text-xs text-slate-600">
          FleetFlow · Local development environment

        </p>

      </section>

    </main>

  )

}



export default App
