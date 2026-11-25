import React, { useEffect, useState } from "react";
import {
  Truck, Users, MapPin, Share2, Wrench, ChartNoAxesColumnIncreasing,
  ArrowRight, CircleCheck, Play, Search, Eye, EyeOff, Mail, LockKeyhole,
  Gauge, Menu, X, PackageCheck, Route, Fuel, LogOut, ShieldCheck, Radio, Activity, RefreshCw,
  Bell, Settings, CalendarDays, Navigation, AlertTriangle, Clock3, MapPinned, Pencil, Trash2, Phone, FileText, Award, ShieldCheck as ShieldIcon
} from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Uses the same host as the frontend, so localhost and LAN-IP access both work.
const API = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`;
const features = [
  { title: "Vehicle Management", text: "Register, monitor and manage your entire fleet.", icon: Truck, color: "blue" },
  { title: "Driver Management", text: "Manage driver details, assign trips and track performance.", icon: Users, color: "green" },
  { title: "Real-Time Tracking", text: "Track vehicles and shipments in real time.", icon: MapPin, color: "purple" },
  { title: "Route Optimization", text: "Get the most efficient routes with traffic-aware navigation.", icon: Share2, color: "orange" },
  { title: "Maintenance Management", text: "Schedule services and get timely maintenance alerts.", icon: Wrench, color: "pink" },
  { title: "Analytics & Reports", text: "Gain insights to improve efficiency and reduce costs.", icon: ChartNoAxesColumnIncreasing, color: "yellow" },
];
const roles = ["Admin", "Fleet Manager", "Dispatcher", "Driver"];

function Brand({ light = false }) {
  return <div className={`brand ${light ? "brand-light" : ""}`}><Truck size={37} strokeWidth={2.5}/><span>Fleet<b>Flow</b></span></div>;
}

function Landing({ navigate }) {
  return <>
    <header className="nav wrap">
      <a className="brand-link" href="#" onClick={e => {e.preventDefault(); navigate("home");}}><Brand /></a>
      <nav><a className="active" href="#home">Home</a><a href="#features">Features</a><a href="#workflow">Solutions</a><a href="#stats">Pricing</a><a href="#about">About</a><a href="#contact">Contact</a></nav>
      <div className="nav-actions"><button className="icon-btn" aria-label="Search"><Search size={19}/></button><button className="btn btn-glass" onClick={() => navigate("login")}>Login</button><button className="btn btn-primary" onClick={() => navigate("register")}>Get Started <ArrowRight size={17}/></button><button className="icon-btn mobile-menu" aria-label="Menu"><Menu/></button></div>
    </header>
    <main>
      <section className="hero" id="home">
        <div className="hero-photo"></div><div className="hero-shade"></div>
        <div className="hero-inner wrap">
          <div className="hero-copy">
            <div className="eyebrow"><span className="pulse"></span> SMART LOGISTICS FOR A BETTER TOMORROW</div>
            <h1>Move Smarter.<br/>Manage <em>Further.</em></h1>
            <p>FleetFlow is a centralized fleet management and logistics tracking platform that helps you monitor vehicles, manage drivers, optimize routes and track shipments in real time.</p>
            <div className="hero-buttons"><button className="btn btn-primary btn-large" onClick={() => navigate("register")}>Get Started <ArrowRight size={18}/></button><a className="btn btn-outline btn-large" href="#workflow"><Play size={17} fill="currentColor"/> Watch Demo</a></div>
            <div className="hero-checks"><span><CircleCheck/> Real-Time Tracking</span><span><CircleCheck/> Optimized Routes</span><span><CircleCheck/> Lower Costs</span><span><CircleCheck/> Higher Efficiency</span></div>
          </div>
          <div className="tracking-card glass-card"><div className="card-head"><strong>Live Vehicle Tracking</strong><span className="live"><i/> Live</span></div><div className="map-art"><div className="map-road road-a"></div><div className="map-road road-b"></div><span className="map-pin pin-a"></span><span className="map-pin pin-b"></span><span className="truck-chip"><Truck size={17}/> TRK-101 <small>65 km/h</small></span></div><div className="route-meta"><span>Bangalore <ArrowRight size={13}/> Hyderabad</span><b>2h 30m</b></div></div>
          <div className="performance-card glass-card"><div className="card-head"><strong>Fleet Performance</strong><small>This Month⌄</small></div><div className="performance-content"><div className="donut"><b>78%</b></div><div className="legend"><span><i className="blue-dot"/> On Time <b>78%</b></span><span><i className="pink-dot"/> Delayed <b>12%</b></span><span><i className="green-dot"/> In Transit <b>10%</b></span></div></div></div>
          <div className="hero-note">Every Shipment<br/>A Brighter<br/>Tomorrow</div>
        </div>
      </section>
      <section className="features wrap" id="features">{features.map(({title,text,icon:Icon,color})=><article className={`feature-card ${color}`} key={title}><div className="feature-icon"><Icon size={25}/></div><h3>{title}</h3><p>{text}</p><button aria-label={`Explore ${title}`} onClick={() => navigate("login")}><ArrowRight size={18}/></button></article>)}</section>
      <section className="stats wrap" id="stats"><div className="stat"><span className="stat-icon"><Truck/></span><div><strong>500+</strong><small>Vehicles Managed</small></div></div><div className="stat"><span className="stat-icon"><Users/></span><div><strong>200+</strong><small>Active Drivers</small></div></div><div className="stat"><span className="stat-icon"><PackageCheck/></span><div><strong>1,000+</strong><small>Shipments Delivered</small></div></div><div className="stat"><span className="stat-icon"><ChartNoAxesColumnIncreasing/></span><div><strong>30%</strong><small>Lower Operational Costs</small></div></div><div className="stat-note">Expanding Smarter Logistics Across INDIA <ArrowRight size={17}/></div></section>
      <section className="workflow wrap" id="workflow"><div className="workflow-copy"><span className="section-kicker">HOW IT WORKS</span><h2>From Planning to Delivery<br/>All <em>in One Platform</em></h2><p>FleetFlow simplifies your logistics operations with a seamless workflow from vehicle management to real-time tracking and analytics.</p></div><div className="steps">{[{icon:Truck,title:"1. Manage Fleet",text:"Register vehicles and driver details"},{icon:Route,title:"2. Plan Routes",text:"Get optimized routes with live traffic"},{icon:MapPin,title:"3. Track in Real Time",text:"Monitor vehicles and shipments live"},{icon:ChartNoAxesColumnIncreasing,title:"4. Analyze & Improve",text:"View detailed reports and make better decisions"}].map(({icon:Icon,title,text})=><div className="step" key={title}><div><Icon/></div><b>{title}</b><p>{text}</p></div>)}</div></section>
      <footer id="contact"><div className="wrap footer-inner"><Brand/><span>Smarter journeys. Better logistics.</span><span>© 2026 FleetFlow · Milestone 1 demo</span></div></footer>
    </main>
  </>;
}

function AuthPage({ mode, navigate, onAuthenticated }) {
  const [fullName,setFullName] = useState("");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [role,setRole] = useState("Fleet Manager");
  const [showPassword,setShowPassword] = useState(false);
  const [remember,setRemember] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const isRegister = mode === "register";
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`${API}/api/auth/${isRegister ? "register" : "login"}`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify(isRegister ? {full_name:fullName,email,password,role} : {email,password})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Unable to sign in. Please try again.");
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem("fleetflow_token",data.access_token);
      storage.setItem("fleetflow_user",JSON.stringify(data.user));
      onAuthenticated(data.user);
    } catch (err) {
      setError(err.message.includes("Failed to fetch") ? "Cannot connect to the FleetFlow API. Start FastAPI and check the backend URL." : err.message);
    } finally { setBusy(false); }
  }
  return <div className="auth-layout">
    <aside className="auth-visual"><div className="auth-bg"></div><div className="auth-visual-content"><button className="auth-brand-button" onClick={() => navigate("home")}><Brand light/></button><h2>Fleet Management &amp; Logistics Tracking Platform</h2><p>Manage your vehicles, drivers, shipments and routes efficiently with real-time tracking and powerful analytics.</p><div className="auth-benefits">{[{icon:Truck,title:"Vehicle Management",text:"Register, monitor and manage your entire fleet.",color:"green"},{icon:Users,title:"Driver Management",text:"Manage driver details and assign trips.",color:"blue"},{icon:MapPin,title:"Real-Time Tracking",text:"Track vehicles and shipments in real time.",color:"purple"},{icon:ChartNoAxesColumnIncreasing,title:"Analytics & Reports",text:"Gain insights to improve efficiency and reduce costs.",color:"orange"}].map(({icon:Icon,title,text,color})=><div className="auth-benefit" key={title}><div className={color}><Icon/></div><section><b>{title}</b><p>{text}</p></section></div>)}</div></div></aside>
    <main className="auth-panel"><button className="back-home" onClick={() => navigate("home")}>← Back to home</button><div className="auth-form-wrap"><div className="auth-heading"><div className="auth-mobile-brand"><Brand/></div><h1>{isRegister ? "Create Your Account" : "Welcome Back"}</h1><p>{isRegister ? "Join FleetFlow and simplify your fleet operations" : "Login to your FleetFlow account"}</p></div>
      <form onSubmit={submit}>
        {isRegister && <label>Full Name<div className="field"><Users size={18}/><input required minLength="2" value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Enter your full name" autoComplete="name"/></div></label>}
        <label>Email Address<div className="field"><Mail size={18}/><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Enter your email" autoComplete="email"/></div></label>
        <label>Password<div className="field"><LockKeyhole size={18}/><input required minLength="8" type={showPassword ? "text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder={isRegister ? "Create a password (8+ characters)" : "Enter your password"} autoComplete={isRegister ? "new-password":"current-password"}/><button type="button" className="show-password" onClick={()=>setShowPassword(!showPassword)} aria-label="Toggle password visibility">{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
        {isRegister && <label>Account Role<div className="field select-field"><ShieldCheck size={18}/><select value={role} onChange={e=>setRole(e.target.value)}>{roles.map(r=><option key={r}>{r}</option>)}</select></div><small className="field-note">Demo only: production roles should be assigned by an administrator.</small></label>}
        {!isRegister && <div className="form-options"><label className="remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> Remember me</label><button type="button" className="text-link" onClick={()=>setError("For this starter, contact your project administrator to reset your password.")}>Forgot password?</button></div>}
        {error && <div className="error-message" role="alert">{error}</div>}
        <button className="btn btn-primary submit-btn" disabled={busy}>{busy ? "Please wait..." : isRegister ? "Create Account" : "Login"} <ArrowRight size={17}/></button>
      </form>
      <div className="auth-switch">{isRegister ? "Already have an account?" : "Don't have an account?"} <button onClick={()=>navigate(isRegister ? "login":"register")}>{isRegister ? "Login":"Register now"}</button></div>
      <div className="auth-security"><ShieldCheck size={16}/> Your account credentials are sent securely to the local API and passwords are hashed before storage.</div>
    </div></main>
  </div>;
}



const demoDrivers = [
  {name:"Arjun Rao",id:"DRV-001",vehicle:"TRK-101",phone:"+91 98765 43210",email:"arjun.rao@fleetflow.demo",status:"On Trip",license:"AP0520190001234",licenseType:"Heavy Motor Vehicle",licenseExpiry:"2028-06-30",experience:8,emergencyContact:"+91 98765 40001",address:"Benz Circle, Vijayawada, Andhra Pradesh",trips:186,rating:4.8,currentTrip:"TRP-001 · Bengaluru to Hyderabad",joined:"2021-04-12"},
  {name:"Priya Reddy",id:"DRV-002",vehicle:"VAN-204",phone:"+91 98765 43211",email:"priya.reddy@fleetflow.demo",status:"Available",license:"AP0520200002345",licenseType:"LMV / Transport",licenseExpiry:"2027-11-18",experience:5,emergencyContact:"+91 98765 40002",address:"MVP Colony, Visakhapatnam, Andhra Pradesh",trips:124,rating:4.9,currentTrip:"No active trip",joined:"2022-02-08"},
  {name:"Kiran Kumar",id:"DRV-003",vehicle:"VAN-417",phone:"+91 98765 43212",email:"kiran.kumar@fleetflow.demo",status:"Available",license:"TS0920180003456",licenseType:"LMV / Transport",licenseExpiry:"2027-03-22",experience:6,emergencyContact:"+91 98765 40003",address:"Hanamkonda, Warangal, Telangana",trips:143,rating:4.7,currentTrip:"No active trip",joined:"2021-09-15"},
  {name:"Ravi Teja",id:"DRV-004",vehicle:"TRK-309",phone:"+91 98765 43213",email:"ravi.teja@fleetflow.demo",status:"Off Duty",license:"AP0520170004567",licenseType:"Heavy Motor Vehicle",licenseExpiry:"2027-08-10",experience:9,emergencyContact:"+91 98765 40004",address:"Guntur, Andhra Pradesh",trips:211,rating:4.6,currentTrip:"No active trip",joined:"2020-11-02"},
];

const roleMenus = {
  admin: [
    [Gauge,"Overview"],[Users,"User Management"],[Truck,"Vehicles"],[Users,"Drivers"],
    [MapPinned,"Live GPS Tracking"],[ChartNoAxesColumnIncreasing,"Analytics & Reports"],
    [Wrench,"Maintenance"],[Settings,"Settings"]
  ],
  "fleet manager": [
    [Gauge,"Overview"],[Truck,"Vehicles"],[Users,"Drivers"],
    [MapPinned,"Live GPS Tracking"],[Route,"Trips & Routes"],[PackageCheck,"Shipments"],
    [Wrench,"Maintenance"],[Fuel,"Fuel Management"],[ChartNoAxesColumnIncreasing,"Analytics & Reports"],
    [Bell,"Notifications"],[Settings,"Settings"]
  ],
  dispatcher: [
    [Gauge,"Overview"],[Route,"Trip Dispatch"],[MapPinned,"Live GPS Tracking"],
    [Truck,"Vehicles"],[Users,"Drivers"],[PackageCheck,"Shipments"],
    [Bell,"Notifications"]
  ],
  driver: [
    [Gauge,"My Dashboard"],[Route,"My Trip"],[MapPinned,"GPS Tracking"],
    [PackageCheck,"Deliveries"],[Bell,"Notifications"],[Clock3,"Trip History"],[Users,"My Profile"]
  ]
};

function GPSMap({vehicles}) {
  const points = vehicles.filter(v => Number.isFinite(Number(v.latitude)) && Number.isFinite(Number(v.longitude)));
  return <div className="leaflet-map-wrap">
    <MapContainer center={[16.2,78.2]} zoom={5} scrollWheelZoom className="leaflet-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((v) => <CircleMarker
        key={v.vehicle_id}
        center={[Number(v.latitude),Number(v.longitude)]}
        radius={9}
        pathOptions={{color:v.status==="Idle" ? "#64748b" : "#0877e8",fillColor:v.status==="Idle" ? "#94a3b8" : "#1685f8",fillOpacity:.9,weight:3}}
      >
        <Tooltip permanent>{v.vehicle_id}</Tooltip>
        <Popup>
          <strong>{v.vehicle_id}</strong><br/>
          Driver: {v.driver || "Not assigned"}<br/>
          Status: {v.status}<br/>
          Speed: {v.speed_kmh ?? 0} km/h<br/>
          Coordinates: {Number(v.latitude).toFixed(5)}, {Number(v.longitude).toFixed(5)}<br/>
          Source: {v.source === "device" ? "GPS device" : "Demo simulation"}
        </Popup>
      </CircleMarker>)}
    </MapContainer>
  </div>;
}

function GPSTrackingPanel() {
  const [tracking,setTracking] = useState([]);
  const [updatedAt,setUpdatedAt] = useState(null);
  const [trackingError,setTrackingError] = useState("");
  const [loading,setLoading] = useState(true);
  const [mode,setMode] = useState("simulation");

  useEffect(() => {
    let cancelled = false;
    async function refreshLocations() {
      const token = localStorage.getItem("fleetflow_token") || sessionStorage.getItem("fleetflow_token");
      if (!token) {
        if (!cancelled) { setTrackingError("Please log in again to view vehicle tracking."); setLoading(false); }
        return;
      }
      try {
        const response = await fetch(`${API}/api/tracking/vehicles`,{headers:{Authorization:`Bearer ${token}`}});
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Could not load tracking data.");
        if (!cancelled) {
          setTracking(data.vehicles || []);
          setUpdatedAt(data.updated_at);
          setMode(data.mode || "simulation");
          setTrackingError("");
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setTrackingError(error.message.includes("Failed to fetch") ? `Cannot connect to ${API}. Start FastAPI and check network access.` : error.message);
          setLoading(false);
        }
      }
    }
    refreshLocations();
    const timer = window.setInterval(refreshLocations,4000);
    return () => {cancelled=true;window.clearInterval(timer);};
  },[]);

  const displayTime = updatedAt ? new Date(updatedAt).toLocaleTimeString() : "Waiting for first update";
  const liveCount = tracking.filter(v => v.source === "device").length;
  return <section className="workspace-panel gps-workspace-panel">
    <div className="section-heading-row">
      <div><span className="section-kicker">FLEET TELEMETRY</span><h2><Radio size={20}/> Live GPS Tracking</h2><p>Vehicle positions refresh automatically every 4 seconds.</p></div>
      <span className={`gps-live-pill ${mode==="device" ? "device-mode" : ""}`}><i/>{mode==="device" ? "DEVICE DATA" : "SIMULATION MODE"}</span>
    </div>
    {trackingError && <div className="gps-error" role="alert">{trackingError}</div>}
    <div className="gps-summary-strip">
      <span><b>{tracking.length}</b> Vehicles reporting</span>
      <span><b>{tracking.filter(v=>v.status!=="Idle").length}</b> Moving / active</span>
      <span><b>{liveCount}</b> Physical device feeds</span>
      <span><b>4 sec</b> Refresh interval</span>
    </div>
    <div className="real-gps-layout">
      <GPSMap vehicles={tracking}/>
      <div className="gps-vehicle-list">
        <div className="gps-list-head"><strong>Tracked vehicles</strong><span><RefreshCw size={13}/>{loading ? "Connecting" : "Auto-refresh on"}</span></div>
        {tracking.map(v=><article className="gps-vehicle" key={v.vehicle_id}>
          <div className="gps-vehicle-top"><span className="gps-truck-icon"><Truck size={17}/></span><div className="gps-vehicle-name"><b>{v.vehicle_id}</b><small>{v.driver || "Driver not assigned"}</small></div><span className={`gps-status ${v.status==="Idle" ? "idle":"moving"}`}>{v.status}</span></div>
          <div className="gps-reading"><span><small>Speed</small><b>{v.speed_kmh ?? 0} <em>km/h</em></b></span><span><small>Latitude</small><b>{Number(v.latitude).toFixed(4)}</b></span><span><small>Longitude</small><b>{Number(v.longitude).toFixed(4)}</b></span></div>
          <div className="gps-source">{v.source==="device" ? "● Physical GPS device" : "● Simulated development feed"}</div>
        </article>)}
        {!loading && tracking.length===0 && !trackingError && <p className="gps-empty">No vehicle locations received yet.</p>}
      </div>
    </div>
    <div className="gps-footer"><span><Activity size={15}/> <b>Last server update:</b> {displayTime}</span><span>{mode==="device" ? "Device telemetry received by backend" : "Simulated GPS data — connect a hardware tracker for physical live location"}</span></div>
    <div className="gps-integration-note"><b>Hardware integration:</b> Configure <code>GPS_DEVICE_API_KEY</code> in backend/.env, then send each tracker update to <code>POST /api/tracking/ingest</code>. See the included README for the payload example.</div>
  </section>;
}

function DataTable({columns,rows,empty="No records to display."}) {
  return <div className="table-scroll"><table><thead><tr>{columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>
    {rows.length ? rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>) : <tr><td className="empty-row" colSpan={columns.length}>{empty}</td></tr>}
  </tbody></table></div>;
}

function DashboardGraphs({role,vehicles,drivers,shipments,fuelRows}) {
  const bars = [
    {label:"Active vehicles",value:vehicles.filter(v=>["Active","In Transit"].includes(v.status)).length,color:"#2878ed"},
    {label:"Available drivers",value:drivers.filter(d=>d.status==="Available").length,color:"#12b886"},
    {label:"Shipments in transit",value:shipments.filter(x=>x.status.toLowerCase().includes("transit")).length,color:"#8b5cf6"},
    {label:"Fuel entries",value:fuelRows.length,color:"#f59e0b"},
  ];
  const max=Math.max(1,...bars.map(x=>x.value));
  const heading=role==="driver"?"My performance snapshot":role==="dispatcher"?"Dispatch performance":role==="admin"?"Platform operations":"Fleet performance";
  return <section className="workspace-panel dashboard-graphs">
    <div className="panel-title"><div><h2>{heading}</h2><p>Live workspace metrics based on the records currently available.</p></div><span className="chart-period">CURRENT WORKSPACE</span></div>
    <div className="chart-grid">
      <div className="chart-card"><h3>Operations overview</h3><div className="vertical-bars">{bars.map(b=><div className="vertical-bar-item" key={b.label}><div className="bar-value">{b.value}</div><div className="bar-track"><span style={{height:`${Math.max(5,b.value/max*100)}%`,background:b.color}}/></div><small>{b.label}</small></div>)}</div></div>
      <div className="chart-card"><h3>Fleet availability</h3><div className="availability-chart"><div className="availability-ring" style={{background:`conic-gradient(#12b886 0 ${vehicles.length?vehicles.filter(v=>["Active","In Transit"].includes(v.status)).length/vehicles.length*100:0}%, #e8edf5 0)`}}><div><b>{vehicles.length?Math.round(vehicles.filter(v=>["Active","In Transit"].includes(v.status)).length/vehicles.length*100):0}%</b><small>Active fleet</small></div></div><div className="chart-legend"><span><i className="legend-green"/> Active / transit <b>{vehicles.filter(v=>["Active","In Transit"].includes(v.status)).length}</b></span><span><i className="legend-grey"/> Idle / service <b>{vehicles.filter(v=>!["Active","In Transit"].includes(v.status)).length}</b></span><span><i className="legend-purple"/> Total drivers <b>{drivers.length}</b></span></div></div></div>
    </div>
  </section>;
}

