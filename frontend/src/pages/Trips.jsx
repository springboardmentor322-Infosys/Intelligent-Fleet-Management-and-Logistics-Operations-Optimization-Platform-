import { useEffect, useState } from "react";
import { api } from "../api";
import { DelayBadge, fmt, fmtMin, fmtTime } from "../ui";

const STATUSES = ["Planned", "In Progress", "Completed", "Cancelled"];
const blank = {
  vehicle_id: "", driver_id: "", origin: "", destination: "",
  cargo_description: "", cargo_weight: "", scheduled_start: "",
  route_pref: "", ship_ids: [],   // route_pref: "" | "fastest" | "shortest"; ship_ids: shipments to attach
};

const norm = (s) => s.trim().split(/\s+/).join(" ").toLowerCase();

// ISO string -> value for <input type="datetime-local"> (browser local time)
function toLocalInput(iso) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);
}

const tagLabel = (tags) =>
  tags && tags.length ? tags.map((t) => t[0].toUpperCase() + t.slice(1)).join(" & ") : "Alternative";

const savingText = (m) =>
  m > 0 ? `${m} min faster` : m < 0 ? `${-m} min slower` : "about the same time";

export default function Trips({ canDispatch, setError }) {
  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [openShipments, setOpenShipments] = useState([]); // Created: free to attach
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);
  const [note, setNote] = useState("");
  // The route / reroute panel: { mode: "route" | "reroute", trip, data }
  const [panel, setPanel] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    try {
      setTrips(await api(`/trips?${p}`));
      setVehicles(await api("/vehicles"));
      setDrivers(await api("/drivers"));
      setOpenShipments(await api("/shipments?status=Created"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, [status]);

  // Keep ETAs and delay flags fresh while trips are running.
  useEffect(() => {
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [status]);

  function cancelForm() {
    setShow(false);
    setEditing(null);
    setForm(blank);
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    setNote("");
    const { route_pref, ship_ids, ...fields } = form;
    try {
      const saved = await api(editing ? `/trips/${editing}` : "/trips", {
        method: editing ? "PUT" : "POST",
        body: {
          ...fields,
          vehicle_id: Number(form.vehicle_id),
          driver_id: Number(form.driver_id),
          cargo_weight: Number(form.cargo_weight),
          cargo_description: form.cargo_description || null,
          scheduled_start: new Date(form.scheduled_start).toISOString(),
        },
      });
      // The trip is saved. The route and shipments are separate steps, so report each failure.
      const problems = await applyExtras(saved, route_pref, ship_ids);
      cancelForm();
      if (problems.length) {
        setError(`Trip #${saved.id} was saved, but: ${problems.join("; ")}. Fix these from the Route button or the Shipments page.`);
      } else {
        setNote(`Trip #${saved.id} saved${route_pref ? ` with the ${route_pref} route` : ""}${ship_ids.length ? ` and ${ship_ids.length} shipment(s)` : ""}.`);
      }
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function applyExtras(trip, routePref, shipIds) {
    const problems = [];
    if (routePref) {
      try {
        const data = await api(`/trips/${trip.id}/routes`);
        const i = data.routes.findIndex((x) => x.tags.includes(routePref));
        if (i < 0) throw new Error(`no ${routePref} route was found`);
        const r = data.routes[i];
        await api(`/trips/${trip.id}/route`, {
          method: "POST",
          body: { route_index: i, distance_km: r.distance_km, duration_min: r.duration_min },
        });
      } catch (e) {
        problems.push(`the route could not be saved (${e.message})`);
      }
    }
    for (const id of shipIds) {
      try {
        await api(`/shipments/${id}/assign`, { method: "POST", body: { trip_id: trip.id } });
      } catch (e) {
        problems.push(`shipment #${id} was not attached (${e.message})`);
      }
    }
    return problems;
  }

  function toggleShipment(id) {
    setForm((f) => ({
      ...f,
      ship_ids: f.ship_ids.includes(id) ? f.ship_ids.filter((x) => x !== id) : [...f.ship_ids, id],
    }));
  }

  // ---- Trip details: route, ETA, shipments and route changes ----
  async function openDetails(t) {
    setError("");
    setNote("");
    setBusy(true);
    try {
      const [shipments, changes] = await Promise.all([
        api(`/shipments?trip_id=${t.id}`), api(`/trips/${t.id}/route-changes`),
      ]);
      setPanel({ mode: "details", trip: t, shipments, changes });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function edit(t) {
    setEditing(t.id);
    setForm({
      vehicle_id: String(t.vehicle_id), driver_id: String(t.driver_id),
      origin: t.origin, destination: t.destination,
      cargo_description: t.cargo_description || "",
      cargo_weight: String(t.cargo_weight),
      scheduled_start: toLocalInput(t.scheduled_start),
      route_pref: "", ship_ids: [],
    });
    setShow(true);
  }

  async function act(t, action, body) {
    setError("");
    setNote("");
    try {
      await api(`/trips/${t.id}/${action}`, { method: "POST", body });
      setNote(`Trip #${t.id} (${t.origin} → ${t.destination}): ${action} done.`);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function complete(t) {
    const km = window.prompt("Distance travelled in km (leave blank to skip):", "");
    if (km === null) return;
    const n = Number(km);
    if (km.trim() !== "" && (Number.isNaN(n) || n < 0)) {
      setError("Distance must be a positive number");
      return;
    }
    act(t, "complete", km.trim() === "" ? undefined : { distance_km: n });
  }

  function cancel(t) {
    if (window.confirm(`Cancel trip #${t.id}?`)) act(t, "cancel");
  }

  // ---- Route options for a planned trip ----
  async function openRoutes(t) {
    setError("");
    setNote("");
    setBusy(true);
    try {
      const data = await api(`/trips/${t.id}/routes`);
      let avoid = null;   // which option has the lowest time including live traffic, if known
      try {
        const tr = await api(`/trips/${t.id}/route-traffic`);
        if (tr.available) avoid = tr.traffic_avoidance_index;
      } catch { /* traffic is optional */ }
      setPanel({ mode: "route", trip: t, data: { ...data, avoid } });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function chooseRoute(i) {
    const { trip, data } = panel;
    const r = data.routes[i];
    setError("");
    setBusy(true);
    try {
      await api(`/trips/${trip.id}/route`, {
        method: "POST",
        body: { route_index: i, distance_km: r.distance_km, duration_min: r.duration_min },
      });
      setNote(`Trip #${trip.id}: the ${tagLabel(r.tags).toLowerCase()} route is saved for this trip.`);
      setPanel(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Reroute check for a trip in progress ----
  async function openReroute(t) {
    setError("");
    setNote("");
    setBusy(true);
    try {
      setPanel({ mode: "reroute", trip: t, data: await api(`/trips/${t.id}/reroute-check`, { method: "POST" }) });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function applyReroute(i) {
    const { trip } = panel;
    setError("");
    setBusy(true);
    try {
      await api(`/trips/${trip.id}/reroute`, {
        method: "POST",
        body: { option_index: i, reason: "Dispatcher accepted a faster route" },
      });
      setNote(`Trip #${trip.id} was rerouted. The vehicle follows the new route from where it is.`);
      setPanel(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Picking a vehicle pre-selects its assigned driver, if it has one.
  function pickVehicle(e) {
    const v = vehicles.find((x) => String(x.id) === e.target.value);
    setForm({
      ...form,
      vehicle_id: e.target.value,
      driver_id: v?.assigned_driver_id ? String(v.assigned_driver_id) : form.driver_id,
    });
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const selected = vehicles.find((v) => String(v.id) === form.vehicle_id);

  return (
    <>
      <section className="page-toolbar">
        <div>
          <h2>Trips &amp; Dispatch</h2>
          <p>Plan trips, choose routes, assign vehicles and drivers, and track them to completion.</p>
        </div>
        {canDispatch && (
          <button className="primary-button"
            onClick={() => { setForm(blank); setEditing(null); setShow(true); }}>
            + New trip
          </button>
        )}
      </section>

      {note && <div className="note-message">{note}</div>}

      {show && (
        <form className="panel form-grid" onSubmit={save}>
          <h3>{editing ? `Edit trip #${editing}` : "Plan a trip"}</h3>
          <label>Vehicle
            <select required value={form.vehicle_id} onChange={pickVehicle}>
              <option value="">Select vehicle...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id} disabled={v.status === "In Maintenance"}>
                  {v.registration_number} · {v.vehicle_type} · {v.capacity} kg
                  {v.status === "In Maintenance" ? " (in maintenance)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>Driver
            <select required value={form.driver_id} onChange={set("driver_id")}>
              <option value="">Select driver...</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label>Origin
            <input required maxLength={120} value={form.origin} onChange={set("origin")} />
          </label>
          <label>Destination
            <input required maxLength={120} value={form.destination} onChange={set("destination")} />
          </label>
          <label>Cargo description
            <input maxLength={200} value={form.cargo_description} onChange={set("cargo_description")} />
          </label>
          <label>Cargo weight (kg){selected ? ` — max ${selected.capacity}` : ""}
            <input required type="number" min="0" step="any"
              max={selected ? selected.capacity : undefined}
              value={form.cargo_weight} onChange={set("cargo_weight")} />
          </label>
          <label>Scheduled start
            <input required type="datetime-local" value={form.scheduled_start}
              onChange={set("scheduled_start")} />
          </label>
          <label>Route
            <select value={form.route_pref} onChange={set("route_pref")}>
              <option value="">Decide later (the fastest is used at start)</option>
              <option value="fastest">Fastest route</option>
              <option value="shortest">Shortest route</option>
            </select>
          </label>
          <div style={{ gridColumn: "1 / -1" }}>
            <b>Shipments on this trip</b>
            {(() => {
              const match = form.origin.trim() && form.destination.trim()
                ? openShipments.filter((s) => norm(s.origin) === norm(form.origin)
                    && norm(s.destination) === norm(form.destination))
                : [];
              const total = openShipments.filter((s) => form.ship_ids.includes(s.id))
                .reduce((sum, s) => sum + s.weight_kg, 0);
              return match.length === 0 ? (
                <p><small>No unassigned shipments go {form.origin.trim() || "…"} → {form.destination.trim() || "…"}. Enter the same origin and destination as a shipment to attach it.</small></p>
              ) : (
                <>
                  {match.map((s) => (
                    <label key={s.id} style={{ display: "block" }}>
                      <input type="checkbox" checked={form.ship_ids.includes(s.id)}
                        onChange={() => toggleShipment(s.id)} />{" "}
                      {s.code} · {s.description} · {s.weight_kg} kg
                    </label>
                  ))}
                  <small>Selected: {total} kg{selected ? ` of ${selected.capacity} kg capacity` : ""}</small>
                </>
              );
            })()}
          </div>
          <div>
            <button className="primary-button" type="submit">{editing ? "Update" : "Save"}</button>{" "}
            <button className="secondary-button" type="button" onClick={cancelForm}>Cancel</button>
          </div>
          {editing && <small style={{ gridColumn: "1 / -1" }}>
            Changing the origin or destination clears the saved route, so choose it again afterwards.
          </small>}
        </form>
      )}

      {panel && (
        <section className="panel">
          <h3>
            {panel.mode === "route" ? "Choose a route" : panel.mode === "details" ? "Trip details" : "Reroute check"} · Trip #{panel.trip.id}:{" "}
            {panel.trip.origin} → {panel.trip.destination}
          </h3>

          {panel.mode === "details" && (() => {
            const t = panel.trip;
            return (
              <>
                <p>
                  {t.vehicle} · {t.driver} · <span className="status-pill">{t.status}</span>
                  <DelayBadge delay={t.delay} /><br />
                  Scheduled {fmt(t.scheduled_start)}
                  {t.started_at && <> · started {fmt(t.started_at)}</>}
                  {t.completed_at && <> · completed {fmt(t.completed_at)}</>}
                </p>
                <p>
                  Route: {t.route_type
                    ? <><b>{t.route_type}</b> · {fmtMin(t.route_duration_min)} planned driving</>
                    : "not chosen yet"}
                  {t.planned_eta && <><br />Planned ETA {fmtTime(t.planned_eta)}</>}
                  {t.eta && t.status === "In Progress" && <> · current ETA {fmtTime(t.eta)}</>}
                  {t.delay_minutes > 0 && <> · traffic delay allowed for: {t.delay_minutes} min</>}
                </p>
                {t.arrival && (
                  <p>
                    <b>Estimated vs actual:</b> arrived {fmtTime(t.arrival.actual_arrival)}, planned {fmtTime(t.planned_eta)}{" "}
                    ({t.arrival.vs_plan_min === 0 ? "exactly on plan"
                      : `${Math.abs(t.arrival.vs_plan_min)} min ${t.arrival.vs_plan_min > 0 ? "later" : "earlier"}`}
                    {t.arrival.on_time ? ", on time" : ", late"})
                    {t.arrival.vs_last_eta_min != null && <><br /><small>The last live ETA was off by {Math.abs(t.arrival.vs_last_eta_min)} min.</small></>}
                  </p>
                )}
                <h4>Shipments ({panel.shipments.length})</h4>
                {panel.shipments.length === 0 ? <p><small>No shipments attached.</small></p> : (
                  <ul>
                    {panel.shipments.map((s) => (
                      <li key={s.id}>{s.code} · {s.description} · {s.weight_kg} kg · <b>{s.status}</b></li>
                    ))}
                  </ul>
                )}
                <h4>Route changes</h4>
                {panel.changes.length === 0 ? <p><small>The route has not been changed.</small></p> : (
                  <ul>
                    {panel.changes.map((c) => (
                      <li key={c.id}>
                        {fmt(c.changed_at)}: {c.old_route_type} → {c.new_route_type}
                        {" "}({fmtMin(c.old_duration_min)} → {fmtMin(c.new_duration_min)}) · {c.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            );
          })()}

          {panel.mode === "route" && (
            <>
              <p>
                {panel.trip.route_type
                  ? <>Saved route: <b>{panel.trip.route_type}</b> · {fmtMin(panel.trip.route_duration_min)}. Choose another to replace it.</>
                  : "No route chosen yet. If you do not choose one, the fastest route is used when the trip starts."}
              </p>
              <div className="route-options">
                {panel.data.routes.map((r, i) => (
                  <div className="route-option" key={i}>
                    <div>
                      <b>{tagLabel(r.tags)}</b>
                      {panel.data.avoid === i && <span className="delay-badge ok">Least traffic</span>}<br />
                      <small>{r.distance_km} km · {fmtMin(r.duration_min)} at normal driving speed</small>
                    </div>
                    {canDispatch && (
                      <button className="primary-button" disabled={busy} onClick={() => chooseRoute(i)}>
                        Use this route
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <small>The saved route is drawn on the Live Tracking map and followed by the vehicle.</small>
            </>
          )}

          {panel.mode === "reroute" && (
            <>
              {panel.data.current ? (
                <p>
                  Current route: {panel.data.current.distance_km} km left ·{" "}
                  {fmtMin(panel.data.current.free_flow_min)} driving
                  {panel.data.traffic_available && ` + ${panel.data.current.traffic_delay_min} min traffic`}
                  {" "}= <b>{fmtMin(panel.data.current.total_min)}</b>
                </p>
              ) : null}
              <p><small>{panel.data.traffic_note}</small></p>
              {panel.data.options.length === 0 ? <p>No alternative routes to compare.</p> : (
                <div className="route-options">
                  {panel.data.options.map((o) => {
                    const best = panel.data.recommend && o.index === panel.data.best_option;
                    return (
                      <div className={`route-option ${best ? "best" : ""}`} key={o.index}>
                        <div>
                          <b>{tagLabel(o.tags)}</b>{best && <span className="delay-badge ok">Recommended</span>}<br />
                          <small>
                            {o.distance_km} km · {fmtMin(o.free_flow_min)}
                            {panel.data.traffic_available && ` + ${o.traffic_delay_min} min traffic`}
                            {" "}= {fmtMin(o.total_min)} · {savingText(o.saving_min)}
                          </small>
                        </div>
                        {canDispatch && (
                          <button className={best ? "primary-button" : "secondary-button"}
                            disabled={busy} onClick={() => applyReroute(o.index)}>
                            Switch to this route
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {!panel.data.recommend && panel.data.options.length > 0 && (
                <small>No option saves at least {panel.data.min_saving_min} minutes, so staying on the current route is recommended.</small>
              )}
            </>
          )}

          <p><button className="secondary-button" onClick={() => setPanel(null)}>Close</button></p>
        </section>
      )}

      <section className="panel">
        <div className="filters">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        {trips.length === 0 ? <p>No trips found.</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>ID</th><th>Route</th><th>Vehicle</th><th>Driver</th><th>Cargo</th>
                  <th>Scheduled</th><th>ETA</th><th>Status</th>{canDispatch && <th>Actions</th>}</tr>
              </thead>
              <tbody>
                {trips.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}<br />
                      <button className="secondary-button" disabled={busy} onClick={() => openDetails(t)}>Details</button></td>
                    <td>{t.origin} → {t.destination}
                      {t.distance_km != null && <small> ({t.distance_km} km)</small>}
                      <br /><small>
                        {t.route_type ? `${t.route_type} route · ${fmtMin(t.route_duration_min)}` : "route not chosen"}
                      </small></td>
                    <td>{t.vehicle}</td>
                    <td>{t.driver}</td>
                    <td>{t.cargo_description || "—"} ({t.cargo_weight} kg)
                      {t.shipment_count > 0 && <><br /><small>{t.shipment_count} shipment{t.shipment_count > 1 ? "s" : ""}</small></>}</td>
                    <td>{fmt(t.scheduled_start)}</td>
                    <td>
                      {t.status === "In Progress" && t.eta ? (
                        <>{fmtTime(t.eta)}<br /><small>planned {fmtTime(t.planned_eta)}</small></>
                      ) : t.status === "Completed" ? fmtTime(t.completed_at) : "—"}
                    </td>
                    <td>
                      <span className="status-pill">{t.status}</span>
                      <DelayBadge delay={t.delay} />
                    </td>
                    {canDispatch && (
                      <td>
                        <div className="row-actions">
                          {t.status === "Planned" && (
                            <>
                              <button className="secondary-button" onClick={() => act(t, "start")}>Start</button>
                              <button className="secondary-button" disabled={busy} onClick={() => openRoutes(t)}>Route</button>
                              <button className="secondary-button" onClick={() => edit(t)}>Edit</button>
                            </>
                          )}
                          {t.status === "In Progress" && (
                            <>
                              <button className="secondary-button" onClick={() => complete(t)}>Complete</button>
                              <button className="secondary-button" disabled={busy} onClick={() => openReroute(t)}>Reroute check</button>
                            </>
                          )}
                          {(t.status === "Planned" || t.status === "In Progress") && (
                            <button className="secondary-button" onClick={() => cancel(t)}>Cancel</button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
