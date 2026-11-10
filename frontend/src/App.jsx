import { useEffect, useRef, useState } from "react";
import "./App.css";
import "./extra.css";
import { api, clearToken, getToken } from "./api";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Vehicles from "./pages/Vehicles.jsx";
import Drivers from "./pages/Drivers.jsx";
import Trips from "./pages/Trips.jsx";
import Shipments from "./pages/Shipments.jsx";
import Maintenance from "./pages/Maintenance.jsx";
import DriverAssignment from "./pages/DriverAssignment.jsx";
import Fuel from "./pages/Fuel.jsx";
import FleetPerformance from "./pages/FleetPerformance.jsx";
import Notifications from "./pages/Notifications.jsx";
import Reports from "./pages/Reports.jsx";
import LiveMap from "./pages/LiveMap.jsx";
import Users from "./pages/Users.jsx";
import Profile from "./pages/Profile.jsx";
import DriverProfile from "./pages/DriverProfile.jsx";
import Icon from "./Icons.jsx";

// Which icon goes in front of each menu option (the option names are the page names).
const MENU_ICONS = {
  Dashboard: "dashboard", "Live Tracking": "tracking", Vehicles: "vehicles",
  Drivers: "drivers", Trips: "trips", Shipments: "shipments", Maintenance: "maintenance",
  "Driver Assignment": "assignment", "Fuel Management": "fuel",
  "Fleet Performance": "analytics", Reports: "analytics", Notifications: "alerts",
  "Users & Roles": "users", "Driver Profile": "drivers",
};

const ROLE_LABEL = {
  admin: "Administrator", fleet_manager: "Fleet Manager",
  dispatcher: "Dispatcher", driver: "Driver",
};

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  const [screen, setScreen] = useState("landing");
  const [page, setPage] = useState("Dashboard");
  const [profileDriver, setProfileDriver] = useState(null); // the driver whose profile staff opened
  const [error, setError] = useState("");
  const [userMenu, setUserMenu] = useState(false); // the account menu at the bottom of the sidebar
  const userMenuRef = useRef(null);

  // Close the account menu on an outside click or Escape.
  useEffect(() => {
    if (!userMenu) return;
    const onDown = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenu(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setUserMenu(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenu]);

  useEffect(() => {
    if (!getToken()) return;
    api("/auth/me")
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  function logout() {
    clearToken();
    setUserMenu(false);
    setUser(null);
    setScreen("landing");
    setPage("Dashboard");
  }

  if (checking) return <p style={{ padding: 24 }}>Loading...</p>;
  if (!user && screen === "landing") return <Landing onLogin={() => setScreen("login")} />;
  if (!user)
    return (
      <Login
        onLogin={(u) => { setUser(u); setPage("Dashboard"); }}
        onBack={() => setScreen("landing")}
      />
    );

  // Admin / Fleet Manager can modify fleet data; Dispatcher / Driver are read-only.
  const canEdit = ["admin", "fleet_manager"].includes(user.role);
  // Dispatchers can additionally plan and run trips.
  const canDispatch = ["admin", "fleet_manager", "dispatcher"].includes(user.role);
  const menu = ["Dashboard", "Live Tracking", "Vehicles", "Drivers", "Trips", "Shipments"];
  if (canDispatch) menu.push("Driver Assignment");
  menu.push("Notifications");
  if (canEdit) menu.push("Fleet Performance");
  if (canEdit) menu.push("Reports");
  if (canEdit) menu.push("Fuel Management");
  if (canEdit) menu.push("Maintenance"); // shows repair costs: admin and fleet manager only
  if (user.role === "admin") menu.push("Users & Roles");
  if (user.role === "driver") menu.splice(1, 0, "Driver Profile"); // a driver's own profile

  const go = (p) => { setPage(p); setError(""); };
  const openDriver = (id) => { setProfileDriver(id); go("Driver Profile"); };

  return (
    <div className="app">
      <aside className="sidebar">
        <h2 className="logo">Fleet<span>Flow</span></h2>
        <p className="menu-label">FLEET OPERATIONS</p>
        {menu.map((item) => (
          <button key={item} className={`menu-item ${page === item || (item === "Drivers" && page === "Driver Profile") ? "active" : ""}`}
            onClick={() => go(item)}>
            <Icon name={MENU_ICONS[item]} />
            {item}
          </button>
        ))}

        <div className="sidebar-user" ref={userMenuRef}>
          {userMenu && (
            <div className="user-menu" role="menu">
              <button className="user-menu-item" role="menuitem"
                onClick={() => { go("Profile"); setUserMenu(false); }}>
                <Icon name="profile" />Profile
              </button>
              <button className="user-menu-item" role="menuitem" onClick={logout}>
                <Icon name="logout" />Log out
              </button>
            </div>
          )}
          <button className={`user-chip ${page === "Profile" || userMenu ? "active" : ""}`}
            aria-haspopup="menu" aria-expanded={userMenu}
            onClick={() => setUserMenu((open) => !open)}>
            <span className="avatar">{user.username.charAt(0).toUpperCase()}</span>
            <span className="user-chip-text">
              <b>{user.username}</b>
              <small>{ROLE_LABEL[user.role]}</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><h1>{page}</h1><p>FleetFlow / {page}</p></div>
          <span className="online">
            {user.username} · {ROLE_LABEL[user.role]}
          </span>
        </header>

        {error && <div className="error-message">{error}</div>}

        {page === "Dashboard" && <Dashboard user={user} canEdit={canEdit} go={go} setError={setError} />}
        {page === "Vehicles" && <Vehicles canEdit={canEdit} setError={setError} />}
        {page === "Drivers" && <Drivers canEdit={canEdit} setError={setError} onOpen={canDispatch ? openDriver : undefined} />}
        {page === "Driver Profile" && user.role === "driver" && (
          <DriverProfile key="own" driverId={null} showBack={false} setError={setError} />
        )}
        {page === "Driver Profile" && canDispatch && profileDriver != null && (
          <DriverProfile key={profileDriver} driverId={profileDriver} showBack
            onBack={() => go("Drivers")} setError={setError} />
        )}
        {page === "Trips" && <Trips canDispatch={canDispatch} setError={setError} />}
        {page === "Shipments" && <Shipments canDispatch={canDispatch} setError={setError} />}
        {page === "Driver Assignment" && canDispatch && <DriverAssignment setError={setError} />}
        {page === "Notifications" && <Notifications go={go} setError={setError} />}
        {page === "Reports" && canEdit && <Reports setError={setError} />}
        {page === "Fleet Performance" && canEdit && <FleetPerformance setError={setError} />}
        {page === "Fuel Management" && canEdit && <Fuel setError={setError} />}
        {page === "Maintenance" && canEdit && <Maintenance setError={setError} />}
        {page === "Live Tracking" && <LiveMap canEdit={canEdit} setError={setError} />}
        {page === "Users & Roles" && user.role === "admin" && <Users me={user} setError={setError} />}
        {page === "Profile" && <Profile user={user} setUser={setUser} setError={setError} />}
      </main>
    </div>
  );
}

export default App;