function RoutePlanner({}) {
  const [origin,setOrigin]=useState("Vijayawada, Andhra Pradesh");
  const [destination,setDestination]=useState("Guntur, Andhra Pradesh");
  const [traffic,setTraffic]=useState("moderate");
  const [route,setRoute]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(false);
  async function plan(e){e.preventDefault();setBusy(true);setError("");setRoute(null);setSaved(false);try{
    const token=localStorage.getItem("fleetflow_token")||sessionStorage.getItem("fleetflow_token");
    const res=await fetch(`${API}/api/routes/plan`,{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({origin,destination,traffic_level:traffic})});
    const data=await res.json();if(!res.ok)throw new Error(data.detail||"Unable to calculate route.");setRoute(data);
  }catch(err){setError(err.message.includes("Failed to fetch")?"Route service is unavailable. Check the backend connection.":err.message);}finally{setBusy(false);}}
  return <section className="workspace-panel route-planner"><div className="panel-title"><div><h2><Route size={20}/> Shortest path & traffic-aware planning</h2><p>Compare road distance, estimated travel time and congestion conditions before assigning a trip.</p></div></div>
    <form className="workspace-form route-form" onSubmit={plan}><label>Origin<input required value={origin} onChange={e=>setOrigin(e.target.value)} placeholder="City, state"/></label><label>Destination<input required value={destination} onChange={e=>setDestination(e.target.value)} placeholder="City, state"/></label><label>Traffic condition<select value={traffic} onChange={e=>setTraffic(e.target.value)}><option value="low">Low congestion</option><option value="moderate">Moderate congestion</option><option value="heavy">Heavy congestion</option></select></label><button className="btn btn-primary" disabled={busy}>{busy?"Calculating...":"Find best route"}<ArrowRight size={16}/></button></form>
    {error&&<div className="error-message">{error}</div>}
    {route&&<div className="route-result"><div className="route-result-top"><div><small>RECOMMENDED ROUTE</small><h3>{route.origin} <ArrowRight size={17}/> {route.destination}</h3></div><span className="status status-active">{route.provider_label||"Road route"}</span></div><div className="route-metrics"><article><small>Road distance</small><b>{route.distance_km} km</b></article><article><small>Estimated travel time</small><b>{route.traffic_duration_text||route.duration_text}</b></article><article><small>Traffic condition</small><b>{route.traffic_label||traffic}</b></article></div><p className="route-disclaimer">{route.traffic_note}</p><button type="button" className="btn btn-primary route-save-button" onClick={()=>{localStorage.setItem("fleetflow_selected_route",JSON.stringify({...route,saved_at:new Date().toISOString()}));setSaved(true);}}>Use this route for trip allocation</button>{saved&&<span className="route-saved-note">Route saved for the next trip allocation.</span>}{route.alternatives?.length>0&&<div className="route-alternatives"><b>Available route alternatives</b>{route.alternatives.map((r,i)=><div key={i}><span>Option {i+1}</span><b>{r.distance_km} km</b><span>{r.duration_text}</span></div>)}</div>}</div>}
    <div className="integration-banner"><Navigation/><div><b>Route allocation</b><p>Use the recommended road route to allocate the trip. Google Routes can provide live traffic-aware routing when a valid API key is configured; OSRM fallback calculates road routes without live traffic data.</p></div></div>
  </section>;
}

