import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, ArrowUpRight, Bell, CalendarDays, CheckCircle2, ChevronRight, Clock3, MapPin, Package, RefreshCw, Route, Truck, Wrench } from 'lucide-react'
import api from './api'
import './driver-dashboard.css'

const activeStates = ['pending', 'assigned', 'in_transit', 'delayed']
const formatDate = (value, options) => value ? new Date(value).toLocaleString([], options || { dateStyle: 'medium', timeStyle: 'short' }) : 'Not scheduled'
const actions = { assigned: [['Start delivery', 'in_transit']], in_transit: [['Report delay', 'delayed'], ['Complete delivery', 'delivered']], delayed: [['Resume delivery', 'in_transit'], ['Complete delivery', 'delivered']] }

export default function DriverDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [routeLoading, setRouteLoading] = useState(null)
  const [routes, setRoutes] = useState({})
  const [status, setStatus] = useState('active')
  const [priority, setPriority] = useState('all')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData((await api.get('/dashboard/driver')).data) }
    catch (err) { setError(err.response?.data?.detail || 'Could not load your driver dashboard.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0)
    const refresh = () => void load()
    window.addEventListener('fleetflow:refresh-role-dashboard', refresh)
    return () => { window.clearTimeout(id); window.removeEventListener('fleetflow:refresh-role-dashboard', refresh) }
  }, [load])

  const shipments = data?.shipments || []
  const alerts = data?.alerts || []
  const completed = shipments.filter(s => s.status === 'delivered')
  const active = shipments.filter(s => activeStates.includes(s.status))
  const today = new Date().toDateString()
  const todays = active.filter(s => !s.scheduled_departure || new Date(s.scheduled_departure).toDateString() === today)
  const completion = shipments.length ? Math.round(completed.length / shipments.length * 100) : null
  const visible = shipments.filter(s => {
    const urgent = alerts.some(a => a.entity_id === s.id && a.severity === 'critical')
    const matchesStatus = status === 'active' ? activeStates.includes(s.status) : status === 'all' || s.status === status
    const matchesPriority = priority === 'all' || (priority === 'urgent' ? urgent : !urgent)
    return matchesStatus && matchesPriority
  })
  const current = shipments.find(s => ['in_transit', 'delayed'].includes(s.status)) || shipments.find(s => s.status === 'assigned')

  const update = async (shipment, next) => {
    const verb = next === 'delivered' ? 'complete this delivery' : next === 'delayed' ? 'report this delivery as delayed' : next === 'in_transit' && shipment.status === 'assigned' ? 'start this delivery' : 'resume this delivery'
    if (!window.confirm(`Are you sure you want to ${verb}?`)) return
    setUpdating(shipment.id); setError(''); setNotice('')
    try { await api.patch(`/dashboard/driver/shipments/${shipment.id}`, { status: next }); setNotice(`${shipment.tracking_number} updated successfully.`); await load() }
    catch (err) { setError(err.response?.data?.detail || 'Could not update shipment status.') }
    finally { setUpdating(null) }
  }
  const loadRoute = async shipment => {
    setRouteLoading(shipment.id); setError('')
    try { const response = await api.get(`/routes/shipments/${shipment.id}`); setRoutes(value => ({ ...value, [shipment.id]: response.data })) }
    catch (err) { setError(err.response?.data?.detail || 'Route estimate is currently unavailable.') }
    finally { setRouteLoading(null) }
  }

  if (loading && !data) return <div className="driver-loading" role="status"><span/> Loading your workspace…</div>
  return <div className="driver-dashboard">
    <header className="driver-header"><div className="driver-brand"><div className="driver-brand-mark"><Truck size={20}/></div><div><span>FLEETFLOW</span><small>DRIVER WORKSPACE</small></div></div><div className="driver-header-right"><span className="driver-date"><CalendarDays size={15}/>{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span><button className="driver-icon-button" aria-label="Refresh dashboard" onClick={load}><RefreshCw size={17}/></button><div className="driver-avatar" title={data?.driver.full_name}>{(data?.driver.full_name || 'D').split(' ').map(x => x[0]).slice(0, 2).join('')}</div></div></header>
    <main className="driver-main">
      <div className="driver-welcome"><div><p className="driver-eyebrow">YOUR SHIFT AT A GLANCE</p><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {data?.driver.full_name?.split(' ')[0] || 'Driver'}</h1><p>Stay focused on the road. Here’s what’s on your schedule.</p></div><div className="driver-status"><span className="status-dot"/>{data?.driver.attendance_status || 'Status unknown'}<span className="driver-status-sep">·</span>{active.length} active {active.length === 1 ? 'delivery' : 'deliveries'}</div></div>
      {error && <div role="alert" className="driver-alert driver-alert-error"><AlertTriangle size={18}/><span>{error}</span><button onClick={load}>Retry</button></div>}{notice && <div role="status" className="driver-alert driver-alert-success"><CheckCircle2 size={18}/>{notice}</div>}{loading && data && <p role="status" className="driver-refreshing">Updating your latest information…</p>}
      <section className="driver-metrics" aria-label="Today's overview"><article className="driver-metric-card"><div className="metric-icon metric-green"><Package size={18}/></div><div><span>Today’s assignments</span><strong>{todays.length}</strong><small>{todays.filter(s => s.status === 'assigned').length} ready to start</small></div><ArrowUpRight className="metric-trend" size={17}/></article><article className="driver-metric-card"><div className="metric-icon metric-blue"><CheckCircle2 size={18}/></div><div><span>Completed deliveries</span><strong>{completed.length}</strong><small>All recorded shipments</small></div><ArrowUpRight className="metric-trend" size={17}/></article><article className="driver-metric-card"><div className="metric-icon metric-amber"><Clock3 size={18}/></div><div><span>Delivery completion</span><strong>{completion === null ? '—' : `${completion}%`}</strong><small>{completion === null ? 'Not enough data yet' : `${completed.length} of ${shipments.length} assignments`}</small></div><Activity className="metric-trend" size={17}/></article><article className="driver-metric-card"><div className="metric-icon metric-violet"><Bell size={18}/></div><div><span>Needs attention</span><strong>{alerts.length}</strong><small>{alerts.length ? 'Current operational alerts' : 'You’re all caught up'}</small></div><ArrowUpRight className="metric-trend" size={17}/></article></section>
      <div className="driver-content-grid"><div className="driver-primary-column">
        {current ? <section className="driver-panel driver-trip-card"><div className="driver-section-heading"><div><p className="driver-eyebrow">FOCUS NOW</p><h2>Current delivery</h2></div><span className={`driver-badge ${current.status === 'delayed' ? 'badge-amber' : current.status === 'in_transit' ? 'badge-green' : 'badge-blue'}`}>{current.status.replaceAll('_', ' ')}</span></div><div className="trip-reference">{current.tracking_number}<span>·</span>{current.cargo_description}</div><div className="trip-route"><div className="trip-route-point"><span className="route-dot route-start"/><div><small>PICKUP</small><strong>{current.origin}</strong><span>{formatDate(current.scheduled_departure)}</span></div></div><div className="trip-route-line"><span/></div><div className="trip-route-point"><span className="route-dot route-end"/><div><small>DESTINATION</small><strong>{current.destination}</strong><span>ETA {formatDate(current.estimated_arrival)}</span></div></div></div><div className="driver-trip-footer"><div className="driver-trip-meta"><Route size={16}/>{routes[current.id] ? `${routes[current.id].distance_km} km · ${routes[current.id].duration_minutes} min estimate` : 'Road route estimate'}<button disabled={routeLoading === current.id} onClick={() => loadRoute(current)}>{routeLoading === current.id ? 'Loading…' : 'View route'}</button></div><div className="driver-actions">{(actions[current.status] || []).map(([label, next]) => <button key={next} className={next === 'delivered' ? 'driver-button driver-button-outline' : 'driver-button'} disabled={updating === current.id} onClick={() => update(current, next)}>{updating === current.id ? 'Updating…' : label}<ChevronRight size={15}/></button>)}</div></div></section> : <section className="driver-panel driver-empty-focus"><div className="empty-icon"><CheckCircle2 size={24}/></div><div><h2>No active delivery</h2><p>When a shipment is in progress, your route and next steps will appear here.</p></div></section>}
        <section className="driver-panel"><div className="driver-section-heading assignment-heading"><div><p className="driver-eyebrow">YOUR ROUTE PLAN</p><h2>Assignments <span className="heading-count">{visible.length}</span></h2></div><div className="driver-filters"><select aria-label="Filter assignments by status" value={status} onChange={e => setStatus(e.target.value)}><option value="active">Active</option><option value="all">All statuses</option>{[...new Set(shipments.map(s => s.status))].filter(s => !activeStates.includes(s)).map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select><select aria-label="Filter assignments by priority" value={priority} onChange={e => setPriority(e.target.value)}><option value="all">All priority</option><option value="urgent">Urgent</option><option value="standard">Standard</option></select></div></div><div className="driver-assignment-list">{visible.map(s => <article key={s.id} className="driver-assignment"><div className="assignment-top"><div className="assignment-title"><Package size={17}/><strong>{s.tracking_number}</strong><span className={`driver-badge ${s.status === 'delayed' ? 'badge-amber' : s.status === 'delivered' ? 'badge-muted' : s.status === 'in_transit' ? 'badge-green' : 'badge-blue'}`}>{s.status.replaceAll('_', ' ')}</span></div><span className="assignment-weight">{s.weight} kg</span></div><div className="assignment-route"><span>{s.origin}</span><span className="route-dash"/><MapPin size={14}/><span>{s.destination}</span></div><div className="assignment-bottom"><span><CalendarDays size={14}/> Pickup {formatDate(s.scheduled_departure, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span><Clock3 size={14}/> ETA {formatDate(s.estimated_arrival, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><div className="assignment-buttons">{(actions[s.status] || []).slice(0, 1).map(([label, next]) => <button key={next} disabled={updating === s.id} onClick={() => update(s, next)}>{label}</button>)}</div></div></article>)}{!visible.length && <div className="driver-empty-list"><Package size={22}/><strong>{shipments.length ? 'No assignments match these filters' : 'No shipments assigned'}</strong><span>{shipments.length ? 'Try another status or priority filter.' : 'Your dispatcher will add work here when it is ready.'}</span></div>}</div></section>
      </div><aside className="driver-side-column">
        <section className="driver-panel"><div className="driver-section-heading"><div><p className="driver-eyebrow">YOUR VEHICLE</p><h2>Vehicle details</h2></div><Truck className="side-heading-icon" size={20}/></div>{data?.vehicle ? <><div className="vehicle-card"><div className="vehicle-illustration"><Truck size={27}/></div><div><strong>{data.vehicle.registration_number}</strong><span>{data.vehicle.vehicle_type} · {data.vehicle.status}</span></div></div><div className="vehicle-info-grid"><div><small>Vehicle ID</small><strong>{data.vehicle.vehicle_id}</strong></div><div><small>Capacity</small><strong>{data.vehicle.capacity} kg</strong></div><div><small>License</small><strong>{data.driver.license_number || 'Not recorded'}</strong></div><div><small>Attendance</small><strong className="capitalize">{data.driver.attendance_status || 'Unknown'}</strong></div></div></> : <div className="driver-empty-inline"><Truck size={19}/> No vehicle is currently assigned.</div>}</section>
        <section className="driver-panel"><div className="driver-section-heading"><div><p className="driver-eyebrow">FLEET HEALTH</p><h2>Vehicle checks</h2></div><Wrench className="side-heading-icon" size={19}/></div><div className="vehicle-check-list">{(data?.inspections || []).slice(0, 2).map((x, i) => <div className="vehicle-check" key={`i-${i}`}><span className={x.result === 'passed' ? 'check-status check-ok' : 'check-status check-warn'}>{x.result === 'passed' ? <CheckCircle2 size={15}/> : <AlertTriangle size={15}/>}</span><div><strong>{x.category.replaceAll('_', ' ')}</strong><span>{x.result} · {formatDate(x.inspected_at, { month: 'short', day: 'numeric' })}</span></div></div>)}{(data?.maintenance || []).slice(0, 2).map((x, i) => <div className="vehicle-check" key={`m-${i}`}><span className={x.status === 'completed' ? 'check-status check-ok' : 'check-status check-warn'}><Wrench size={14}/></span><div><strong>{x.service_type}</strong><span>{x.description} · due {formatDate(x.next_due_date, { month: 'short', day: 'numeric' })}</span></div></div>)}{!data?.inspections?.length && !data?.maintenance?.length && <p className="driver-empty-inline">No inspection or maintenance history is available yet.</p>}</div></section>
        <section className="driver-panel"><div className="driver-section-heading"><div><p className="driver-eyebrow">RECENT ACTIVITY</p><h2>Updates</h2></div><Bell className="side-heading-icon" size={18}/></div>{alerts.length ? alerts.slice(0, 3).map(a => <div className="driver-alert-item" key={a.id}><span className="alert-indicator"/><div><strong>{a.title}</strong><p>{a.detail}</p></div></div>) : data?.history?.length ? data.history.slice(0, 3).map((h, i) => <div className="driver-alert-item" key={`${h.shipment_id}-${i}`}><span className="activity-indicator"><CheckCircle2 size={14}/></span><div><strong>{shipments.find(s => s.id === h.shipment_id)?.tracking_number || 'Delivery'} · {h.status.replaceAll('_', ' ')}</strong><p>{formatDate(h.changed_at)}</p></div></div>) : <p className="driver-empty-inline">No new updates. You’re all caught up.</p>}</section>
        <section className="driver-panel location-card"><div className="driver-section-heading"><div><p className="driver-eyebrow">LOCATION</p><h2>Last vehicle update</h2></div><MapPin className="side-heading-icon" size={19}/></div>{data?.location ? <><strong className="location-coords">{Number(data.location.latitude).toFixed(5)}, {Number(data.location.longitude).toFixed(5)}</strong><span className="location-time">Updated {formatDate(data.location.recorded_at)}</span><span className={`location-source ${data.location.source === 'simulated' ? 'source-simulated' : 'source-recorded'}`}>{data.location.source === 'simulated' ? 'Simulated GPS' : 'Recorded vehicle location'}</span></> : <p className="driver-empty-inline">No GPS location has been recorded.</p>}<p className="location-note">Location reflects the latest stored vehicle telemetry. Simulated readings are identified clearly.</p></section>
      </aside></div><footer className="driver-footer">{data?.driver.email}<span>·</span>Attendance updates are managed by your dispatcher.</footer>
    </main>
  </div>
}
