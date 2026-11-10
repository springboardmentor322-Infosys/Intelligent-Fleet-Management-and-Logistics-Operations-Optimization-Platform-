import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, apiForm, fetchBlob } from "../api";
import { DelayBadge, fmt, fmtTime } from "../ui";

const DOC_TYPES = ["Licence front", "Licence back", "ID proof", "Other"];
const DUTY_CLASS = { Available: "ok", "On Trip": "info", "At Stop": "warn", "Off Duty": "bad" };
const DUTY_TEXT = {
  Available: "Ready for a trip.",
  "On Trip": "A trip is in progress.",
  "At Stop": "On a trip, but the vehicle has been standing still for about 5 minutes.",
  "Off Duty": "Marked absent or on leave today, or the login is deactivated.",
};
const LICENCE_CLASS = { Valid: "ok", "Expiring soon": "warn", Expired: "bad", "Not set": "muted" };

const Row = ({ label, children }) => (
  <p className="kv"><span>{label}</span><b>{children}</b></p>
);

const kb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// Small map: the driver's vehicle and the route it is following.
function TrackMap({ gps }) {
  const div = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const line = useRef(null);
  const fitted = useRef(false);
  const [route, setRoute] = useState(null);

  useEffect(() => {
    const m = L.map(div.current).setView([22.5726, 88.3639], 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; marker.current = null; line.current = null; };
  }, []);

  // The route saved on the current trip; checked every 30 s so a reroute shows up.
  const tripId = gps.trip_id;
  useEffect(() => {
    setRoute(null);
    fitted.current = false;
    if (tripId == null) return;
    let cancelled = false;
    const fetchRoute = () =>
      api(`/trips/${tripId}/route`)
        .then((r) => {
          if (cancelled) return;
          setRoute((cur) => (!r.has_route ? null : cur && cur.version === r.version ? cur : r));
        })
        .catch(() => { /* the position is still shown */ });
    fetchRoute();
    const id = setInterval(fetchRoute, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [tripId]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (line.current) { line.current.remove(); line.current = null; }
    if (route) line.current = L.polyline(route.geometry, { color: "#2563eb", weight: 4 }).addTo(m);
  }, [route]);

  const { lat, lng } = gps;
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (lat == null || lng == null) return;
    if (!marker.current) {
      marker.current = L.circleMarker([lat, lng], {
        radius: 9, color: "#fff", weight: 2, fillColor: "#16a34a", fillOpacity: 1,
      }).addTo(m);
    } else {
      marker.current.setLatLng([lat, lng]);
    }
  }, [lat, lng]);

  // Zoom to the route (or the vehicle) the first time there is something to show.
  useEffect(() => {
    const m = map.current;
    if (!m || fitted.current) return;
    if (line.current) {
      m.fitBounds(line.current.getBounds(), { padding: [20, 20] });
      fitted.current = true;
    } else if (lat != null && lng != null) {
      m.setView([lat, lng], 13);
      fitted.current = true;
    }
  }, [route, lat, lng]);

  return <div className="driver-map" ref={div} />;
}

