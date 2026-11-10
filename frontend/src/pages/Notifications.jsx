import { useEffect, useState } from "react";
import { api } from "../api";
import { fmt } from "../ui";

const KEY = "ff_notifications_seen";
const KIND_LABEL = {
  maintenance: "Maintenance", shipment: "Shipment update", delivery: "Delivery",
  assignment: "Driver assignment", route: "Route change",
};

// "Read" is remembered in this browser only (a timestamp), so a notification is unread when it
// is newer than the last time this person pressed "Mark all as read".
function readSeen() {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}
function writeSeen(v) {
  try { localStorage.setItem(KEY, v); } catch { /* storage blocked: stays unread */ }
}

export default function Notifications({ go, setError }) {
  const [items, setItems] = useState([]);
  const [kind, setKind] = useState("");
  const [seen, setSeen] = useState(readSeen());

  async function load() {
    try {
      setItems(await api("/notifications?hours=168"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  const unread = (n) => !seen || (n.at && n.at > seen);
  const shown = items.filter((n) => !kind || n.kind === kind);
  const unreadCount = items.filter(unread).length;

  function markAll() {
    const now = new Date().toISOString();
    writeSeen(now);
    setSeen(now);
  }

  return (
    <>
      <section className="page-toolbar">
        <div>
          <h2>Notifications</h2>
          <p>Maintenance alerts, shipment and delivery updates, driver assignments and route changes from the last 7 days.</p>
        </div>
        <button className="secondary-button" onClick={markAll} disabled={unreadCount === 0}>
          Mark all as read ({unreadCount})
        </button>
      </section>

      <section className="panel">
        <form className="filters" onSubmit={(e) => e.preventDefault()}>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All notifications</option>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </form>
        {shown.length === 0 ? <p>No notifications.</p> : (
          <ul className="history-list" style={{ listStyle: "none", paddingLeft: 0 }}>
            {shown.map((n) => (
              <li key={n.id} style={{ padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
                <b style={{ fontWeight: unread(n) ? 700 : 500 }}>
                  {unread(n) && <span className="delay-badge bad">New</span>} {n.title}
                </b>
                <br />
                <small>{KIND_LABEL[n.kind]} · {fmt(n.at)} · {n.message}</small>
                {go && n.page && (
                  <> <button className="link-button" onClick={() => go(n.page)}>Open {n.page}</button></>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
