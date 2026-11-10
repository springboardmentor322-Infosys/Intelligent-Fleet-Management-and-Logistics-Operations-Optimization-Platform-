// Small helpers shared by the Trips, Shipments, Live Tracking and Dashboard pages.

export const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

export const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

// minutes -> "45 min" or "2h 05m"
export function fmtMin(m) {
  if (m == null) return "—";
  const total = Math.round(m);
  return total >= 60 ? `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m` : `${total} min`;
}

const DELAY_LABEL = {
  on_time: "On time",
  delayed: "Delayed",
  late_to_start: "Late to start",
  finished_late: "Finished late",
};

// `delay` is the object the API returns on every trip: { state, late_minutes, delayed }.
export function DelayBadge({ delay }) {
  if (!delay || !delay.state) return null;
  const bad = delay.state !== "on_time";
  return (
    <span className={`delay-badge ${bad ? "bad" : "ok"}`}>
      {DELAY_LABEL[delay.state]}{bad && delay.late_minutes ? ` +${delay.late_minutes} min` : ""}
    </span>
  );
}

// ETA line for the small trip summary used by live tracking: { eta, delayed, late_minutes }.
export function EtaLine({ trip }) {
  if (!trip || !trip.eta) return null;
  return (
    <span>
      ETA {fmtTime(trip.eta)}
      {trip.delayed && <span className="delay-badge bad">+{trip.late_minutes} min</span>}
    </span>
  );
}
