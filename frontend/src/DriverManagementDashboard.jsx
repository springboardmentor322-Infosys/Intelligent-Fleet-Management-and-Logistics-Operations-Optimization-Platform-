import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Activity, ArrowLeft, Clock3, Eye, Mail, MapPin, Search, Truck, Users } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import './driver-management.css'
import api from './api'
import { gpsConnectionStatus, gpsSourceLabel } from './tracking'
const GPSMap = lazy(() => import('./GPSMap'))

const roles = ['administrator', 'fleet_manager', 'dispatcher', 'driver']
const managers = ['administrator', 'fleet_manager']
const statusNames = { on_route: 'On Route', at_stop: 'At Stop', delayed: 'Delayed', off_duty: 'Off Duty', available: 'Available', unknown: 'Unconfirmed' }
const statusColors = { on_route: '#22C58B', at_stop: '#2563EB', delayed: '#EF4444', off_duty: '#64748B', available: '#94A3B8', unknown: '#64748B' }
const iconFor = (status) => L.divIcon({ className: 'driver-map-icon', html: `<span style="display:block;width:18px;height:18px;border:3px solid white;border-radius:50%;background:${statusColors[status] || statusColors.available};box-shadow:0 1px 6px #475569"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] })
const dateTime = (value) => value ? new Date(value).toLocaleString() : 'Not recorded'
const coords = (location) => location ? `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}` : 'No GPS location'
const avatar = (name) => (name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

function FitDrivers({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [24, 24], maxZoom: 8 })
    else if (points.length === 1) map.setView(points[0], 8)
  }, [map, points])
  return null
}

export default function DriverManagementDashboard({ currentUser }) {
  const [payload, setPayload] = useState({ drivers: [], summary: {}, regions: [] })
  const [vehicles, setVehicles] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [regionFilter, setRegionFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [edit, setEdit] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ full_name: '', email: '', password: '', license_number: '', license_expiry: '' })
  const canManage = managers.includes(currentUser?.role)
  const canAdmin = currentUser?.role === 'administrator'
  const isDriver = currentUser?.role === 'driver'
  const drivers = payload.drivers
  const socketVehicleKey = [...new Set(drivers.map((driver) => driver.vehicle?.id).filter(Boolean))].join(',')

  const load = useCallback(async () => {
    try {
      const [dashboard, vehicleResponse] = await Promise.all([
        api.get('/dashboard/drivers'),
        isDriver ? Promise.resolve({ data: [] }) : api.get('/vehicles'),
      ])
      setPayload(dashboard.data)
      setVehicles(vehicleResponse.data)
      setError('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load the driver management dashboard.')
    } finally { setLoading(false) }
  }, [isDriver])
  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0)
    const id = window.setInterval(() => void load(), 30000)
    return () => { window.clearTimeout(initialLoad); window.clearInterval(id) }
  }, [load])

  useEffect(() => {
    if (selectedId) return undefined
    const token = localStorage.getItem('fleetflow_token')
    if (!token) return undefined
    const sockets = []
    socketVehicleKey.split(',').filter(Boolean).map(Number).forEach((vehicleId) => {
      const url = new URL(`/gps/ws/vehicles/${vehicleId}`, api.defaults.baseURL)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(url)
      sockets.push(socket)
      socket.onopen = () => socket.send(JSON.stringify({ token }))
      socket.onmessage = (event) => {
        let message
        try { message = JSON.parse(event.data) } catch { return }
        if (message.type !== 'location' || Number(message.location?.vehicle_id) !== Number(vehicleId)) return
        setPayload((current) => ({ ...current, drivers: current.drivers.map((driver) => driver.vehicle?.id === Number(vehicleId)
          ? { ...driver, location: { ...message.location, speed_kph: message.location.speed_kph } } : driver) }))
      }
    })
    return () => sockets.forEach((socket) => socket.close())
  }, [socketVehicleKey, selectedId])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return drivers.filter((driver) => {
      const haystack = [driver.full_name, driver.vehicle?.registration_number, driver.current_trip?.id,
        driver.current_trip?.origin, driver.current_trip?.destination, driver.current_shipment?.tracking_number,
        ...driver.shipments.map((shipment) => shipment.tracking_number)].filter(Boolean).join(' ').toLowerCase()
      return (!term || haystack.includes(term)) && (statusFilter === 'all' || driver.status === statusFilter) &&
        (regionFilter === 'all' || driver.region === regionFilter)
    })
  }, [drivers, query, statusFilter, regionFilter])
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const mapDrivers = useMemo(() => drivers.filter((driver) => driver.location && driver.vehicle), [drivers])
  const mapPoints = useMemo(() => mapDrivers.map((driver) => [Number(driver.location.latitude), Number(driver.location.longitude)]), [mapDrivers])
  const selected = drivers.find((driver) => driver.id === selectedId)
  const summary = payload.summary || {}
  const canStreamSelectedVehicle = selected?.vehicle && (!isDriver || (
    selected.user_id === currentUser?.id && (
      selected.vehicle.assigned_driver_id === selected.id || selected.current_trip || selected.current_shipment
    )
  ))

  const runAction = async (action, success) => {
    setError(''); setNotice('')
    try { await action(); setNotice(success); await load() }
    catch (err) { setError(err.response?.data?.detail || 'Action could not be completed.') }
  }
  const saveProfile = async (event) => {
    event.preventDefault()
    await runAction(() => api.patch(`/drivers/${edit.id}`, {
      full_name: edit.full_name, email: edit.email, license_number: edit.license_number,
      license_expiry: edit.license_expiry || null,
    }), 'Driver profile saved.')
    setEdit(null)
  }
  const createDriver = async (event) => {
    event.preventDefault()
    await runAction(() => api.post('/drivers', {
      ...createForm, license_expiry: createForm.license_expiry || null,
    }), 'Driver created.')
    setShowCreate(false)
    setCreateForm({ full_name: '', email: '', password: '', license_number: '', license_expiry: '' })
  }
  const assignVehicle = async (driver, value) => runAction(
    () => api.put(`/drivers/${driver.id}/vehicle`, { vehicle_id: value ? Number(value) : null }),
    'Vehicle assignment updated.',
  )
  const toggleAccount = async (driver) => runAction(
    () => api.patch(`/drivers/${driver.id}/account`, { is_active: !driver.is_active }),
    `Driver account ${driver.is_active ? 'deactivated' : 'activated'}.`,
  )

  if (!roles.includes(currentUser?.role)) return <p role="alert" className="driver-management rounded-xl border border-rose-300 bg-white p-5 text-rose-700">You do not have permission to view fleet driver management.</p>

  if (selected) return <main className="driver-management space-y-5 rounded-2xl bg-slate-100 p-4 text-slate-800 sm:p-6">
    <button type="button" onClick={() => { setSelectedId(null); setEdit(null) }} className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-blue-700"><ArrowLeft size={17}/>Drivers</button>
    <section className="flex flex-wrap items-center gap-5 rounded-2xl bg-white p-5 shadow-sm">
      <div className="grid h-20 w-20 place-items-center rounded-full bg-blue-100 text-xl font-bold text-blue-700" aria-label="No driver photo on record">{avatar(selected.full_name)}</div>
      <div className="min-w-48 flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Driver ID #{selected.id}</p><h1 className="text-2xl font-bold">{selected.full_name}</h1><p className="text-sm text-slate-500">Photo and phone number are not recorded.</p></div>
      <div className="flex flex-wrap gap-2">{!isDriver && selected.email && <a className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-blue-700" href={`mailto:${selected.email}`}><Mail className="mr-2 inline" size={15}/>Email driver</a>}{canManage && <button onClick={() => setEdit({ id: selected.id, full_name: selected.full_name, email: selected.email, license_number: selected.license_number, license_expiry: selected.license_expiry?.slice(0, 16) || '' })} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Edit profile</button>}{canAdmin && <button onClick={() => void toggleAccount(selected)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">{selected.is_active ? 'Deactivate account' : 'Activate account'}</button>}</div>
    </section>
    {edit && <form onSubmit={saveProfile} className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-2"><label className="text-sm">Name<input required value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} className="mt-1 w-full rounded border p-2"/></label><label className="text-sm">Email<input required type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} className="mt-1 w-full rounded border p-2"/></label><label className="text-sm">License number<input required value={edit.license_number} onChange={(e) => setEdit({ ...edit, license_number: e.target.value })} className="mt-1 w-full rounded border p-2"/></label><label className="text-sm">License expiry<input type="datetime-local" value={edit.license_expiry} onChange={(e) => setEdit({ ...edit, license_expiry: e.target.value })} className="mt-1 w-full rounded border p-2"/></label><div className="flex gap-2"><button className="rounded bg-blue-600 px-4 py-2 text-white">Save</button><button type="button" onClick={() => setEdit(null)} className="rounded border px-4 py-2">Cancel</button></div></form>}
    <div className="grid gap-4 lg:grid-cols-3">
      <ProfileCard title="Personal details"><Info label="Name" value={selected.full_name}/>{!isDriver && <><Info label="Email" value={selected.email}/><Info label="Phone" value={selected.phone}/><Info label="Account" value={selected.is_active ? 'Active' : 'Inactive'}/></>}<Info label="Photo" value="Not recorded"/></ProfileCard>
      {!isDriver && <ProfileCard title="License & documents"><Info label="License number" value={selected.license_number}/><Info label="Expiry" value={dateTime(selected.license_expiry)}/><Info label="Verification" value={selected.license_verification || 'Not recorded'}/><Info label="Documents" value="No document records"/></ProfileCard>}
      <ProfileCard title="Assigned vehicle"><Info label="Registration" value={selected.vehicle?.registration_number}/><Info label="Vehicle ID" value={selected.vehicle?.vehicle_id}/><Info label="Type / fuel" value={selected.vehicle ? `${selected.vehicle.vehicle_type} / ${selected.vehicle.fuel_type}` : null}/><Info label="Capacity" value={selected.vehicle ? `${selected.vehicle.capacity} kg` : null}/>{canManage && <label className="mt-3 block text-sm font-medium">Assign vehicle<select value={selected.vehicle?.id || ''} onChange={(e) => void assignVehicle(selected, e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2"><option value="">No vehicle</option>{vehicles.filter((v) => v.status !== 'maintenance').map((v) => <option key={v.id} value={v.id}>{v.registration_number} · {v.status}</option>)}</select></label>}</ProfileCard>
      <ProfileCard title="Current trip"><Info label="Trip" value={selected.current_trip ? `Trip ${selected.current_trip.id}` : selected.current_shipment?.tracking_number}/><Info label="Route" value={selected.current_trip ? `${selected.current_trip.origin} → ${selected.current_trip.destination}` : selected.current_shipment ? `${selected.current_shipment.origin} → ${selected.current_shipment.destination}` : null}/><Info label="Status" value={statusNames[selected.status]}/><Info label="Next stop" value={selected.next_stop}/><Info label="ETA" value={dateTime(selected.current_trip?.estimated_arrival || selected.current_shipment?.estimated_arrival)}/></ProfileCard>
      <ProfileCard title="Driver status & performance"><Info label="Status" value={statusNames[selected.status]}/><Info label="Attendance" value={selected.attendance_status}/>{!isDriver && <><Info label="Completed trips" value={selected.performance.completed_trips}/><Info label="Successful deliveries" value={selected.performance.successful_deliveries}/><Info label="Delayed deliveries" value={selected.performance.delayed_deliveries}/><Info label="On-time delivery rate" value={selected.performance.on_time_delivery_rate == null ? 'Insufficient recorded ETA/arrival data' : `${selected.performance.on_time_delivery_rate}%`}/></>}</ProfileCard>
      <ProfileCard title="Trip history & assigned shipments"><div className="space-y-2">{selected.trips.map((trip) => <p key={trip.id} className="rounded-lg bg-slate-50 p-2 text-sm"><strong>Trip {trip.id}</strong> · {trip.origin} → {trip.destination}<span className="block text-xs capitalize text-slate-500">{trip.status} · ETA {dateTime(trip.estimated_arrival)}</span></p>)}{selected.shipments.map((shipment) => <p key={`s-${shipment.id}`} className="rounded-lg bg-slate-50 p-2 text-sm"><strong>{shipment.tracking_number}</strong> · {shipment.origin} → {shipment.destination}<span className="block text-xs capitalize text-slate-500">{shipment.status}</span></p>)}{!selected.trips.length && !selected.shipments.length && <p className="text-sm text-slate-500">No trip or shipment history.</p>}</div></ProfileCard>
    </div>
    <section className="rounded-2xl bg-white p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-bold">Current GPS & route</h2><p className="mt-1 text-sm text-slate-600">Status: <strong>{gpsConnectionStatus(selected.location)}</strong></p><p className="mt-1 text-sm text-slate-500">Source: {gpsSourceLabel(selected.location)} · {coords(selected.location)}</p><p className="mt-1 text-sm text-slate-500">Speed: {selected.location?.speed_kph == null ? 'Not reported' : `${selected.location.speed_kph} km/h`} · Heading: {selected.location?.heading_degrees == null ? 'Not reported' : `${selected.location.heading_degrees}°`}</p></div><span className="text-xs text-slate-500">Last updated {dateTime(selected.location?.recorded_at)}</span></div>{canStreamSelectedVehicle ? <Suspense fallback={<p className="p-5 text-sm text-slate-500">Loading live GPS map…</p>}><GPSMap vehicleId={selected.vehicle.id}/></Suspense> : selected.location ? <DriverLocationMap location={selected.location} driverName={selected.full_name}/> : <p className="rounded bg-slate-50 p-5 text-sm text-slate-500">{selected.vehicle ? 'Never connected. No GPS location has been received for this vehicle.' : 'No assigned vehicle. No GPS route is available.'}</p>}</section>
  </main>

  return <main className="driver-management space-y-5 rounded-2xl bg-slate-100 p-3 text-slate-800 sm:p-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Fleet operations</p><h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Driver Management</h1><p className="mt-1 text-sm text-slate-600">Centralized roster and live assigned-vehicle locations.</p></div><div className="flex gap-2">{canManage && <button onClick={() => setShowCreate((value) => !value)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">{showCreate ? 'Close form' : 'Add driver'}</button>}<button onClick={() => void load()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">Refresh</button></div></header>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {showCreate && canManage && <form onSubmit={createDriver} className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm">Name<input required minLength={2} value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} className="mt-1 w-full rounded border p-2"/></label><label className="text-sm">Email<input required type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className="mt-1 w-full rounded border p-2"/></label><label className="text-sm">Initial password<input required minLength={8} type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} className="mt-1 w-full rounded border p-2"/></label><label className="text-sm">License number<input required value={createForm.license_number} onChange={(e) => setCreateForm({ ...createForm, license_number: e.target.value })} className="mt-1 w-full rounded border p-2"/></label><label className="text-sm">License expiry<input type="datetime-local" value={createForm.license_expiry} onChange={(e) => setCreateForm({ ...createForm, license_expiry: e.target.value })} className="mt-1 w-full rounded border p-2"/></label><div className="flex items-end"><button className="rounded bg-blue-600 px-4 py-2 font-semibold text-white">Create driver</button></div></form>}
    <section className="grid gap-3 grid-cols-2 xl:grid-cols-5">{[['Total Drivers', summary.total ?? drivers.length, Users], ['On Route', summary.on_route ?? 0, Truck], ['At Stop', summary.at_stop ?? 0, MapPin], ['Delayed', summary.delayed ?? 0, Clock3], ['Off Duty', summary.off_duty ?? 0, Activity]].map(([label, value, Icon]) => <article key={label} className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon size={19}/></span><div><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p></div></article>)}</section>
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(250px,.8fr)]">
      <div className="overflow-hidden rounded-xl bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2 p-4"><div><h2 className="font-bold">Live Driver Tracking (All Drivers)</h2><p className="text-xs text-slate-500">Markers require a recorded location for an assigned vehicle.</p></div><span className="text-xs text-slate-500">{mapDrivers.length} located / {drivers.length} drivers</span></div><div className="h-[340px] sm:h-[430px]"><MapContainer center={mapPoints[0] || [20.5937, 78.9629]} zoom={5} scrollWheelZoom className="h-full w-full"><FitDrivers points={mapPoints}/><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{mapDrivers.map((driver) => <Marker key={driver.id} position={[Number(driver.location.latitude), Number(driver.location.longitude)]} icon={iconFor(driver.status)}><Popup><strong>{driver.full_name}</strong><br/>{driver.vehicle.registration_number}<br/>{coords(driver.location)}<br/>Speed: {driver.location.speed_kph == null ? 'Not reported' : `${driver.location.speed_kph} km/h`}<br/>GPS: {gpsConnectionStatus(driver.location)}<br/>Source: {gpsSourceLabel(driver.location)}<br/>Status: {statusNames[driver.status]}<br/>Updated: {dateTime(driver.location.recorded_at)}</Popup></Marker>)}</MapContainer></div><p className="p-3 text-xs text-amber-700"></p></div>
      <section className="rounded-xl bg-white p-4 shadow-sm"><h2 className="font-bold">Driver Status Overview</h2><div className="mt-4 space-y-4">{[['On Route', summary.on_route], ['At Stop', summary.at_stop], ['Delayed', summary.delayed], ['Off Duty', summary.off_duty], ['Available', drivers.filter((d) => d.status === 'available').length], ['Unconfirmed', drivers.filter((d) => d.status === 'unknown').length]].map(([label, value]) => <div key={label}><div className="mb-1 flex justify-between text-sm"><span>{label}</span><strong>{value ?? 0}</strong></div><div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full rounded" style={{ width: `${drivers.length ? (value || 0) / drivers.length * 100 : 0}%`, backgroundColor: statusColors[label.toLowerCase().replaceAll(' ', '_')] || statusColors.available }}/></div></div>)}</div><p className="mt-4 border-t pt-3 text-xs leading-5 text-slate-500">On Route: in-progress trip or in-transit shipment. Delayed: active delayed shipment. Off Duty: account inactive or attendance absent/leave. Available: present with no active or delayed work. Unconfirmed: no explicit attendance or operational status. At Stop requires stop-arrival data, which is not stored by this project; coordinates are never used to infer it.</p></section>
    </section>
    <section className="overflow-hidden rounded-xl bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="font-bold">All Drivers <span className="text-sm font-normal text-slate-500">({filtered.length})</span></h2><p className="text-xs text-slate-500">Data is refreshed every 30 seconds; vehicle locations also stream over the existing GPS WebSockets.</p></div><div className="flex flex-wrap gap-2"><label className="relative"><Search className="absolute left-2 top-2.5 text-slate-400" size={16}/><input aria-label="Search by driver, vehicle or trip" placeholder="Driver, vehicle or trip" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} className="w-52 rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm"/></label><select aria-label="Filter by driver status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className="rounded-lg border border-slate-200 px-2 text-sm"><option value="all">All statuses</option>{Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Filter by region" value={regionFilter} onChange={(e) => { setRegionFilter(e.target.value); setPage(1) }} disabled={!payload.regions?.length} className="rounded-lg border border-slate-200 px-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"><option value="all">{payload.regions?.length ? 'All regions' : 'Region data unavailable'}</option>{(payload.regions || []).map((region) => <option key={region} value={region}>{region}</option>)}</select></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Driver', 'Driver ID', 'Vehicle', 'Current Trip', 'Current Location', 'Speed', 'Status', 'Next Stop', 'ETA', 'Actions'].map((label) => <th className="px-3 py-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{visible.map((driver) => <tr key={driver.id} className="hover:bg-blue-50/40"><td className="px-3 py-3"><span className="mr-2 inline-grid h-8 w-8 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{avatar(driver.full_name)}</span>{driver.full_name}</td><td className="px-3 py-3">#{driver.id}</td><td className="px-3 py-3">{driver.vehicle?.registration_number || 'Unassigned'}</td><td className="px-3 py-3">{driver.current_trip ? `Trip ${driver.current_trip.id}` : driver.current_shipment?.tracking_number || '—'}</td><td className="px-3 py-3">{coords(driver.location)}{driver.location && <span className="block text-[11px] text-slate-500">{dateTime(driver.location.recorded_at)}</span>}</td><td className="px-3 py-3">{driver.location?.speed_kph == null ? '—' : `${driver.location.speed_kph} km/h`}</td><td className="px-3 py-3"><span className="rounded-full px-2 py-1 text-xs font-semibold" style={{ color: statusColors[driver.status], backgroundColor: `${statusColors[driver.status]}18` }}>{statusNames[driver.status]}</span></td><td className="px-3 py-3">{driver.next_stop || 'Not available'}</td><td className="px-3 py-3">{dateTime(driver.current_trip?.estimated_arrival || driver.current_shipment?.estimated_arrival)}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><button aria-label={`View ${driver.full_name}`} title="View profile" onClick={() => setSelectedId(driver.id)} className="rounded border border-slate-200 p-2 text-blue-700"><Eye size={15}/></button>{!isDriver && driver.email && <a aria-label={`Email ${driver.full_name}`} title="Email driver" href={`mailto:${driver.email}`} className="rounded border border-slate-200 p-2 text-blue-700"><Mail size={15}/></a>}</div></td></tr>)}{!visible.length && <tr><td colSpan="10" className="p-8 text-center text-slate-500">{loading ? 'Loading drivers…' : error ? 'Driver data is unavailable.' : 'No drivers match these filters.'}</td></tr>}</tbody></table></div>
      <div className="flex items-center justify-between border-t p-3 text-sm"><span>Page {page} of {pageCount}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button><button disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button></div></div>
    </section>
    <p className="text-xs text-slate-500">No driver photo, phone, region, stop event, or license-document verification fields exist in the current database. Such values are shown as unavailable rather than generated.</p>
  </main>
}

function ProfileCard({ title, children }) { return <section className="rounded-xl bg-white p-4 shadow-sm"><h2 className="mb-3 border-b pb-2 font-bold">{title}</h2>{children}</section> }
function Info({ label, value }) { return <p className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm"><span className="text-slate-500">{label}</span><strong className="text-right font-medium">{value ?? 'Not recorded'}</strong></p> }

function DriverLocationMap({ location, driverName }) {
  const point = [Number(location.latitude), Number(location.longitude)]
  return <div className="h-[320px] overflow-hidden rounded-xl border border-slate-200"><MapContainer center={point} zoom={13} scrollWheelZoom className="h-full w-full"><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Marker position={point}><Popup><strong>{driverName}</strong><br/>{coords(location)}<br/>Speed: {location.speed_kph == null ? 'Not reported' : `${location.speed_kph} km/h`}<br/>Source: {gpsSourceLabel(location)}<br/>{dateTime(location.recorded_at)}</Popup></Marker></MapContainer></div>
}
