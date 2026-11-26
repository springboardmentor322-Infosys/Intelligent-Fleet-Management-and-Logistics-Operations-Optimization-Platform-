import React, { useState } from 'react';
import Tilt3DCard from './Tilt3DCard';
import { apiRequest } from '../api';

export default function DriverProfilePage({
  driver,
  vehicles = [],
  trips = [],
  shipments = [],
  activeUser,
  token,
  onBack,
  onRefresh,
  onToast
}) {
  const [editing, setEditing] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(driver?.vehicle || 'Unassigned');
  const [formState, setFormState] = useState({
    name: driver?.name || '',
    phone: driver?.phone || '',
    email: driver?.email || '',
    address: driver?.address || '',
    emergencyContact: driver?.emergencyContact || '',
    license: driver?.license || '',
    licenseType: driver?.licenseType || 'Commercial (HMV)',
    licenseExpiryDate: driver?.licenseExpiryDate || 'Jan 10, 2029',
    status: driver?.status || 'Available'
  });

  if (!driver) {
    return (
      <div className="empty-state">
        Driver profile not found.{' '}
        <button className="inline-action" type="button" onClick={onBack}>
          Back to Drivers
        </button>
      </div>
    );
  }

  const isAdmin = activeUser?.role === 'admin';
  const canManage = ['admin', 'fleet_manager'].includes(activeUser?.role);

  const assignedVehicle = vehicles.find((v) => v.id === driver.vehicle || v.driver === driver.name);
  const driverTrips = trips.filter((t) => t.driver === driver.name);
  const activeTrip =
    driverTrips.find((t) => ['In transit', 'Delayed', 'Scheduled'].includes(t.status)) ||
    driverTrips[0] ||
    null;
  const driverShipments = shipments.filter((s) => s.driverName === driver.name);

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      await apiRequest(
        `/api/drivers/${encodeURIComponent(driver.id)}`,
        { method: 'PATCH', body: JSON.stringify(formState) },
        token
      );
      setEditing(false);
      await onRefresh();
      onToast('Driver profile updated.');
    } catch (err) {
      onToast(err.message);
    }
  };

  const handleAssignVehicle = async (e) => {
    e.preventDefault();
    try {
      await apiRequest(
        `/api/drivers/${encodeURIComponent(driver.id)}`,
        { method: 'PATCH', body: JSON.stringify({ vehicle: selectedVehicle }) },
        token
      );
      setAssignOpen(false);
      await onRefresh();
      onToast('Assigned vehicle updated.');
    } catch (err) {
      onToast(err.message);
    }
  };

  const handleVerifyDocuments = async () => {
    try {
      await apiRequest(
        `/api/drivers/${encodeURIComponent(driver.id)}`,
        { method: 'PATCH', body: JSON.stringify({ documentVerified: !driver.documentVerified }) },
        token
      );
      await onRefresh();
      onToast(
        !driver.documentVerified
          ? 'Driver license & documents marked Verified.'
          : 'Document verification status reset.'
      );
    } catch (err) {
      onToast(err.message);
    }
  };

  const handleToggleAccount = async () => {
    try {
      const nextActive = !(driver.accountActive ?? true);
      await apiRequest(
        `/api/drivers/${encodeURIComponent(driver.id)}`,
        { method: 'PATCH', body: JSON.stringify({ accountActive: nextActive }) },
        token
      );
      await onRefresh();
      onToast(nextActive ? 'Driver account activated.' : 'Driver account deactivated.');
    } catch (err) {
      onToast(err.message);
    }
  };

  const handleStatusChange = async (nextStatus) => {
    try {
      await apiRequest(
        `/api/drivers/${encodeURIComponent(driver.id)}`,
        { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) },
        token
      );
      await onRefresh();
      onToast(`Driver status set to ${nextStatus}.`);
    } catch (err) {
      onToast(err.message);
    }
  };

  const statusTone =
    driver.status === 'On Trip'
      ? 'on-trip'
      : driver.status === 'At Stop'
      ? 'at-stop'
      : driver.status === 'Off Duty'
      ? 'off-duty'
      : 'available';

  return (
    <div className="driver-profile-view">
      <div className="dp-breadcrumb-bar">
        <button type="button" className="dp-back-btn" onClick={onBack}>
          ← Drivers
        </button>
        <span>/</span>
        <b>Driver Profile</b>
      </div>

      {/* Top Hero Header Card */}
      <Tilt3DCard as="section" className="panel dp-hero-card" maxTilt={2.5}>
        <div className="dp-hero-left">
          <div className="dp-avatar-wrap">
            {/* Blank placeholder avatar as requested */}
            <div className="dp-blank-avatar" aria-label="Blank driver photo placeholder">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="24" r="12" />
                <path d="M12 56c0-11 9-18 20-18s20 7 20 18" />
              </svg>
            </div>
            <span className={`dp-presence-dot ${statusTone}`} />
          </div>
          <div className="dp-identity">
            <div className="dp-name-row">
              <h1>{driver.name}</h1>
              {!(driver.accountActive ?? true) && (
                <span className="status-pill delayed">Account Deactivated</span>
              )}
            </div>
            <p className="dp-id-line">Driver ID: {driver.id}</p>
            <div className="dp-contact-list">
              <span>📞 {driver.phone || '+91 98450 00000'}</span>
              <span>✉ {driver.email || 'driver@northstarfleet.in'}</span>
              <span>📍 {driver.address || 'Bengaluru, Karnataka'}</span>
            </div>
            <div className="dp-status-chip-row">
              <span className={`dp-status-badge ${statusTone}`}>{driver.status}</span>
            </div>
          </div>
        </div>

        <div className="dp-hero-right">
          {canManage && (
            <div className="dp-admin-toolbar">
              <button
                type="button"
                className="button button-primary"
                onClick={() => setEditing((prev) => !prev)}
              >
                ✎ Edit Profile
              </button>
              <button
                type="button"
                className="button button-outline"
                onClick={() => {
                  setSelectedVehicle(driver.vehicle || 'Unassigned');
                  setAssignOpen((prev) => !prev);
                }}
              >
                🚚 Assign Vehicle
              </button>
              <button
                type="button"
                className="button button-outline"
                onClick={handleVerifyDocuments}
              >
                {driver.documentVerified ? '✓ Verified' : 'Verify Docs'}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className="button button-outline"
                  onClick={handleToggleAccount}
                >
                  {(driver.accountActive ?? true) ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>
          )}

          <div className="dp-quick-kpis">
            <div>
              <small>Status</small>
              <b>
                <i className={`dp-inline-dot ${statusTone}`} /> {driver.status}
              </b>
            </div>
            <div>
              <small>Joined On</small>
              <b>📅 {driver.joinedOn || 'Jan 15, 2024'}</b>
            </div>
            <div>
              <small>Total Trips</small>
              <b>🛣 {driver.completedTrips ?? driverTrips.length}</b>
            </div>
            <div>
              <small>Total Deliveries</small>
              <b>📦 {driver.successfulDeliveries ?? 0}</b>
            </div>
          </div>
        </div>
      </Tilt3DCard>

      {/* Inline Edit Profile Drawer */}
      {editing && canManage && (
        <form className="panel dp-inline-drawer" onSubmit={handleSaveEdit}>
          <div className="panel-heading">
            <div>
              <h2>Edit Driver Profile</h2>
              <p>Update personal details, license expiry, or duty status.</p>
            </div>
          </div>
          <div className="dp-edit-grid">
            <label>
              Full Name
              <input
                value={formState.name}
                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                required
              />
            </label>
            <label>
              Phone Number
              <input
                value={formState.phone}
                onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
              />
            </label>
            <label>
              Email Address
              <input
                type="email"
                value={formState.email}
                onChange={(e) => setFormState({ ...formState, email: e.target.value })}
              />
            </label>
            <label>
              Address
              <input
                value={formState.address}
                onChange={(e) => setFormState({ ...formState, address: e.target.value })}
              />
            </label>
            <label>
              Emergency Contact
              <input
                value={formState.emergencyContact}
                onChange={(e) => setFormState({ ...formState, emergencyContact: e.target.value })}
              />
            </label>
            <label>
              License Number
              <input
                value={formState.license}
                onChange={(e) => setFormState({ ...formState, license: e.target.value })}
                required
              />
            </label>
            <label>
              License Expiry Date
              <input
                value={formState.licenseExpiryDate}
                onChange={(e) => setFormState({ ...formState, licenseExpiryDate: e.target.value })}
              />
            </label>
            <label>
              Duty Status
              <select
                value={formState.status}
                onChange={(e) => setFormState({ ...formState, status: e.target.value })}
              >
                <option value="Available">Available</option>
                <option value="On Trip">On Trip</option>
                <option value="At Stop">At Stop</option>
                <option value="Off Duty">Off Duty</option>
              </select>
            </label>
          </div>
          <div className="dialog-actions" style={{ marginTop: '14px' }}>
            <button type="button" className="button button-outline" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className="button button-primary">
              Save Profile Changes
            </button>
          </div>
        </form>
      )}

      {/* Inline Assign Vehicle Drawer */}
      {assignOpen && canManage && (
        <form className="panel dp-inline-drawer" onSubmit={handleAssignVehicle}>
          <div className="panel-heading">
            <div>
              <h2>Assign Vehicle to {driver.name}</h2>
              <p>Select an active fleet vehicle to link with this driver.</p>
            </div>
          </div>
          <div className="dp-edit-grid">
            <label>
              Select Fleet Vehicle
              <select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
              >
                <option value="Unassigned">Unassigned</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id} · {v.name} ({v.plate}) — {v.status}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="dialog-actions" style={{ marginTop: '14px' }}>
            <button type="button" className="button button-outline" onClick={() => setAssignOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="button button-primary">
              Confirm Vehicle Assignment
            </button>
          </div>
        </form>
      )}

      {/* Row 1: 3 Cards (Personal Information, License Information, Assigned Vehicle) */}
      <div className="dp-grid-three">
        <Tilt3DCard as="section" className="panel dp-info-card" maxTilt={3.5}>
          <h3>👤 Personal Information</h3>
          <dl className="dp-kv-list">
            <div><dt>Full Name</dt><dd>{driver.name}</dd></div>
            <div><dt>Driver ID</dt><dd>{driver.id}</dd></div>
            <div><dt>Phone Number</dt><dd>{driver.phone || 'Not provided'}</dd></div>
            <div><dt>Email</dt><dd>{driver.email || 'Not provided'}</dd></div>
            <div><dt>Address</dt><dd>{driver.address || 'Bengaluru, Karnataka'}</dd></div>
            <div><dt>Emergency Contact</dt><dd>{driver.emergencyContact || 'Not provided'}</dd></div>
          </dl>
        </Tilt3DCard>

        <Tilt3DCard as="section" className="panel dp-info-card" maxTilt={3.5}>
          <h3>🪪 License Information</h3>
          <dl className="dp-kv-list">
            <div><dt>License Number</dt><dd>{driver.license}</dd></div>
            <div><dt>License Type</dt><dd>{driver.licenseType || 'Commercial (HMV)'}</dd></div>
            <div><dt>Issue Date</dt><dd>{driver.licenseIssueDate || 'Jan 10, 2022'}</dd></div>
            <div><dt>Expiry Date</dt><dd>{driver.licenseExpiryDate || 'Jan 10, 2029'}</dd></div>
            <div>
              <dt>Document</dt>
              <dd>
                <button
                  type="button"
                  className="dp-doc-link"
                  onClick={() => onToast(`Viewing document: ${driver.licenseDocument || driver.license + '.pdf'}`)}
                >
                  View Document ↗
                </button>
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`status-pill ${driver.documentVerified ? 'available' : 'delayed'}`}>
                  {driver.documentVerified ? 'Verified' : 'Pending Verification'}
                </span>
              </dd>
            </div>
          </dl>
        </Tilt3DCard>

        <Tilt3DCard as="section" className="panel dp-info-card" maxTilt={3.5}>
          <h3>🚚 Assigned Vehicle</h3>
          {assignedVehicle ? (
            <dl className="dp-kv-list">
              <div><dt>Vehicle No.</dt><dd>{assignedVehicle.id} ({assignedVehicle.plate})</dd></div>
              <div><dt>Vehicle Model</dt><dd>{assignedVehicle.name} · {assignedVehicle.type}</dd></div>
              <div><dt>Fuel Type</dt><dd>{assignedVehicle.fuelType}</dd></div>
              <div><dt>Capacity</dt><dd>{assignedVehicle.capacity}</dd></div>
              <div><dt>GPS Tracker ID</dt><dd>{assignedVehicle.gpsDeviceId || 'GPS-SIM-UNIT'}</dd></div>
              <div>
                <dt>Status</dt>
                <dd><span className="status-pill available">{assignedVehicle.status}</span></dd>
              </div>
            </dl>
          ) : (
            <div className="empty-state">No vehicle currently assigned to this driver.</div>
          )}
        </Tilt3DCard>
      </div>

      {/* Row 2: 3 Cards (Current Trip, Driver Status & Live GPS Tracking, Basic Performance) */}
      <div className="dp-grid-three">
        <Tilt3DCard as="section" className="panel dp-info-card" maxTilt={3.5}>
          <h3>🧭 Current Trip &amp; Shipments</h3>
          {activeTrip ? (
            <dl className="dp-kv-list">
              <div><dt>Trip ID</dt><dd>{activeTrip.id}</dd></div>
              <div><dt>Route</dt><dd>{activeTrip.from} → {activeTrip.to}</dd></div>
              <div><dt>Optimization</dt><dd>{activeTrip.routeStrategy || 'Fastest Route'}</dd></div>
              <div><dt>Estimated Arrival</dt><dd>{activeTrip.eta}</dd></div>
              <div>
                <dt>Status</dt>
                <dd><span className="status-pill available">{activeTrip.status} ({activeTrip.progress}%)</span></dd>
              </div>
              <div><dt>Assigned Shipments</dt><dd>{driverShipments.length} manifest(s)</dd></div>
              <div><dt>Next Stop</dt><dd>{activeTrip.nextStop || activeTrip.to}</dd></div>
            </dl>
          ) : (
            <div className="empty-state">No active trip assigned right now.</div>
          )}
        </Tilt3DCard>

        <Tilt3DCard as="section" className="panel dp-info-card" maxTilt={3.5}>
          <h3>📡 Driver Status &amp; Live GPS</h3>
          <div className="dp-status-banner">
            <span className={`dp-inline-dot ${statusTone}`} />
            <div>
              <b>{driver.status}</b>
              <small>
                {driver.status === 'On Trip'
                  ? 'Driver is currently on an active trip.'
                  : driver.status === 'At Stop'
                  ? 'Vehicle paused at scheduled waypoint.'
                  : driver.status === 'Off Duty'
                  ? 'Driver is currently off duty.'
                  : 'Driver is ready for route dispatch.'}
              </small>
            </div>
          </div>
          <dl className="dp-kv-list">
            <div>
              <dt>Current Location</dt>
              <dd>📍 {assignedVehicle?.location || driver.currentLocation || 'Bengaluru'}</dd>
            </div>
            <div>
              <dt>GPS Coordinates</dt>
              <dd>
                {assignedVehicle?.lat
                  ? `${Number(assignedVehicle.lat).toFixed(4)}° N, ${Number(assignedVehicle.lng).toFixed(4)}° E`
                  : '12.9716° N, 77.5946° E'}
              </dd>
            </div>
            <div>
              <dt>Live Speed</dt>
              <dd>{Number(assignedVehicle?.speed ?? driver.speed ?? 0).toFixed(1)} km/h</dd>
            </div>
            <div><dt>Next Stop</dt><dd>{activeTrip?.nextStop || driver.nextStop || '—'}</dd></div>
            <div><dt>ETA</dt><dd>{activeTrip?.eta || driver.eta || '—'}</dd></div>
          </dl>
          {canManage && (
            <div className="dp-quick-status-btns">
              {['Available', 'On Trip', 'At Stop', 'Off Duty'].map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`inline-action ${driver.status === st ? 'active-chip' : ''}`}
                  onClick={() => handleStatusChange(st)}
                >
                  {st}
                </button>
              ))}
            </div>
          )}
        </Tilt3DCard>

        <Tilt3DCard as="section" className="panel dp-info-card" maxTilt={3.5}>
          <h3>📊 Basic Performance</h3>
          <dl className="dp-kv-list">
            <div><dt>Total Trips</dt><dd>{driver.completedTrips ?? driverTrips.length}</dd></div>
            <div><dt>Successful Deliveries</dt><dd>{driver.successfulDeliveries ?? 0}</dd></div>
            <div><dt>Delayed Deliveries</dt><dd>{driver.delayedDeliveries ?? 0}</dd></div>
            <div>
              <dt>On-Time Delivery Rate</dt>
              <dd style={{ color: '#2d6b4b', fontWeight: 700 }}>{driver.onTimeRate ?? 95}%</dd>
            </div>
            <div>
              <dt>Total Distance Travelled</dt>
              <dd>{Number(driver.totalDistanceKm ?? 12450).toLocaleString('en-IN')} km</dd>
            </div>
          </dl>
        </Tilt3DCard>
      </div>

      {/* Trip History Table */}
      <section className="panel workspace-table" style={{ marginTop: '18px' }}>
        <div className="panel-heading">
          <div>
            <h2>Trip History &amp; Assigned Shipments</h2>
            <p>Complete operational log for {driver.name}.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>TRIP ID</th>
                <th>ORIGIN → DESTINATION</th>
                <th>ROUTE STRATEGY</th>
                <th>DISTANCE</th>
                <th>ETA / ARRIVAL</th>
                <th>PROGRESS</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {driverTrips.length ? (
                driverTrips.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.from} → {t.to}</td>
                    <td>{t.routeStrategy || 'Fastest Route'}</td>
                    <td>{t.distanceKm || 14.5} km</td>
                    <td>{t.actualArrival || t.eta}</td>
                    <td>{t.progress}%</td>
                    <td>
                      <span className={`status-pill ${t.status === 'Delayed' ? 'delayed' : 'available'}`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No recorded trips for this driver yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
