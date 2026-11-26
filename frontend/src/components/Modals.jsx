import React, { useEffect, useRef, useState } from 'react';
import { apiRequest, initials } from '../api';

export function RecordFormDialog({
  open,
  kind,
  vehicleId,
  state,
  token,
  onClose,
  onSuccess,
  onToast
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  if (!kind) return null;

  const isTrip = kind === 'trip';
  const titles = {
    trip: 'New trip',
    vehicle: 'Add a vehicle',
    driver: 'Add a driver',
    maintenance: 'Schedule maintenance',
    member: 'Add a team member',
    assignment: 'Assign a driver'
  };
  const submitLabels = {
    trip: 'Create trip',
    vehicle: 'Add vehicle',
    driver: 'Add driver',
    maintenance: 'Schedule work',
    member: 'Create account',
    assignment: 'Save assignment'
  };
  const toastLabels = {
    trip: 'Trip added to your schedule.',
    vehicle: 'Vehicle added to your fleet.',
    driver: 'Driver profile created.',
    maintenance: 'Maintenance scheduled.',
    member: 'Team account created.',
    assignment: 'Driver assignment saved.'
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const endpoint = {
      trip: '/api/trips',
      vehicle: '/api/vehicles',
      driver: '/api/drivers',
      maintenance: '/api/maintenance',
      member: '/api/users'
    }[kind];

    try {
      if (kind === 'assignment') {
        await apiRequest(
          `/api/vehicles/${encodeURIComponent(vehicleId)}`,
          { method: 'PATCH', body: JSON.stringify(payload) },
          token
        );
      } else {
        await apiRequest(
          endpoint,
          { method: 'POST', body: JSON.stringify(payload) },
          token
        );
      }
      form.reset();
      onClose();
      await onSuccess(kind);
      onToast(toastLabels[kind]);
    } catch (err) {
      onToast(err.message);
    }
  };

  const currentVehicle = state.vehicles.find((v) => v.id === vehicleId);

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="dialog-head">
          <div>
            <span className="dialog-kicker">FLEETFLOW</span>
            <h2>{titles[kind] || 'Add record'}</h2>
            <p>
              {isTrip
                ? 'Add a delivery to today’s schedule.'
                : kind === 'assignment'
                ? 'Choose a driver for this vehicle.'
                : `Add ${kind === 'maintenance' ? 'a work order' : `a ${kind}`} to your workspace.`}
            </p>
          </div>
          <button className="close-dialog" type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="form-fields">
          {isTrip && (
            <>
              <div className="field">
                <label htmlFor="from">Pickup location</label>
                <input id="from" name="from" placeholder="e.g. Whitefield" required maxLength={80} />
              </div>
              <div className="field">
                <label htmlFor="to">Destination</label>
                <input id="to" name="to" placeholder="e.g. Koramangala" required maxLength={80} />
              </div>
              <div className="field">
                <label htmlFor="driver">Driver</label>
                <select id="driver" name="driver">
                  <option>Unassigned</option>
                  {[...new Set(state.drivers.map((d) => d.name))].map((dName) => (
                    <option key={dName}>{dName}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="vehicle">Vehicle</label>
                <select id="vehicle" name="vehicle">
                  <option value="—">Choose a vehicle</option>
                  {state.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} · {v.id} ({v.status})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="routeStrategy">Route optimization</label>
                <select id="routeStrategy" name="routeStrategy" defaultValue="Fastest Route">
                  <option value="Fastest Route">Fastest Route (Live Traffic)</option>
                  <option value="Traffic-Avoidance Route">Traffic-Avoidance Route</option>
                  <option value="Shortest Route">Shortest Route</option>
                  <option value="Fuel-Efficient Route">Fuel-Efficient Route</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="shipmentId">Associate Shipment (Optional)</label>
                <select id="shipmentId" name="shipmentId">
                  <option value="">No shipment linked</option>
                  {(state.shipments || [])
                    .filter((s) => s.status === 'Created')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} · {s.cargo} ({s.origin} → {s.destination})
                      </option>
                    ))}
                </select>
              </div>
            </>
          )}

          {kind === 'vehicle' && (
            <>
              <div className="field full">
                <label htmlFor="name">Vehicle name</label>
                <input id="name" name="name" placeholder="e.g. Tata Ace Gold" required maxLength={80} />
              </div>
              <div className="field">
                <label htmlFor="plate">Registration number</label>
                <input id="plate" name="plate" placeholder="KA 01 AB 1234" required maxLength={24} />
              </div>
              <div className="field">
                <label htmlFor="type">Vehicle type</label>
                <select id="type" name="type">
                  <option>Van</option>
                  <option>Mini truck</option>
                  <option>Truck</option>
                  <option>Pickup</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="capacity">Load capacity</label>
                <input id="capacity" name="capacity" placeholder="e.g. 1,200 kg" />
              </div>
              <div className="field">
                <label htmlFor="fuelType">Fuel type</label>
                <select id="fuelType" name="fuelType">
                  <option>Diesel</option>
                  <option>Petrol</option>
                  <option>CNG</option>
                  <option>Electric</option>
                  <option>Hybrid</option>
                </select>
              </div>
              <div className="field full">
                <label htmlFor="service">Next service date</label>
                <input id="service" name="service" type="date" defaultValue="2026-12-01" />
              </div>
            </>
          )}

          {kind === 'driver' && (
            <>
              <div className="field">
                <label htmlFor="driver-name">Full name</label>
                <input id="driver-name" name="name" required maxLength={80} />
              </div>
              <div className="field">
                <label htmlFor="driver-phone">Phone</label>
                <input id="driver-phone" name="phone" type="tel" placeholder="+91" />
              </div>
              <div className="field">
                <label htmlFor="license">Licence number</label>
                <input id="license" name="license" required maxLength={40} />
              </div>
              <div className="field">
                <label htmlFor="driver-vehicle">Assigned vehicle</label>
                <select id="driver-vehicle" name="vehicle">
                  <option>Unassigned</option>
                  {state.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id} · {v.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {kind === 'maintenance' && (
            <>
              <div className="field">
                <label htmlFor="maint-vehicle">Vehicle</label>
                <select id="maint-vehicle" name="vehicle" required>
                  {state.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id} · {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="service-name">Service type</label>
                <input id="service-name" name="service" placeholder="e.g. Brake inspection" required />
              </div>
              <div className="field full">
                <label htmlFor="due-date">Due date</label>
                <input id="due-date" name="due" type="date" required />
              </div>
            </>
          )}

          {kind === 'assignment' && (
            <div className="field full">
              <label htmlFor="assign-driver">Driver</label>
              <select
                id="assign-driver"
                name="driver"
                required
                defaultValue={currentVehicle?.driver || 'Unassigned'}
              >
                <option value="Unassigned">Unassigned</option>
                {state.drivers.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {kind === 'member' && (
            <>
              <div className="field">
                <label htmlFor="member-name">Full name</label>
                <input id="member-name" name="name" required minLength={2} />
              </div>
              <div className="field">
                <label htmlFor="member-email">Work email</label>
                <input id="member-email" name="email" type="email" required />
              </div>
              <div className="field">
                <label htmlFor="member-role">Workspace role</label>
                <select id="member-role" name="role" defaultValue="fleet_manager">
                  <option value="fleet_manager">Fleet Manager</option>
                  <option value="dispatcher">Dispatcher</option>
                  <option value="driver">Driver</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="member-password">Temporary password</label>
                <input id="member-password" name="password" type="password" minLength={8} required />
              </div>
            </>
          )}
        </div>

        <div className="dialog-actions">
          <button className="button button-outline" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button button-primary" type="submit">
            {submitLabels[kind]}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function TeamDialog({
  open,
  activeUser,
  token,
  refreshSignal,
  onClose,
  onOpenAddMember,
  onAskConfirm,
  onToast
}) {
  const dialogRef = useRef(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  const loadUsers = async () => {
    try {
      setError('');
      const list = await apiRequest('/api/users', {}, token);
      setUsers(list);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
      loadUsers();
    } else if (el.open) {
      el.close();
    }
  }, [open, refreshSignal]);

  const handleRoleChange = async (userId, role) => {
    try {
      await apiRequest(`/api/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ role })
      }, token);
      onToast('Team member permissions updated.');
      await loadUsers();
    } catch (err) {
      onToast(err.message);
      await loadUsers();
    }
  };

  const handleDeleteUser = async (userId) => {
    const ok = await onAskConfirm(
      'Remove this account?',
      'This person will lose access to the workspace.',
      'Remove account'
    );
    if (!ok) return;
    try {
      await apiRequest(`/api/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }, token);
      await loadUsers();
      onToast('Account removed.');
    } catch (err) {
      onToast(err.message);
    }
  };

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose}>
      <div className="team-dialog-body">
        <div className="dialog-head">
          <div>
            <span className="dialog-kicker">ADMIN CONSOLE</span>
            <h2>Team access</h2>
            <p>Review workspace accounts and their permissions.</p>
          </div>
          <button className="close-dialog" type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <button className="button button-primary team-add" type="button" onClick={onOpenAddMember}>
          ＋ Add team member
        </button>
        <div className="team-list">
          {error ? (
            <div className="empty-state">{error}</div>
          ) : (
            users.map((u) => (
              <div className="team-user" key={u.id}>
                <span className="driver-avatar">{initials(u.name)}</span>
                <span className="user-meta">
                  <b>
                    {u.name}
                    {u.id === activeUser?.id ? ' (you)' : ''}
                  </b>
                  <small>{u.email}</small>
                </span>
                <select
                  className="team-role"
                  aria-label={`Role for ${u.name}`}
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                >
                  <option value="admin">Admin</option>
                  <option value="fleet_manager">Fleet manager</option>
                  <option value="dispatcher">Dispatcher</option>
                  <option value="driver">Driver</option>
                </select>
                {u.id !== activeUser?.id && (
                  <button
                    className="team-remove"
                    type="button"
                    aria-label={`Remove ${u.name}`}
                    onClick={() => handleDeleteUser(u.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        <div className="dialog-actions">
          <button className="button button-outline" type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function ProfileDialog({
  open,
  user,
  token,
  onClose,
  onUserUpdated,
  onRequestSignOut,
  onToast
}) {
  const dialogRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && user) {
      setName(user.name);
      setEmail(user.email);
      setEditing(false);
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open, user]);

  if (!user) return null;

  const roleLabel =
    {
      admin: 'Administrator',
      fleet_manager: 'Fleet Manager',
      dispatcher: 'Dispatcher',
      driver: 'Driver'
    }[user.role] || 'FleetFlow member';

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await apiRequest(
        '/api/profile',
        { method: 'PATCH', body: JSON.stringify({ name, email }) },
        token
      );
      setEditing(false);
      onClose();
      onUserUpdated(result.user);
      onToast('Your profile has been updated.');
    } catch (err) {
      onToast(err.message);
    }
  };

  return (
    <dialog ref={dialogRef} className="dialog profile-dialog" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="dialog-head">
          <div>
            <span className="dialog-kicker">YOUR ACCOUNT</span>
            <h2>Your profile</h2>
            <p>Keep your account details up to date.</p>
          </div>
          <button className="close-dialog" type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="profile-card">
          <span className="profile-large-avatar">{initials(user.name)}</span>
          <div>
            <b>{user.name}</b>
            <small>{roleLabel}</small>
          </div>
        </div>
        <div className="form-fields profile-fields">
          <div className="field">
            <label htmlFor="profile-name">Full name</label>
            <input
              id="profile-name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              disabled={!editing}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="profile-email">Email address</label>
            <input
              id="profile-email"
              name="email"
              type="email"
              required
              disabled={!editing}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <div className="dialog-actions profile-actions">
          <button
            className="button button-outline"
            type="button"
            onClick={() => {
              onClose();
              onRequestSignOut();
            }}
          >
            Sign out
          </button>
          <span className="profile-action-spacer" />
          {!editing ? (
            <button className="button button-outline" type="button" onClick={() => setEditing(true)}>
              Edit profile
            </button>
          ) : (
            <button className="button button-primary" type="submit">
              Save changes
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}

export function SignOutDialog({ open, onCancel, onConfirm }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} className="dialog confirm-dialog" onClose={onCancel}>
      <div className="confirm-content">
        <span className="confirm-mark">↗</span>
        <span className="dialog-kicker">END THIS SESSION</span>
        <h2>Sign out of FleetFlow?</h2>
        <p>Your account and saved fleet records will be here when you sign in again.</p>
        <div className="dialog-actions">
          <button className="button button-outline" type="button" onClick={onCancel}>
            Stay signed in
          </button>
          <button className="button button-primary" type="button" onClick={onConfirm}>
            Sign out
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function ConfirmDialog({ config, onResolve }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (config && !el.open) el.showModal();
    if (!config && el.open) el.close();
  }, [config]);

  return (
    <dialog
      ref={dialogRef}
      className="dialog confirm-dialog"
      onCancel={() => onResolve(false)}
    >
      <div className="confirm-content">
        <span className="dialog-kicker">PLEASE CONFIRM</span>
        <h2>{config?.title || 'Are you sure?'}</h2>
        <p>{config?.message || ''}</p>
        <div className="dialog-actions">
          <button className="button button-outline" type="button" onClick={() => onResolve(false)}>
            Cancel
          </button>
          <button className="button button-danger" type="button" onClick={() => onResolve(true)}>
            {config?.action || 'Continue'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function SearchDialog({ open, state, onClose, onSelectPage }) {
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      setQuery('');
      if (!el.open) el.showModal();
      setTimeout(() => inputRef.current?.focus(), 30);
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  const term = query.trim().toLowerCase();
  const results = [];
  if (term) {
    for (const v of state.vehicles) {
      if ([v.name, v.plate, v.driver, v.status, v.location, v.type].some((x) => String(x || '').toLowerCase().includes(term))) {
        results.push({ kind: 'Vehicle', title: v.name, detail: `${v.plate} · ${v.status} · ${v.driver}`, page: 'vehicles', icon: '▰' });
      }
    }
    for (const t of state.trips) {
      if ([t.id, t.from, t.to, t.driver, t.vehicle, t.status].some((x) => String(x || '').toLowerCase().includes(term))) {
        results.push({ kind: 'Trip', title: `${t.from} → ${t.to}`, detail: `${t.id} · ${t.driver} · ${t.status}`, page: 'trips', icon: '↗' });
      }
    }
    for (const d of state.drivers || []) {
      if ([d.name, d.phone, d.license, d.vehicle, d.status].some((x) => String(x || '').toLowerCase().includes(term))) {
        results.push({ kind: 'Driver', title: d.name, detail: `${d.id} · ${d.vehicle} · ${d.status}`, page: 'drivers', icon: '♙' });
      }
    }
  }

  return (
    <dialog ref={dialogRef} className="dialog search-dialog" onClose={onClose}>
      <div className="search-dialog-body">
        <div className="global-search-field">
          <span>⌕</span>
          <input
            ref={inputRef}
            type="search"
            placeholder="Search vehicles, routes, drivers…"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>ESC</kbd>
          <button className="close-dialog" type="button" aria-label="Close search" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="search-scope">
          SEARCH YOUR FLEET{' '}
          <span>{term ? `${results.length} result${results.length === 1 ? '' : 's'}` : ''}</span>
        </div>
        <div className="search-results">
          {!term ? (
            <div className="search-empty">Start typing to search vehicles, routes and drivers.</div>
          ) : results.length ? (
            results.slice(0, 16).map((r, idx) => (
              <button
                key={`${r.kind}-${idx}`}
                className="search-result"
                type="button"
                onClick={() => {
                  onClose();
                  onSelectPage(r.page);
                }}
              >
                <span className="search-result-icon">{r.icon}</span>
                <span>
                  <small>{r.kind}</small>
                  <b>{r.title}</b>
                  <em>{r.detail}</em>
                </span>
                <i>↵</i>
              </button>
            ))
          ) : (
            <div className="search-empty">No matching vehicles, trips or drivers.</div>
          )}
        </div>
        <div className="search-foot">
          <span>Vehicles</span>
          <span>Trips &amp; routes</span>
          <span>Drivers</span>
        </div>
      </div>
    </dialog>
  );
}
