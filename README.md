# FleetFlow — Milestone 2 Complete (React + Python FastAPI + SQLAlchemy + WebSockets)

Complete Milestone 2 implementation featuring **Dedicated Phone-Independent GPS Tracking**, **Real-Time WebSocket Streaming**, **Shipment Tracking Workflow**, **4-Mode Route Optimization & Traffic-Aware Planning**, **Conflict-Checked Trip Scheduling**, **Dynamic ETA Calculation**, and a comprehensive **Driver Profile** module with **3D editing-style transitions**.

## Architecture & Milestone 2 Implementation

1. **Dedicated GPS Device Integration (`POST /api/gps/ping`, `GET /api/gps/latest`, `GET /api/gps/provider-info`)**
   - Hardwired vehicle GPS tracker with M2M 4G LTE SIM transmits coordinates (`vehicleId`, `deviceId`, `lat`, `lng`, `speed`, `timestamp`) directly to FastAPI using `X-Device-Key` authentication—completely independent of the driver's mobile phone.
   - Local development includes a built-in **GPS Device Telemetry Simulator** (`SIMULATED_TELEMATICS`) in the **Live Tracking** tab so test coordinates are clearly distinguished from physical hardware pings.
2. **Real-Time WebSocket Tracking (`WS /ws/tracking`)**
   - Authenticated FastAPI WebSocket server with automatic reconnection and role-based filtering.
   - Updates vehicle markers, speed, trip progress, and shipment ETAs live on the map without refreshing the page.
3. **Shipment Tracking & Delivery Monitoring (`/api/shipments`)**
   - Full status lifecycle: `Created → Assigned → In Transit → Delivered` plus `Delayed` and `Cancelled` transitions.
   - Includes a separate **Delayed Shipments** alert banner, trip assignment selector, actual vs. estimated arrival comparison, and a full status audit timeline.
4. **Route Optimization & Traffic-Aware Planning (`/api/routes/optimize` & `/api/trips/{id}/reroute`)**
   - Real road geometry from OSRM (alternatives + via-point detours, de-duplicated), geocoding via known hubs then OpenStreetMap Nominatim (India). Unknown places return a clear error instead of silently routing from Bengaluru.
   - The backend scores every candidate road and picks **Fastest**, **Traffic-Avoidance** (least modelled congestion), **Shortest** (min km) and **Fuel-Efficient** (lowest L using a speed-dependent consumption curve). Routes that share a road are labelled "Same road as ...".
   - Traffic is **modelled from time of day (IST) and route exposure** — no live traffic feed is connected. Commercial-vehicle speed factor 1.12 over OSRM's car profile.
   - Rerouting a running trip starts from the vehicle's **current position** and keeps the travelled trail. If OSRM is unreachable, curved estimated corridors are used and flagged as approximate in the UI.
5. **Trip Scheduling & Conflict Validation (`POST /api/trips`, `GET /api/trips/{id}`)**
   - Connects one vehicle, one driver, and one optimized route while preventing double-booking (409) of vehicles/drivers that already have an active trip, in-service vehicles, or off-duty drivers.
6. **FleetFlow Driver Profile (`DriverProfilePage.jsx`)**
   - Displays Personal Details (with blank avatar placeholder), License Details & document verification, Assigned Vehicle, Current Trip & Live GPS tracking, Duty Status (`Available`, `On Trip`, `At Stop`, `Off Duty`), Basic Performance metrics, and Admin Actions (`Edit Profile`, `Assign Vehicle`, `Verify Docs`, `Activate / Deactivate`).
7. **Dual Relational & JSON Persistence (`SQLAlchemy` + `data/fleet.json`)**
   - Mirrors shipments, trips, and GPS location pings into SQLAlchemy (`SQLite` by default or `PostgreSQL` via `DATABASE_URL`).

## How to Run

### Terminal 1 — Python FastAPI Backend
```cmd
cd fleetflow-react-python\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Terminal 2 — React Frontend
```cmd
cd fleetflow-react-python\frontend
npm install
npm run dev
```
Open `http://localhost:5173/` in your browser.

## Notes
- The server needs outbound internet access for OSRM/Nominatim; without it, the fallback corridors are used (flagged "estimated").
- GPS pings are snapped to the trip's road path to compute progress, remaining km and ETA.