export default function DriverProfile({ driverId, showBack, onBack, setError }) {
  const [p, setP] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoTick, setPhotoTick] = useState(0);
  const [vehicles, setVehicles] = useState([]);
  const [linkable, setLinkable] = useState([]);
  const [pickVehicle, setPickVehicle] = useState("");
  const [pickAccount, setPickAccount] = useState("");
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [docFile, setDocFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  // driverId null = the logged-in driver's own profile
  const base = driverId == null ? "/drivers/me/profile" : `/drivers/${driverId}/profile`;

  async function load() {
    try {
      setP(await api(base));
      setLoadError("");
    } catch (e) {
      setLoadError(e.message);
    }
  }
  useEffect(() => { setP(null); setEditing(false); load(); }, [base]);

  // Status, ETA and position change on their own while a trip runs.
  useEffect(() => {
    const id = setInterval(() => { if (!editing) load(); }, 30000);
    return () => clearInterval(id);
  }, [base, editing]);

  const actions = p?.actions;

  // The vehicle list and the unlinked logins are only needed for the admin actions.
  useEffect(() => {
    if (!actions?.assign_vehicle) return;
    api("/vehicles").then(setVehicles).catch(() => {});
  }, [actions?.assign_vehicle, p?.vehicle?.id]);

  useEffect(() => {
    if (!actions?.link_account || p?.account.linked) { setLinkable([]); return; }
    api("/drivers/linkable-accounts").then(setLinkable).catch(() => {});
  }, [actions?.link_account, p?.account?.linked]);

  // The photo is private, so it is fetched with the login token and shown from a blob.
  const photoPath = p?.personal.photo_url;
  useEffect(() => {
    if (!photoPath) { setPhotoUrl(null); return; }
    let cancelled = false;
    let url = null;
    fetchBlob(photoPath)
      .then((b) => { if (!cancelled) { url = URL.createObjectURL(b); setPhotoUrl(url); } })
      .catch(() => { if (!cancelled) setPhotoUrl(null); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [photoPath, photoTick]);

  async function run(fn, success) {
    setError("");
    setNote("");
    setBusy(true);
    try {
      await fn();
      if (success) setNote(success);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    setForm({
      name: p.personal.name, license_number: p.licence.number, phone: p.personal.phone,
      email: p.personal.email || "", license_expiry: p.licence.expiry || "",
    });
    setEditing(true);
  }

  function saveEdit(e) {
    e.preventDefault();
    run(async () => {
      await api(`/drivers/${p.id}`, {
        method: "PUT",
        body: {
          name: form.name, license_number: form.license_number, phone: form.phone,
          email: form.email.trim() || null, license_expiry: form.license_expiry || null,
        },
      });
      setEditing(false);
    }, "Profile updated.");
  }

  function uploadPhoto(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    run(async () => {
      await apiForm(`/drivers/${p.id}/photo`, fd);
      setPhotoTick((t) => t + 1);
    }, "Photo updated.");
  }

  function uploadDoc(e) {
    e.preventDefault();
    if (!docFile) { setError("Choose a file first"); return; }
    const fd = new FormData();
    fd.append("doc_type", docType);
    fd.append("file", docFile);
    run(async () => {
      await apiForm(`/drivers/${p.id}/documents`, fd);
      setDocFile(null);
      if (fileInput.current) fileInput.current.value = "";
    }, `${docType} uploaded. It is unverified until a manager verifies it.`);
  }

  // Open the window first (inside the click), then fill it: browsers block a window opened later.
  async function openDoc(doc) {
    setError("");
    const w = window.open("", "_blank");
    try {
      const blob = await fetchBlob(doc.url);
      const url = URL.createObjectURL(blob);
      if (w) w.location.href = url;
      else setError("Allow pop-ups to view documents");
    } catch (e) {
      if (w) w.close();
      setError(e.message);
    }
  }

  const verify = (doc, on) =>
    run(() => api(`/drivers/${p.id}/documents/${doc.id}/${on ? "verify" : "unverify"}`, { method: "POST" }),
      on ? `${doc.doc_type} verified.` : `${doc.doc_type} marked unverified.`);

  function removeDoc(doc) {
    if (!window.confirm(`Remove the ${doc.doc_type} (${doc.original_name})?`)) return;
    run(() => api(`/drivers/${p.id}/documents/${doc.id}`, { method: "DELETE" }), "Document removed.");
  }

  const assignVehicle = () =>
    run(async () => {
      await api(`/vehicles/${pickVehicle}/assign-driver/${p.id}`, { method: "PUT" });
      setPickVehicle("");
    }, "Vehicle assigned.");

  function unassignVehicle() {
    if (!window.confirm("Remove this driver from their vehicle?")) return;
    run(() => api(`/vehicles/${p.vehicle.id}/assign-driver`, { method: "DELETE" }), "Vehicle unassigned.");
  }

  const linkAccount = () =>
    run(async () => {
      await api(`/drivers/${p.id}/account`, { method: "PUT", body: { user_id: Number(pickAccount) } });
      setPickAccount("");
    }, "Login linked.");

  function unlinkAccount() {
    if (!window.confirm("Unlink this login? The driver will no longer see this profile.")) return;
    run(() => api(`/drivers/${p.id}/account`, { method: "DELETE" }), "Login unlinked.");
  }

  function toggleActive() {
    const turnOn = !p.account.is_active;
    if (!window.confirm(turnOn ? "Activate this account?" : "Deactivate this account? The driver will not be able to log in.")) return;
    run(() => api(`/users/${p.account.user_id}`, { method: "PUT", body: { is_active: turnOn } }),
      turnOn ? "Account activated." : "Account deactivated.");
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // ---------- render ----------
  if (loadError && !p) {
    return (
      <section className="panel">
        <p>{loadError}</p>
        {showBack && <button className="secondary-button" onClick={onBack}>Back to drivers</button>}
      </section>
    );
  }
  if (!p) return <p>Loading...</p>;

  const { personal, licence, vehicle, trips, gps, performance: perf, account } = p;
  const freeVehicles = vehicles.filter((v) => !v.assigned_driver_id && v.status !== "In Maintenance");
  const anyAdmin = actions.edit || actions.assign_vehicle || actions.link_account || actions.deactivate;

  return (
    <>
      {note && <div className="note-message">{note}</div>}
      {loadError && <div className="error-message">{loadError}</div>}

      {/* Header: who, and the two things you want to know at a glance */}
      <section className="panel profile-head">
        {photoUrl
          ? <img className="profile-photo" src={photoUrl} alt={`${personal.name}`} />
          : <div className="profile-photo fallback">{personal.name.charAt(0).toUpperCase()}</div>}
        <div style={{ flex: 1 }}>
          <h2>{personal.name}</h2>
          <span className={`badge ${DUTY_CLASS[p.duty_status]}`}>{p.duty_status}</span>{" "}
          <span className={`badge ${LICENCE_CLASS[licence.status]}`}>Licence: {licence.status}</span>
        </div>
        {showBack && <button className="secondary-button" onClick={onBack}>Back to drivers</button>}
      </section>

      <div className="profile-grid">
        {/* 1. Personal details */}
        <section className="panel">
          <h3>Personal details</h3>
          {editing ? (
            <form className="form-grid" onSubmit={saveEdit}>
              <label>Full name<input required maxLength={100} value={form.name} onChange={set("name")} /></label>
              <label>Phone<input required minLength={5} maxLength={20} value={form.phone} onChange={set("phone")} /></label>
              <label>Email<input type="email" maxLength={120} value={form.email} onChange={set("email")} /></label>
              <label>Licence number<input required maxLength={50} value={form.license_number} onChange={set("license_number")} /></label>
              <label>Licence expiry<input type="date" value={form.license_expiry} onChange={set("license_expiry")} /></label>
              <div>
                <button className="primary-button" type="submit" disabled={busy}>Save</button>{" "}
                <button className="secondary-button" type="button" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <>
              <Row label="Driver ID">{personal.id}</Row>
              <Row label="Name">{personal.name}</Row>
              <Row label="Phone">{personal.phone}</Row>
              <Row label="Email">{personal.email || "—"}</Row>
              <Row label="Login">
                {account.linked ? <>{account.username} {account.is_active ? "" : <span className="badge bad">deactivated</span>}</> : "Not linked"}
              </Row>
            </>
          )}
          {actions.upload && !editing && (
            <div className="inline-form">
              <label className="secondary-button" style={{ cursor: "pointer" }}>
                {personal.photo_url ? "Change photo" : "Upload photo"}
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={uploadPhoto} />
              </label>
              <small>JPG, PNG or WEBP, up to 2 MB</small>
            </div>
          )}
        </section>

        {/* 2. Driver status */}
        <section className="panel">
          <h3>Driver status</h3>
          <p><span className={`badge ${DUTY_CLASS[p.duty_status]}`}>{p.duty_status}</span></p>
          <p>{DUTY_TEXT[p.duty_status]}</p>
          <small>Worked out from today's attendance, the driver's trips and the vehicle's GPS, so it updates by itself.</small>
        </section>

        {/* 3. Licence details */}
        <section className="panel wide">
          <h3>Licence details</h3>
          <Row label="Licence number">{licence.number}</Row>
          <Row label="Expiry date">
            {licence.expiry || "—"} <span className={`badge ${LICENCE_CLASS[licence.status]}`}>{licence.status}</span>
          </Row>
          <Row label="Documents">
            {licence.documents.length === 0 ? "None uploaded"
              : licence.all_verified ? <span className="badge ok">All verified</span>
              : <span className="badge warn">Waiting for verification</span>}
          </Row>
          {licence.documents.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Type</th><th>File</th><th>Uploaded</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {licence.documents.map((doc) => (
                    <tr key={doc.id}>
                      <td>{doc.doc_type}</td>
                      <td>{doc.original_name} <small>({kb(doc.size_bytes)})</small></td>
                      <td>{fmt(doc.uploaded_at)}</td>
                      <td>
                        {doc.verified
                          ? <><span className="badge ok">Verified</span><br /><small>{doc.verified_by} · {fmt(doc.verified_at)}</small></>
                          : <span className="badge muted">Unverified</span>}
                      </td>
                      <td>
                        <div className="doc-actions">
                          <button className="secondary-button" onClick={() => openDoc(doc)}>View</button>
                          {actions.verify_documents && (
                            <button className="secondary-button" disabled={busy} onClick={() => verify(doc, !doc.verified)}>
                              {doc.verified ? "Unverify" : "Verify"}
                            </button>
                          )}
                          {actions.upload && (!doc.verified || actions.verify_documents) && (
                            <button className="secondary-button" disabled={busy} onClick={() => removeDoc(doc)}>Remove</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {actions.upload && (
            <form className="inline-form" onSubmit={uploadDoc}>
              <select value={docType} onChange={(e) => setDocType(e.target.value)}>
                {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => setDocFile(e.target.files[0] || null)} />
              <button className="primary-button" type="submit" disabled={busy}>Upload</button>
              <small>PDF, JPG or PNG, up to 5 MB. A new Licence front, Licence back or ID proof replaces the old one.</small>
            </form>
          )}
        </section>

        {/* 4. Vehicle details */}
        <section className="panel">
          <h3>Vehicle details</h3>
          {vehicle ? (
            <>
              <Row label="Assigned vehicle">{vehicle.vehicle_type}</Row>
              <Row label="Registration number">{vehicle.registration_number}</Row>
              <Row label="Vehicle status">{vehicle.status}</Row>
            </>
          ) : <p>No vehicle assigned.</p>}
        </section>

        {/* 7. Performance */}
        <section className="panel">
          <h3>Performance</h3>
          <Row label="Completed trips">{perf.completed_trips}</Row>
          <Row label="Successful deliveries">{perf.successful_deliveries}</Row>
          <Row label="Delays">{perf.delays}</Row>
          <Row label="On-time delivery rate">
            {perf.on_time_rate_percent == null ? "—" : `${perf.on_time_rate_percent}%`}
          </Row>
          <small>
            {perf.on_time_rate_percent == null
              ? "No finished trip with a planned arrival time yet."
              : `Based on ${perf.judged_trips} finished trip${perf.judged_trips === 1 ? "" : "s"} with a planned arrival time. A trip is late when it arrives more than 15 minutes after plan.`}
          </small>
        </section>

        {/* 5. Trip details */}
        <section className="panel wide">
          <h3>Trip details</h3>
          <h4>Current trip</h4>
          {trips.current ? (
            <>
              <p><b>#{trips.current.id}</b> {trips.current.origin} → {trips.current.destination}{" "}
                <DelayBadge delay={trips.current.delay} /></p>
              <p>Vehicle {trips.current.vehicle} · ETA {fmtTime(trips.current.eta)} (planned {fmtTime(trips.current.planned_eta)}) ·{" "}
                {trips.current.route_type ? `${trips.current.route_type} route` : "route not chosen"}</p>
            </>
          ) : <p>No trip in progress.</p>}

          {trips.upcoming.length > 0 && (
            <>
              <h4>Upcoming trips</h4>
              {trips.upcoming.map((t) => (
                <p key={t.id}>#{t.id} {t.origin} → {t.destination} · {fmt(t.scheduled_start)} <DelayBadge delay={t.delay} /></p>
              ))}
            </>
          )}

          <h4>Assigned shipments</h4>
          {trips.shipments.length === 0 ? <p>No shipments assigned.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Code</th><th>Route</th><th>Cargo</th><th>Trip</th><th>Status</th></tr></thead>
                <tbody>
                  {trips.shipments.map((s) => (
                    <tr key={s.id}>
                      <td><b>{s.code}</b></td>
                      <td>{s.origin} → {s.destination}</td>
                      <td>{s.description} <small>({s.weight_kg} kg)</small></td>
                      <td>{s.trip ? `#${s.trip.id}` : "—"}</td>
                      <td><span className={`status-pill ${s.status === "Delayed" ? "pill-bad" : ""}`}>{s.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h4>Trip history</h4>
          {trips.history.length === 0 ? <p>No finished trips yet.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Trip</th><th>Route</th><th>Vehicle</th><th>Finished</th><th>Distance</th><th>Status</th></tr></thead>
                <tbody>
                  {trips.history.map((t) => (
                    <tr key={t.id}>
                      <td>#{t.id}</td>
                      <td>{t.origin} → {t.destination}</td>
                      <td>{t.vehicle}</td>
                      <td>{t.completed_at ? fmt(t.completed_at) : "—"}</td>
                      <td>{t.distance_km != null ? `${t.distance_km} km` : "—"}</td>
                      <td><span className="status-pill">{t.status}</span> <DelayBadge delay={t.delay} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 6. GPS tracking */}
        <section className="panel wide">
          <h3>GPS tracking</h3>
          {!gps ? <p>No vehicle is assigned, so there is nothing to track.</p> : (
            <>
              <Row label="Vehicle">{gps.registration_number}</Row>
              <Row label="Last seen">{gps.last_seen ? fmt(gps.last_seen) : "No position received yet"}</Row>
              <Row label="Speed">{gps.speed_kmh != null ? `${Math.round(gps.speed_kmh)} km/h` : "—"}</Row>
              <Row label="Route">{gps.route_type ? `${gps.route_type} (blue line)` : "No trip in progress"}</Row>
              <Row label="ETA">
                {gps.eta ? <>{fmtTime(gps.eta)} <DelayBadge delay={gps.delay} /></> : "—"}
              </Row>
              {gps.lat != null && gps.lng != null
                ? <TrackMap gps={gps} />
                : <p>This vehicle has not sent a GPS position yet.</p>}
            </>
          )}
        </section>

        {/* 8. Admin actions */}
        {anyAdmin && (
          <section className="panel wide">
            <h3>Admin actions</h3>

            {actions.edit && !editing && (
              <p><button className="secondary-button" onClick={startEdit}>Edit profile</button></p>
            )}

            {actions.assign_vehicle && (
              <div className="inline-form">
                <b>Vehicle:</b>
                {vehicle ? (
                  <>
                    <span>{vehicle.registration_number}</span>
                    <button className="secondary-button" disabled={busy} onClick={unassignVehicle}>Unassign</button>
                  </>
                ) : (
                  <>
                    <select value={pickVehicle} onChange={(e) => setPickVehicle(e.target.value)}>
                      <option value="">Select a free vehicle...</option>
                      {freeVehicles.map((v) => (
                        <option key={v.id} value={v.id}>{v.registration_number} · {v.vehicle_type}</option>
                      ))}
                    </select>
                    <button className="secondary-button" disabled={busy || !pickVehicle} onClick={assignVehicle}>Assign</button>
                  </>
                )}
              </div>
            )}

            {actions.link_account && (
              <div className="inline-form">
                <b>Login:</b>
                {account.linked ? (
                  <>
                    <span>{account.username} ({account.email})</span>
                    {actions.deactivate && (
                      <button className="secondary-button" disabled={busy} onClick={toggleActive}>
                        {account.is_active ? "Deactivate account" : "Activate account"}
                      </button>
                    )}
                    <button className="secondary-button" disabled={busy} onClick={unlinkAccount}>Unlink</button>
                  </>
                ) : linkable.length === 0 ? (
                  <small>No unlinked driver logins. Create one under Users &amp; Roles with the Driver role.</small>
                ) : (
                  <>
                    <select value={pickAccount} onChange={(e) => setPickAccount(e.target.value)}>
                      <option value="">Select a driver login...</option>
                      {linkable.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.email})</option>)}
                    </select>
                    <button className="secondary-button" disabled={busy || !pickAccount} onClick={linkAccount}>Link login</button>
                  </>
                )}
              </div>
            )}

            {actions.verify_documents && (
              <p><small>Documents are verified from the table in Licence details above.</small></p>
            )}
          </section>
        )}
      </div>
    </>
  );
}