function Dashboard({user,onLogout}) {
  const [section,setSection] = useState(() => (user.role || "").toLowerCase() === "driver" ? "My Dashboard" : "Overview");
  const [vehicles,setVehicles] = useState([
    {id:"TRK-101",type:"Heavy Truck",driver:"Arjun Rao",status:"In Transit",location:"Bengaluru → Hyderabad",fuel:"Diesel"},
    {id:"VAN-204",type:"Delivery Van",driver:"Priya Reddy",status:"Active",location:"Bengaluru Warehouse",fuel:"CNG"},
    {id:"TRK-309",type:"Heavy Truck",driver:"Unassigned",status:"Maintenance",location:"Service Center",fuel:"Diesel"},
    {id:"VAN-417",type:"Delivery Van",driver:"Kiran Kumar",status:"Idle",location:"Hyderabad Hub",fuel:"Electric"},
  ]);
  const [drivers] = useState(demoDrivers);
  const [shipments,setShipments] = useState(()=>{try{return JSON.parse(localStorage.getItem("fleetflow_shipments")||"null")||[
    {id:"SHP-001",origin:"Bengaluru",destination:"Hyderabad",vehicle:"TRK-101",status:"In Transit",customer:"Aarav Retail Pvt Ltd",contact:"+91 90000 10001",weight:4200,description:"Consumer electronics",expected:"2026-11-26"},
    {id:"SHP-002",origin:"Vijayawada",destination:"Guntur",vehicle:"VAN-204",status:"Ready for dispatch",customer:"Sri Lakshmi Traders",contact:"+91 90000 10002",weight:850,description:"Packaged groceries",expected:"2026-11-25"},
    {id:"SHP-003",origin:"Hyderabad",destination:"Chennai",vehicle:"Unassigned",status:"Pending",customer:"Metro Components",contact:"+91 90000 10003",weight:2100,description:"Industrial components",expected:"2026-11-28"}
  ];}catch{return [];}});
  const [shipmentForm,setShipmentForm]=useState({id:"",origin:"",destination:"",vehicle:"Unassigned",status:"Pending",customer:"",contact:"",weight:"",description:"",expected:""});
  const [editingShipment,setEditingShipment]=useState(null);
  const [showShipmentForm,setShowShipmentForm]=useState(false);
  const [selectedDriver,setSelectedDriver]=useState(null);
  const [filter,setFilter] = useState("All");
  const [search,setSearch] = useState("");
  const [showAdd,setShowAdd] = useState(false);
  const [newId,setNewId] = useState("");
  const [newType,setNewType] = useState("Heavy Truck");
  const [newDriver,setNewDriver] = useState("");
  const [newFuel,setNewFuel] = useState("Diesel");
  const [notice,setNotice] = useState("");
  const [maintenance,setMaintenance] = useState([{id:"MNT-001",vehicle:"TRK-309",service:"Engine inspection",date:"2026-12-02",status:"Scheduled"}]);
  const [fuelRows,setFuelRows] = useState([{id:"FUEL-001",vehicle:"TRK-101",litres:120,cost:12600,date:"2026-11-22"}]);
  const [newService,setNewService] = useState("");
  const [newServiceVehicle,setNewServiceVehicle] = useState("TRK-101");
  const [newServiceDate,setNewServiceDate] = useState("2026-12-05");
  const [fuelVehicle,setFuelVehicle] = useState("TRK-101");
  const [fuelLitres,setFuelLitres] = useState("50");
  const [fuelCost,setFuelCost] = useState("5250");
  const [query,setQuery] = useState("");
  const [notificationRead,setNotificationRead] = useState(false);

  const role = (user.role || "Fleet Manager").toLowerCase();
  const menu = roleMenus[role] || roleMenus["fleet manager"];
  const title = role==="admin" ? "Administration Workspace" : role==="driver" ? "Driver Workspace" : role==="dispatcher" ? "Dispatcher Workspace" : "Fleet Manager Workspace";
  const activeCount = vehicles.filter(v=>v.status==="Active"||v.status==="In Transit").length;
  const maintenanceCount = vehicles.filter(v=>v.status==="Maintenance").length;
  const unassignedCount = vehicles.filter(v=>v.driver==="Unassigned").length;
  const filtered = vehicles.filter(v=>(filter==="All"||v.status===filter)&&`${v.id} ${v.type} ${v.driver} ${v.location}`.toLowerCase().includes(search.toLowerCase()));
  const isDriver = role==="driver";
  const isAdmin = role==="admin";
  const isDispatcher = role==="dispatcher";
  useEffect(()=>{localStorage.setItem("fleetflow_shipments",JSON.stringify(shipments));},[shipments]);
  function openShipmentForm(item=null){setEditingShipment(item?.id||null);setShipmentForm(item?{...item,weight:String(item.weight??"")}:{id:`SHP-${String(shipments.length+1).padStart(3,"0")}`,origin:"",destination:"",vehicle:"Unassigned",status:"Pending",customer:"",contact:"",weight:"",description:"",expected:""});setShowShipmentForm(true);}
  function saveShipment(e){e.preventDefault();if(!shipmentForm.origin.trim()||!shipmentForm.destination.trim()){setNotice("Origin and destination are required.");return;}const record={...shipmentForm,weight:Number(shipmentForm.weight)||0};setShipments(prev=>editingShipment?prev.map(x=>x.id===editingShipment?record:x):[record,...prev]);setShowShipmentForm(false);setEditingShipment(null);setNotice(editingShipment?"Shipment updated successfully.":"Shipment created successfully.");}
  function deleteShipment(id){if(!window.confirm(`Delete shipment ${id}? This cannot be undone.`))return;setShipments(prev=>prev.filter(x=>x.id!==id));setNotice(`${id} deleted.`);}


  function addVehicle(e) {
    e.preventDefault();
    if (vehicles.some(v=>v.id.toLowerCase()===newId.trim().toLowerCase())) {setNotice("That vehicle ID already exists.");return;}
    setVehicles(prev=>[...prev,{id:newId.trim().toUpperCase(),type:newType,driver:newDriver.trim()||"Unassigned",status:"Idle",location:"Not yet assigned",fuel:newFuel}]);
    setNewId("");setNewDriver("");setShowAdd(false);setNotice("Vehicle added to this workspace. Demo data resets on refresh.");
  }
  function addMaintenance(e) {
    e.preventDefault();
    setMaintenance(prev=>[{id:`MNT-${String(prev.length+1).padStart(3,"0")}`,vehicle:newServiceVehicle,service:newService,date:newServiceDate,status:"Scheduled"},...prev]);
    setNewService("");setNotice("Maintenance schedule added in this session.");
  }
  function addFuel(e) {
    e.preventDefault();
    const litres=Number(fuelLitres),cost=Number(fuelCost);
    if(litres<=0||cost<0){setNotice("Enter valid fuel quantity and cost.");return;}
    setFuelRows(prev=>[{id:`FUEL-${String(prev.length+1).padStart(3,"0")}`,vehicle:fuelVehicle,litres,cost,date:new Date().toISOString().slice(0,10)},...prev]);
    setNotice("Fuel entry added in this session.");
  }

  const sectionIcon = menu.find(x=>x[1]===section)?.[0] || Gauge;
  const SectionIcon = sectionIcon;
  const renderOverview = () => <React.Fragment>
    <div className="workspace-kpis">
      <article><span className="kpi-icon"><Truck/></span><small>Total Vehicles</small><strong>{vehicles.length}</strong><em>Registered in workspace</em></article>
      <article><span className="kpi-icon green"><Activity/></span><small>Active / In Transit</small><strong>{activeCount}</strong><em>Vehicles reporting activity</em></article>
      <article><span className="kpi-icon orange"><Wrench/></span><small>In Maintenance</small><strong>{maintenanceCount}</strong><em>Service attention required</em></article>
      <article><span className="kpi-icon purple"><Users/></span><small>{isAdmin?"Platform Users":"Unassigned Vehicles"}</small><strong>{isAdmin?"4":unassignedCount}</strong><em>{isAdmin?"Role-based workspace access":"Awaiting driver assignment"}</em></article>
    </div>
    <DashboardGraphs role={role} vehicles={vehicles} drivers={drivers} shipments={shipments} fuelRows={fuelRows}/>
    <div className="overview-grid">
      <section className="workspace-panel"><div className="panel-title"><div><h2>Fleet activity</h2><p>Current operational snapshot</p></div><button className="subtle-action" onClick={()=>setSection("Live GPS Tracking")}>Open live map <ArrowRight size={15}/></button></div>
        <div className="activity-list"><div><span className="activity-dot blue"/><p><b>TRK-101</b> is reporting on its Bengaluru–Hyderabad route</p><small>Live feed</small></div><div><span className="activity-dot green"/><p><b>VAN-204</b> is available at Bengaluru warehouse</p><small>Vehicle status</small></div><div><span className="activity-dot orange"/><p><b>TRK-309</b> is scheduled for maintenance</p><small>Service reminder</small></div></div>
      </section>
      <section className="workspace-panel"><div className="panel-title"><div><h2>Quick actions</h2><p>Common workspace tasks</p></div></div><div className="quick-action-grid">
        <button onClick={()=>{setSection("Vehicles");setShowAdd(true);}}><Truck/>Register vehicle</button>
        <button onClick={()=>setSection(isDispatcher?"Trip Dispatch":"Trips & Routes")}><Route/>Plan a trip</button>
        <button onClick={()=>setSection("Maintenance")}><Wrench/>Schedule service</button>
        <button onClick={()=>setSection("Fuel Management")}><Fuel/>Add fuel record</button>
      </div></section>
    </div>
    <section className="workspace-panel"><div className="panel-title"><div><h2>Fleet overview</h2><p>Vehicle status and assignment summary</p></div><button className="subtle-action" onClick={()=>setSection("Vehicles")}>View all vehicles <ArrowRight size={15}/></button></div>
      <DataTable columns={["Vehicle","Type","Assigned driver","Current location","Status"]} rows={vehicles.slice(0,4).map(v=>[<b>{v.id}</b>,v.type,v.driver,v.location,<span className={`status status-${v.status.toLowerCase().replaceAll(" ","-")}`}>{v.status}</span>])}/>
    </section>
  </React.Fragment>;

  const renderSection = () => {
    if(section==="Overview"||section==="My Dashboard") return renderOverview();
    if(section==="Live GPS Tracking"||section==="GPS Tracking") return <GPSTrackingPanel/>;
    if(section==="Vehicles") return <section className="workspace-panel"><div className="panel-title"><div><h2>Vehicle registry</h2><p>Register, search and monitor fleet vehicles.</p></div><button className="btn btn-primary" onClick={()=>setShowAdd(v=>!v)}><Truck size={16}/> Add vehicle</button></div>
      {showAdd&&<form className="workspace-form" onSubmit={addVehicle}><label>Vehicle registration<input required value={newId} onChange={e=>setNewId(e.target.value)} placeholder="e.g. AP 05 TR 5200"/></label><label>Vehicle type<select value={newType} onChange={e=>setNewType(e.target.value)}><option>Heavy Truck</option><option>Delivery Van</option><option>Mini Truck</option><option>Container Truck</option></select></label><label>Driver name<input value={newDriver} onChange={e=>setNewDriver(e.target.value)} placeholder="Optional"/></label><label>Fuel type<select value={newFuel} onChange={e=>setNewFuel(e.target.value)}><option>Diesel</option><option>Petrol</option><option>CNG</option><option>Electric</option></select></label><button className="btn btn-primary">Save vehicle</button></form>}
      <div className="vehicle-tools workspace-tools"><div className="table-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vehicles"/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option><option>Active</option><option>In Transit</option><option>Idle</option><option>Maintenance</option></select></div>
      <DataTable columns={["Vehicle ID","Type","Driver","Location / route","Fuel","Status"]} rows={filtered.map(v=>[<b>{v.id}</b>,v.type,v.driver,v.location,v.fuel,<span className={`status status-${v.status.toLowerCase().replaceAll(" ","-")}`}>{v.status}</span>])}/>
    </section>;
    if(section==="Drivers") return <section className="workspace-panel"><div className="panel-title"><div><h2>Driver directory</h2><p>Detailed driver identity, license, emergency and performance information.</p></div></div><div className="driver-cards">{drivers.map(d=><article key={d.id}><span className="driver-avatar">{d.name.split(" ").map(n=>n[0]).join("")}</span><div><b>{d.name}</b><small>{d.id} · {d.phone}</small><small>Assigned: {d.vehicle} · {d.experience} years experience</small><small>License expires: {d.licenseExpiry}</small></div><span className={`status ${d.status==="On Trip"?"status-in-transit":d.status==="Available"?"status-active":"status-idle"}`}>{d.status}</span><button className="subtle-action" onClick={()=>setSelectedDriver(d)}>Full profile <ArrowRight size={14}/></button></article>)}</div></section>;
    if(section==="User Management") return <section className="workspace-panel"><div className="panel-title"><div><h2>User management</h2><p>Workspace role overview. Account provisioning remains controlled by your authentication service.</p></div></div><DataTable columns={["Name","Role","Access","Status"]} rows={[[user.full_name,user.role,"Workspace access","Active"],["Fleet Operations","Fleet Manager","Fleet operations","Demo"],["Dispatch Team","Dispatcher","Dispatch workspace","Demo"],["Driver Account","Driver","Assigned trips","Demo"]]}/><p className="demo-note">This starter does not yet provide administrator APIs to create, disable or edit other user accounts.</p></section>;
    if(section==="Maintenance") return <section className="workspace-panel"><div className="panel-title"><div><h2>Maintenance planner</h2><p>Schedule vehicle services and track service status.</p></div></div><form className="workspace-form" onSubmit={addMaintenance}><label>Vehicle<select value={newServiceVehicle} onChange={e=>setNewServiceVehicle(e.target.value)}>{vehicles.map(v=><option key={v.id}>{v.id}</option>)}</select></label><label>Service description<input required value={newService} onChange={e=>setNewService(e.target.value)} placeholder="e.g. Engine oil and filter"/></label><label>Scheduled date<input type="date" required value={newServiceDate} onChange={e=>setNewServiceDate(e.target.value)}/></label><button className="btn btn-primary">Schedule maintenance</button></form><DataTable columns={["Reference","Vehicle","Service","Scheduled date","Status"]} rows={maintenance.map(m=>[m.id,m.vehicle,m.service,m.date,<span className="status status-idle">{m.status}</span>])}/></section>;
    if(section==="Fuel Management") return <section className="workspace-panel"><div className="panel-title"><div><h2>Fuel management</h2><p>Record refuelling events and review fuel expenditure.</p></div></div><div className="workspace-kpis compact"><article><small>Total fuel entries</small><strong>{fuelRows.length}</strong></article><article><small>Recorded quantity</small><strong>{fuelRows.reduce((a,r)=>a+r.litres,0)} L</strong></article><article><small>Total spend</small><strong>₹{fuelRows.reduce((a,r)=>a+r.cost,0).toLocaleString("en-IN")}</strong></article></div><form className="workspace-form" onSubmit={addFuel}><label>Vehicle<select value={fuelVehicle} onChange={e=>setFuelVehicle(e.target.value)}>{vehicles.map(v=><option key={v.id}>{v.id}</option>)}</select></label><label>Fuel quantity (litres)<input type="number" min="0.1" step="0.1" value={fuelLitres} onChange={e=>setFuelLitres(e.target.value)}/></label><label>Total cost (₹)<input type="number" min="0" step="0.01" value={fuelCost} onChange={e=>setFuelCost(e.target.value)}/></label><button className="btn btn-primary">Save fuel entry</button></form><DataTable columns={["Reference","Vehicle","Litres","Cost","Date"]} rows={fuelRows.map(r=>[r.id,r.vehicle,r.litres,`₹${r.cost.toLocaleString("en-IN")}`,r.date])}/></section>;
    if(section==="Trips & Routes"||section==="Trip Dispatch"||section==="My Trip") return <><RoutePlanner/><section className="workspace-panel"><div className="panel-title"><div><h2>{isDriver?"My assigned trip":"Trip allocation queue"}</h2><p>Use the recommended shortest road route and traffic estimate before dispatch.</p></div></div><DataTable columns={["Trip ID","Vehicle","Driver","Origin","Destination","Status"]} rows={[[<b>TRP-001</b>,"TRK-101","Arjun Rao","Bengaluru","Hyderabad","In Transit"],["TRP-002","VAN-204","Priya Reddy","Vijayawada","Guntur","Ready"],["TRP-003","TRK-309","Unassigned","Hyderabad","Chennai","Needs driver"]]}/></section></>;
    if(section==="Shipments"||section==="Deliveries") return <section className="workspace-panel"><div className="panel-title"><div><h2>Shipment management</h2><p>Create, update, search and remove shipment records. Changes are saved in this browser.</p></div><button className="btn btn-primary" onClick={()=>openShipmentForm()}><PackageCheck size={16}/> Add shipment</button></div>
      {showShipmentForm&&<form className="workspace-form shipment-form" onSubmit={saveShipment}><div className="form-heading"><b>{editingShipment?`Edit ${editingShipment}`:"Create shipment"}</b><button type="button" className="icon-btn" onClick={()=>setShowShipmentForm(false)} aria-label="Close"><X size={18}/></button></div><label>Shipment ID<input required value={shipmentForm.id} onChange={e=>setShipmentForm({...shipmentForm,id:e.target.value})} disabled={!!editingShipment}/></label><label>Origin<input required value={shipmentForm.origin} onChange={e=>setShipmentForm({...shipmentForm,origin:e.target.value})}/></label><label>Destination<input required value={shipmentForm.destination} onChange={e=>setShipmentForm({...shipmentForm,destination:e.target.value})}/></label><label>Customer<input value={shipmentForm.customer} onChange={e=>setShipmentForm({...shipmentForm,customer:e.target.value})}/></label><label>Contact number<input value={shipmentForm.contact} onChange={e=>setShipmentForm({...shipmentForm,contact:e.target.value})}/></label><label>Assigned vehicle<select value={shipmentForm.vehicle} onChange={e=>setShipmentForm({...shipmentForm,vehicle:e.target.value})}><option>Unassigned</option>{vehicles.map(v=><option key={v.id}>{v.id}</option>)}</select></label><label>Weight (kg)<input type="number" min="0" value={shipmentForm.weight} onChange={e=>setShipmentForm({...shipmentForm,weight:e.target.value})}/></label><label>Status<select value={shipmentForm.status} onChange={e=>setShipmentForm({...shipmentForm,status:e.target.value})}><option>Pending</option><option>Ready for dispatch</option><option>In Transit</option><option>Delivered</option><option>Delayed</option></select></label><label>Expected delivery<input type="date" value={shipmentForm.expected} onChange={e=>setShipmentForm({...shipmentForm,expected:e.target.value})}/></label><label className="wide-field">Description<input value={shipmentForm.description} onChange={e=>setShipmentForm({...shipmentForm,description:e.target.value})}/></label><button className="btn btn-primary">{editingShipment?"Save changes":"Create shipment"}</button></form>}
      <div className="vehicle-tools workspace-tools"><div className="table-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search shipment, customer or route"/></div><span className="shipment-count">{shipments.length} shipments</span></div>
      <DataTable columns={["Shipment","Customer","Origin","Destination","Vehicle","Status","Actions"]} rows={shipments.filter(x=>`${x.id} ${x.customer} ${x.origin} ${x.destination}`.toLowerCase().includes(search.toLowerCase())).map(x=>[<b>{x.id}</b>,x.customer||"—",x.origin,x.destination,x.vehicle,<span className={`status status-${x.status.toLowerCase().replaceAll(" ","-")}`}>{x.status}</span>,<div className="table-actions"><button title="Edit shipment" onClick={()=>openShipmentForm(x)}><Pencil size={15}/></button><button title="Delete shipment" className="delete-action" onClick={()=>deleteShipment(x.id)}><Trash2 size={15}/></button></div>])}/>
    </section>;
    if(section==="Analytics & Reports"||section==="Reports") return <section className="workspace-panel"><div className="panel-title"><div><h2>Fleet analytics</h2><p>Current demo metrics. Connect persistent API records for production reporting.</p></div></div><div className="analytics-bars">{[{label:"Active fleet",value:activeCount,total:vehicles.length},{label:"Maintenance",value:maintenanceCount,total:vehicles.length},{label:"Available drivers",value:drivers.filter(d=>d.status==="Available").length,total:drivers.length},{label:"Fuel entries",value:fuelRows.length,total:Math.max(4,fuelRows.length)}].map(x=><div key={x.label}><span>{x.label}<b>{x.value}</b></span><i><em style={{width:`${Math.min(100,x.total?x.value/x.total*100:0)}%`}}/></i></div>)}</div></section>;
    if(section==="Notifications") return <section className="workspace-panel"><div className="panel-title"><div><h2>Notifications centre</h2><p>Operational alerts and reminders.</p></div><button className="subtle-action" onClick={()=>setNotificationRead(true)}>Mark all read</button></div><div className="notification-list"><article><AlertTriangle/><div><b>Maintenance due · TRK-309</b><p>Vehicle is scheduled for an upcoming service inspection.</p><small>Maintenance reminder</small></div><span>{notificationRead?"Read":"New"}</span></article><article><Clock3/><div><b>Trip update · TRP-001</b><p>Vehicle TRK-101 is currently reporting an active trip.</p><small>Tracking update</small></div><span>Info</span></article></div></section>;
    if(section==="Settings"||section==="My Profile") return <section className="workspace-panel"><div className="panel-title"><div><h2>{section==="Settings"?"Workspace settings":"My profile"}</h2><p>Signed-in account information.</p></div></div><div className="profile-summary"><span className="profile-avatar">{(user.full_name||"U").slice(0,1).toUpperCase()}</span><div><h3>{user.full_name}</h3><p>{user.email}</p><span className="status status-active">{user.role}</span></div></div><div className="settings-note"><ShieldCheck/><p>Authentication is handled by the FastAPI JWT service. Passwords are not displayed in this workspace.</p></div></section>;
    if(section==="Trip History") return <section className="workspace-panel"><div className="panel-title"><div><h2>Trip history</h2><p>Recent completed and active assignments.</p></div></div><DataTable columns={["Trip","Route","Vehicle","Date","Status"]} rows={[["TRP-001","Bengaluru → Hyderabad","TRK-101","24 Nov 2026","In Transit"],["TRP-008","Guntur → Vijayawada","VAN-204","21 Nov 2026","Completed"]]}/></section>;
    return renderOverview();
  };

  return <div className="workspace-shell">
    {selectedDriver&&<div className="modal-backdrop" onClick={()=>setSelectedDriver(null)}><section className="driver-profile-modal" onClick={e=>e.stopPropagation()}><div className="profile-modal-head"><div><span className="driver-avatar large">{selectedDriver.name.split(" ").map(n=>n[0]).join("")}</span><div><h2>{selectedDriver.name}</h2><p>{selectedDriver.id} · {selectedDriver.status}</p></div></div><button className="icon-btn" onClick={()=>setSelectedDriver(null)} aria-label="Close profile"><X/></button></div><div className="driver-profile-stats"><article><b>{selectedDriver.trips}</b><small>Trips completed</small></article><article><b>{selectedDriver.experience} yrs</b><small>Experience</small></article><article><b>★ {selectedDriver.rating}</b><small>Driver rating</small></article></div><div className="driver-detail-grid"><div><small><Mail size={14}/> Email</small><b>{selectedDriver.email}</b></div><div><small><Phone size={14}/> Phone</small><b>{selectedDriver.phone}</b></div><div><small><FileText size={14}/> License number</small><b>{selectedDriver.license}</b></div><div><small><ShieldIcon size={14}/> License category</small><b>{selectedDriver.licenseType}</b></div><div><small><CalendarDays size={14}/> License expiry</small><b>{selectedDriver.licenseExpiry}</b></div><div><small><Phone size={14}/> Emergency contact</small><b>{selectedDriver.emergencyContact}</b></div><div><small><Truck size={14}/> Assigned vehicle</small><b>{selectedDriver.vehicle}</b></div><div><small><Route size={14}/> Current trip</small><b>{selectedDriver.currentTrip}</b></div><div className="wide-field"><small><MapPin size={14}/> Address</small><b>{selectedDriver.address}</b></div><div><small><CalendarDays size={14}/> Joined FleetFlow</small><b>{selectedDriver.joined}</b></div></div><p className="demo-note">Driver profile details are sample records in this starter. Connect a driver database/API to manage verified employee information.</p></section></div>}
    <aside className="workspace-sidebar">
      <div className="sidebar-brand"><Brand light/></div>
      <div className="sidebar-caption">WORKSPACE</div>
      <div className="sidebar-role">{title}</div>
      <nav className="workspace-nav">{menu.map(([Icon,label])=><button key={label} className={`sidebar-item ${section===label ? "selected":""}`} onClick={()=>{setSection(label);setNotice("");}}><Icon size={18}/><span>{label}</span>{label==="Notifications"&&<i className="nav-count">2</i>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-user"><span>{(user.full_name||"U").slice(0,1).toUpperCase()}</span><div><b>{user.full_name}</b><small>{user.role}</small></div></div><button className="sidebar-item logout-item" onClick={onLogout}><LogOut size={18}/> Logout</button></div>
    </aside>
    <div className="workspace-content">
      <header className="workspace-topbar"><div className="breadcrumb">FleetFlow <span>/</span> {section}</div><div className="topbar-right"><span className="workspace-status"><i/> System operational</span><button className="topbar-icon" onClick={()=>setSection("Notifications")} aria-label="Notifications"><Bell size={18}/><i/></button><span className="topbar-user">{user.full_name}</span></div></header>
      <main className="workspace-main">
        <div className="workspace-page-heading"><div><span className="section-kicker">{(user.role||"FLEET").toUpperCase()} WORKSPACE</span><h1>{section==="Overview"||section==="My Dashboard"?title:section}</h1><p>Welcome back, {user.full_name}. Manage your fleet operations from one workspace.</p></div>
          {(section==="Overview"||section==="My Dashboard")&&<div className="heading-date"><CalendarDays size={16}/> {new Date().toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</div>}
        </div>
        {notice&&<div className="notice">{notice}</div>}
        {renderSection()}
        <footer className="workspace-footer">FleetFlow Operations Workspace <span>•</span> GPS updates every 4 seconds <span>•</span> Development build</footer>
      </main>
    </div>
  </div>;
}

function App() {
  const [page,setPage] = useState("home");
  const [user,setUser] = useState(() => {
    try { const raw = localStorage.getItem("fleetflow_user") || sessionStorage.getItem("fleetflow_user"); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  function logout() {
    localStorage.removeItem("fleetflow_token");localStorage.removeItem("fleetflow_user");
    sessionStorage.removeItem("fleetflow_token");sessionStorage.removeItem("fleetflow_user");
    setUser(null);setPage("home");
  }
  if (user && page === "dashboard") return <Dashboard user={user} navigate={setPage} onLogout={logout}/>;
  if (page === "login" || page === "register") return <AuthPage mode={page} navigate={setPage} onAuthenticated={u=>{setUser(u);setPage("dashboard");}}/>;
  if (user && page === "home") return <div className="return-banner"><span>You're signed in as {user.full_name}.</span><button className="btn btn-primary" onClick={()=>setPage("dashboard")}>Open Dashboard <ArrowRight size={16}/></button><button className="text-link" onClick={logout}>Logout</button><Landing navigate={setPage}/></div>;
  return <Landing navigate={setPage}/>;
}

export default App;
