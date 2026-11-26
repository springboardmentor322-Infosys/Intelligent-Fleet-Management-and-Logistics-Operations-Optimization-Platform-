import React, { useState } from 'react';
import Tilt3DCard from './Tilt3DCard';
import DriverProfilePage from './DriverProfilePage';
import {
  LiveTrackingConsole,
  RoutePlannerPage,
  ShipmentManagementPage
} from './Milestone2Modules';
import { apiRequest, initials } from '../api';

function PageHeading({ kicker, title, desc, action = null }) {
  return (
    <div className="workspace-heading">
      <div>
        <span>{kicker}</span>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      {action}
    </div>
  );
}

export default function WorkspaceSubpages({
  page,
  state,
  activeUser,
  token,
  wsConnected,
  wsLog,
  selectedDriverId,
  onSelectDriver,
  onOpenForm,
  onCycleVehicleStatus,
  onDeleteVehicle,
  onExportCsv,
  onRefresh,
  onSettingsUpdated,
  onToast
}) {
  const [vehicleFilter, setVehicleFilter] = useState('All');
  const [selectedTripId, setSelectedTripId] = useState(null);

  const role = activeUser?.role;
  const manager = ['admin', 'fleet_manager'].includes(role);
  const dispatcher = ['admin', 'fleet_manager', 'dispatcher'].includes(role);
  const tripUpdater = ['admin', 'fleet_manager', 'dispatcher', 'driver'].includes(role);

  if (page === 'tracking') {
    return (
      <LiveTrackingConsole
        state={state}
        wsConnected={wsConnected}
        wsLog={wsLog}
        token={token}
        onRefresh={onRefresh}
        onToast={onToast}
      />
    );
  }

  if (page === 'routes') {
    return (
      <RoutePlannerPage
        state={state}
        token={token}
        onRefresh={onRefresh}
        onToast={onToast}
      />
    );
  }

  if (page === 'shipments') {
    return (
      <ShipmentManagementPage
        state={state}
        activeUser={activeUser}
        token={token}
        onRefresh={onRefresh}
        onToast={onToast}
      />
    );
  }

  if (page === 'driver-profile') {
    const driverObj =
      state.drivers.find((d) => d.id === selectedDriverId) || state.drivers[0] || null;
    return (
      <DriverProfilePage
        driver={driverObj}
        vehicles={state.vehicles}
        trips={state.trips}
        shipments={state.shipments || []}
        activeUser={activeUser}
        token={token}
        onBack={() => onSelectDriver(null)}
        onRefresh={onRefresh}
        onToast={onToast}
      />
    );
  }

  if (page === 'vehicles') {
    const filtered = state.vehicles.filter(
      (v) => vehicleFilter === 'All' || v.status === vehicleFilter
    );
    return (
      <>
        <header className="vehicle-page-intro">
          <div className="vehicle-page-copy">
            <span className="workspace-eyebrow">FLEET ASSETS / REGISTER</span>
            <h1>Vehicles</h1>
            <p>Every asset, GPS tracker ID, assignment and service date in one place.</p>
            <div className="vehicle-intro-meta">
              <span>
                <i className="live-dot" /> GPS Telematics synced
              </span>
              <span>{state.vehicles.length} registered assets</span>
            </div>
          </div>
          <div className="vehicle-page-render">
            <span className="vehicle-page-model fleet-transition-truck">
              <i className="truck-cargo" />
              <i className="truck-cab">
                <b />
              </i>
              <i className="truck-wheel wheel-a" />
              <i className="truck-wheel wheel-b" />
            </span>
          </div>
          {manager && (
            <button
              className="button button-primary vehicle-add-button"
              type="button"
              onClick={() => onOpenForm('vehicle')}
            >
              ＋ Add vehicle
            </button>
          )}
        </header>

        <div className="workspace-stats">
          <Tilt3DCard as="article">
            <span>Total vehicles</span>
            <b>{state.summary.fleet ?? 0}</b>
          </Tilt3DCard>
          <Tilt3DCard as="article">
            <span>On route</span>
            <b>{state.summary.active ?? 0}</b>
          </Tilt3DCard>
          <Tilt3DCard as="article">
            <span>Available</span>
            <b>{state.summary.available ?? 0}</b>
          </Tilt3DCard>
          <Tilt3DCard as="article">
            <span>In maintenance</span>
            <b>{state.summary.maintenanceDue ?? 0}</b>
          </Tilt3DCard>
        </div>

        <section className="panel workspace-table">
          <div className="panel-heading">
            <div>
              <h2>Fleet register</h2>
              <p>Track each asset, hardware GPS unit, and assigned driver.</p>
            </div>
            <select
              className="page-filter"
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
            >
              <option>All</option>
              <option>On route</option>
              <option>Available</option>
              <option>In service</option>
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>VEHICLE</th>
                  <th>REGISTRATION</th>
                  <th>GPS TRACKER</th>
                  <th>SPEED</th>
                  <th>DRIVER</th>
                  <th>STATUS</th>
                  <th>LOCATION</th>
                  <th>NEXT SERVICE</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <b>{v.name}</b>
                      <small style={{ display: 'block', color: '#748078' }}>{v.type} · {v.capacity || '—'}</small>
                    </td>
                    <td>{v.plate}</td>
                    <td><code>{v.gpsDeviceId || 'GPS-SIM'}</code></td>
                    <td>{Number(v.speed || 0).toFixed(1)} km/h</td>
                    <td>{v.driver}</td>
                    <td>
                      <span className="status-pill">{v.status}</span>
                    </td>
                    <td>{v.location}</td>
                    <td>{v.service}</td>
                    <td>
                      {manager ? (
                        <button
                          className="inline-action"
                          type="button"
                          onClick={() => onCycleVehicleStatus(v)}
                        >
                          Update
                        </button>
                      ) : role === 'dispatcher' ? (
                        <button
                          className="inline-action"
                          type="button"
                          onClick={() => onOpenForm('assignment', v.id)}
                        >
                          Assign
                        </button>
                      ) : null}
                      {role === 'admin' && (
                        <button
                          className="inline-delete"
                          type="button"
                          onClick={() => onDeleteVehicle(v.id)}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  if (page === 'trips') {
    const trips = state.trips;

    const handleTripStatus = async (tripId, nextStatus) => {
      try {
        await apiRequest(
          `/api/trips/${encodeURIComponent(tripId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              status: nextStatus,
              progress: nextStatus === 'Delivered' ? 100 : undefined
            })
          },
          token
        );
        await onRefresh();
        onToast('Trip status updated.');
      } catch (err) {
        onToast(err.message);
      }
    };

    const handleQuickReroute = async (tripId) => {
      try {
        await apiRequest(
          `/api/trips/${encodeURIComponent(tripId)}/reroute`,
          { method: 'POST', body: JSON.stringify({ strategy: 'Traffic-Avoidance Route' }) },
          token
        );
        await onRefresh();
        onToast(`Trip ${tripId} rerouted via Traffic-Avoidance corridor with updated ETA.`);
      } catch (err) {
        onToast(err.message);
      }
    };

    return (
      <>
        <PageHeading
          kicker="ROUTES & DISPATCH"
          title="Trips & routes"
          desc="Schedule trips with conflict validation, assign shipments, and monitor live ETAs."
          action={
            dispatcher ? (
              <button
                className="button button-primary"
                type="button"
                onClick={() => onOpenForm('trip')}
              >
                ＋ Schedule a trip
              </button>
            ) : null
          }
        />

        <div className="workspace-stats">
          <Tilt3DCard as="article">
            <span>In transit</span>
            <b>{trips.filter((t) => t.status === 'In transit').length}</b>
          </Tilt3DCard>
          <Tilt3DCard as="article">
            <span>Delivered</span>
            <b>{trips.filter((t) => t.status === 'Delivered').length}</b>
          </Tilt3DCard>
          <Tilt3DCard as="article">
            <span>Delayed</span>
            <b>{trips.filter((t) => t.status === 'Delayed').length}</b>
          </Tilt3DCard>
          <Tilt3DCard as="article">
            <span>Scheduled</span>
            <b>{trips.filter((t) => t.status === 'Scheduled').length}</b>
          </Tilt3DCard>
        </div>

        <section className="panel workspace-table">
          <div className="panel-heading">
            <div>
              <h2>Dispatch board</h2>
              <p>Routes connected to your fleet, drivers, and shipments.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>TRIP ID</th>
                  <th>ROUTE</th>
                  <th>STRATEGY &amp; DIST</th>
                  <th>VEHICLE</th>
                  <th>DRIVER</th>
                  <th>ETA</th>
                  <th>PROGRESS</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {trips.length ? (
                  trips.map((t) => (
                    <tr key={t.id}>
                      <td><b>{t.id}</b></td>
                      <td>
                        {t.from} → {t.to}
                      </td>
                      <td>
                        {t.routeStrategy || 'Fastest Route'}
                        <small style={{ display: 'block', color: '#748078' }}>{t.distanceKm || 14.5} km</small>
                      </td>
                      <td>{t.vehicle}</td>
                      <td>{t.driver}</td>
                      <td><b>{t.eta}</b></td>
                      <td>
                        <div className="route-progress">
                          <i style={{ width: `${Math.min(100, Number(t.progress) || 0)}%` }} />
                        </div>
                        {Number(t.progress) || 0}%
                      </td>
                      <td>
                        {tripUpdater ? (
                          <select
                            className="page-filter trip-status-select"
                            value={t.status}
                            onChange={(e) => handleTripStatus(t.id, e.target.value)}
                          >
                            <option>Scheduled</option>
                            <option>In transit</option>
                            <option>Delayed</option>
                            <option>Delivered</option>
                          </select>
                        ) : (
                          t.status
                        )}
                      </td>
                      <td>
                        {dispatcher && t.status === 'Delayed' && (
                          <button
                            type="button"
                            className="inline-action"
                            onClick={() => handleQuickReroute(t.id)}
                          >
                            Reroute
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="empty-state">
                      No deliveries match this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {(() => {
          const detailTrip =
            trips.find((t) => t.id === selectedTripId) || trips[0] || null;
          if (!detailTrip) return null;
          const linkedShps = (state.shipments || []).filter(
            (s) => s.tripId === detailTrip.id
          );
          const tripVeh = state.vehicles.find((v) => v.id === detailTrip.vehicle);
          return (
            <Tilt3DCard as="section" className="panel padded-panel" style={{ marginTop: '18px' }} maxTilt={2.5}>
              <div className="panel-heading">
                <div>
                  <span className="dialog-kicker">TRIP &amp; ROUTE TELEMETRY DETAILS</span>
                  <h2>
                    {detailTrip.id}: {detailTrip.from} → {detailTrip.to}
                  </h2>
                  <p>
                    Route Strategy: <b>{detailTrip.routeStrategy || 'Fastest Route'}</b> ·{' '}
                    {detailTrip.distanceKm || 14.5} km · Est. {detailTrip.durationMin || 32} mins
                  </p>
                </div>
                <select
                  className="page-filter"
                  value={detailTrip.id}
                  onChange={(e) => setSelectedTripId(e.target.value)}
                >
                  {trips.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      Inspect {tr.id} ({tr.from} → {tr.to})
                    </option>
                  ))}
                </select>
              </div>
              <div className="dp-grid-three" style={{ marginBottom: 0 }}>
                <div>
                  <dl className="dp-kv-list">
                    <div><dt>Assigned Vehicle</dt><dd>{tripVeh ? `${tripVeh.name} (${tripVeh.id})` : detailTrip.vehicle}</dd></div>
                    <div><dt>Assigned Driver</dt><dd>{detailTrip.driver}</dd></div>
                    <div><dt>Scheduled Departure</dt><dd>{detailTrip.scheduledDeparture ? new Date(detailTrip.scheduledDeparture).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '09:30 AM'}</dd></div>
                  </dl>
                </div>
                <div>
                  <dl className="dp-kv-list">
                    <div><dt>Estimated Arrival (ETA)</dt><dd><b>{detailTrip.eta}</b></dd></div>
                    <div><dt>Actual Arrival</dt><dd>{detailTrip.actualArrival || 'In progress'}</dd></div>
                    <div><dt>Next Waypoint</dt><dd>{detailTrip.nextStop || detailTrip.to}</dd></div>
                  </dl>
                </div>
                <div>
                  <dl className="dp-kv-list">
                    <div><dt>Trip Progress</dt><dd>{detailTrip.progress}%</dd></div>
                    <div><dt>Linked Shipments</dt><dd>{linkedShps.length ? linkedShps.map((s) => s.id).join(', ') : 'None linked'}</dd></div>
                    <div><dt>Live Speed</dt><dd>{tripVeh ? `${Number(tripVeh.speed || 0).toFixed(1)} km/h` : '—'}</dd></div>
                  </dl>
                </div>
              </div>
            </Tilt3DCard>
          );
        })()}
      </>
    );
  }

  if (page === 'drivers') {
    const toggleDriverStatus = async (e, d) => {
      e.stopPropagation();
      try {
        await apiRequest(
          `/api/drivers/${encodeURIComponent(d.id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              status: d.status === 'Available' ? 'Off Duty' : 'Available'
            })
          },
          token
        );
        await onRefresh();
        onToast('Driver status updated.');
      } catch (err) {
        onToast(err.message);
      }
    };

    return (
      <>
        <PageHeading
          kicker="PEOPLE & ASSIGNMENTS"
          title="Drivers"
          desc="Click any driver card to open their full Driver Profile, license details, live GPS & performance."
          action={
            manager ? (
              <button
                className="button button-primary"
                type="button"
                onClick={() => onOpenForm('driver')}
              >
                ＋ Add driver
              </button>
            ) : null
          }
        />

        <div className="driver-cards">
          {state.drivers.length ? (
            state.drivers.map((d) => (
              <Tilt3DCard
                as="article"
                className="driver-card driver-card-clickable"
                key={d.id}
                onClick={() => onSelectDriver(d.id)}
              >
                <div className="driver-card-top">
                  <span className="driver-avatar">{initials(d.name)}</span>
                  <span className={`status-pill ${d.status === 'Available' ? 'available' : ''}`}>
                    {d.status}
                  </span>
                </div>
                <h3>{d.name}</h3>
                <p>
                  {d.id} · {d.phone || 'No phone added'}
                </p>
                <div className="driver-details">
                  <span>
                    Licence <b>{d.license}</b>
                  </span>
                  <span>
                    Vehicle <b>{d.vehicle}</b>
                  </span>
                  <span>
                    On-Time Rate <b>{d.onTimeRate ?? 95}%</b>
                  </span>
                  <span>
                    Docs <b>{d.documentVerified ? '✓ Verified' : 'Pending'}</b>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button
                    className="driver-assign"
                    type="button"
                    style={{ flex: 1 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDriver(d.id);
                    }}
                  >
                    Open Full Profile →
                  </button>
                  {manager && (
                    <button
                      className="driver-assign"
                      type="button"
                      onClick={(e) => toggleDriverStatus(e, d)}
                    >
                      {d.status === 'Available' ? 'Off Duty' : 'Available'}
                    </button>
                  )}
                </div>
              </Tilt3DCard>
            ))
          ) : (
            <p className="empty-state">No driver profiles found.</p>
          )}
        </div>
      </>
    );
  }

  if (page === 'maintenance') {
    const completeWorkOrder = async (id) => {
      try {
        await apiRequest(
          `/api/maintenance/${encodeURIComponent(id)}`,
          { method: 'PATCH', body: JSON.stringify({ status: 'Complete' }) },
          token
        );
        await onRefresh();
        onToast('Work order marked complete.');
      } catch (err) {
        onToast(err.message);
      }
    };

    return (
      <>
        <PageHeading
          kicker="PREVENTIVE CARE"
          title="Maintenance"
          desc="Plan service before it becomes downtime."
          action={
            manager ? (
              <button
                className="button button-primary"
                type="button"
                onClick={() => onOpenForm('maintenance')}
              >
                ＋ Schedule service
              </button>
            ) : null
          }
        />

        <div className="workspace-stats">
          <Tilt3DCard as="article">
            <span>Open work orders</span>
            <b>{state.maintenance.length}</b>
          </Tilt3DCard>
          <Tilt3DCard as="article">
            <span>Due this week</span>
            <b>{state.maintenance.filter((m) => m.status === 'Due soon').length}</b>
          </Tilt3DCard>
          <Tilt3DCard as="article">
            <span>Fleet at risk</span>
            <b>{state.vehicles.filter((v) => v.status === 'In service').length}</b>
          </Tilt3DCard>
        </div>

        <section className="panel workspace-table">
          <div className="panel-heading">
            <div>
              <h2>Service schedule</h2>
              <p>Planned maintenance and inspections.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>WORK ORDER</th>
                  <th>VEHICLE</th>
                  <th>SERVICE</th>
                  <th>DUE DATE</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.maintenance.length ? (
                  state.maintenance.map((m) => (
                    <tr key={m.id}>
                      <td>{m.id}</td>
                      <td>
                        {m.vehicle} · {m.name}
                      </td>
                      <td>{m.service}</td>
                      <td>{m.due}</td>
                      <td>
                        <span className={`status-pill ${m.status === 'Due soon' ? 'delayed' : ''}`}>
                          {m.status}
                        </span>
                      </td>
                      <td>
                        {manager && (
                          <button
                            className="inline-action"
                            type="button"
                            onClick={() => completeWorkOrder(m.id)}
                          >
                            Mark complete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="empty-state">
                      Nothing scheduled.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  if (page === 'reports') {
    const averageFuel = state.vehicles.length
      ? Math.round(
          state.vehicles.reduce((sum, v) => sum + Number(v.fuel || 0), 0) /
            state.vehicles.length
        )
      : 0;
    const delivered = state.trips.filter((t) => t.status === 'Delivered').length;
    const completion = state.trips.length
      ? Math.round((delivered / state.trips.length) * 100)
      : 0;
    const active = state.vehicles.filter((v) => v.status === 'On route').length;

    return (
      <>
        <PageHeading
          kicker="FLEET INTELLIGENCE"
          title="Reports"
          desc="A useful read on utilization and delivery performance."
          action={
            <button className="button button-outline" type="button" onClick={onExportCsv}>
              ↓ Export CSV
            </button>
          }
        />

        <div className="workspace-stats">
          <Tilt3DCard as="article">
            <span>Fleet utilization</span>
            <b>{state.vehicles.length ? Math.round((active / state.vehicles.length) * 100) : 0}%</b>
          </Tilt3DCard>
          <Tilt3DCard as="article">
            <span>Delivered trips</span>
            <b>
              {delivered} / {state.trips.length}
            </b>
          </Tilt3DCard>
          <Tilt3DCard as="article">
            <span>Vehicles running</span>
            <b>{active}</b>
          </Tilt3DCard>
          <Tilt3DCard as="article">
            <span>Average fuel used</span>
            <b>{100 - averageFuel}%</b>
          </Tilt3DCard>
        </div>

        <div className="report-grid">
          <Tilt3DCard as="section" className="panel report-card" maxTilt={4}>
            <h2>Vehicle utilization</h2>
            <p>
              Currently on route: {active} of {state.vehicles.length} vehicles
            </p>
            <div className="report-bars">
              {state.vehicles.length ? (
                state.vehicles.map((v) => (
                  <span
                    key={v.id}
                    style={{
                      height: `${Math.max(
                        8,
                        v.status === 'On route' ? 85 : v.status === 'Available' ? 38 : 18
                      )}%`
                    }}
                    title={`${v.name} · ${v.status}`}
                  >
                    <i>{v.id.slice(-3)}</i>
                  </span>
                ))
              ) : (
                <p className="empty-state">No vehicles to report.</p>
              )}
            </div>
          </Tilt3DCard>

          <Tilt3DCard as="section" className="panel report-card" maxTilt={4}>
            <h2>Delivery completion</h2>
            <p>
              {delivered} delivered ·{' '}
              {state.trips.filter((t) => t.status === 'Delayed').length} delayed ·{' '}
              {state.trips.filter((t) => t.status === 'In transit').length} in transit
            </p>
            <div
              className="performance-ring"
              style={{
                background: `conic-gradient(#55a078 0 ${completion}%, #eeeef3 ${completion}% 100%)`
              }}
            >
              <div>
                <b>{completion}%</b>
                <small>complete</small>
              </div>
            </div>
          </Tilt3DCard>
        </div>
      </>
    );
  }

  if (page === 'notifications') {
    const alerts = [
      ...state.trips
        .filter((t) => t.status === 'Delayed')
        .map((t) => ({
          id: `trip-${t.id}`,
          icon: '!',
          title: `Trip ${t.id} is delayed`,
          text: `${t.from} to ${t.to} · ${t.driver} (ETA ${t.eta})`,
          tone: 'amber'
        })),
      ...state.maintenance
        .filter((m) => m.status !== 'Complete')
        .map((m) => ({
          id: `maint-${m.id}`,
          icon: '⚙',
          title: `Service due ${m.due}`,
          text: `${m.name} · ${m.service}`,
          tone: 'violet'
        })),
      ...state.vehicles
        .filter((v) => v.fuel < 40)
        .map((v) => ({
          id: `fuel-${v.id}`,
          icon: '⌁',
          title: 'Fuel level is low',
          text: `${v.name} · ${v.fuel}% remaining`,
          tone: 'rose'
        }))
    ];

    return (
      <>
        <PageHeading
          kicker="INBOX"
          title="Notifications"
          desc="Operational changes that could use your attention."
        />
        <div className="notification-stack">
          {alerts.length ? (
            alerts.map((a) => (
              <Tilt3DCard as="article" key={a.id} maxTilt={3}>
                <span className={`notice-icon ${a.tone}`}>{a.icon}</span>
                <div>
                  <b>{a.title}</b>
                  <p>{a.text}</p>
                </div>
                <small>Just now</small>
              </Tilt3DCard>
            ))
          ) : (
            <div className="empty-state">You’re all caught up. Nice work.</div>
          )}
        </div>
      </>
    );
  }

  if (page === 'settings') {
    const handleSaveSettings = async (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(e.currentTarget).entries());
      try {
        const updated = await apiRequest(
          '/api/settings',
          { method: 'PATCH', body: JSON.stringify(values) },
          token
        );
        onSettingsUpdated(updated);
        onToast('Workspace settings saved.');
      } catch (err) {
        onToast(err.message);
      }
    };

    return (
      <>
        <PageHeading
          kicker="ADMIN CONSOLE"
          title="Workspace & GPS Telematics Settings"
          desc="Configure organization details, hardware GPS gateway key, and map credentials."
        />
        <form className="panel settings-form" onSubmit={handleSaveSettings}>
          <label>
            Organization name
            <input
              name="company"
              defaultValue={state.settings?.company || 'Northstar Logistics'}
              required
            />
          </label>
          <label>
            Base city
            <input
              name="baseCity"
              defaultValue={state.settings?.baseCity || 'Bengaluru'}
              required
            />
          </label>
          <label>
            Currency
            <select name="currency" defaultValue={state.settings?.currency || 'INR'}>
              <option>INR</option>
              <option>USD</option>
              <option>GBP</option>
            </select>
          </label>
          <label>
            Dedicated GPS Hardware Gateway Provider
            <input
              name="gpsGatewayProvider"
              defaultValue={
                state.settings?.gpsGatewayProvider ||
                'Cellular IoT Telematics (4G LTE SIM / MQTT-HTTPS Bridge)'
              }
            />
          </label>
          <label>
            Hardware GPS Device Ingestion API Key (X-Device-Key)
            <input
              name="gpsIngestionSecret"
              defaultValue={state.settings?.gpsIngestionSecret || 'FF-IOT-KEY-2026'}
            />
          </label>
          <div className="settings-foot">
            <span>Organization-wide changes apply to all roles and hardware GPS endpoints.</span>
            <button className="button button-primary" type="submit">
              Save settings
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <PageHeading
      kicker="FLEETFLOW"
      title="Page not found"
      desc="Choose a workspace section from the navigation."
    />
  );
}
