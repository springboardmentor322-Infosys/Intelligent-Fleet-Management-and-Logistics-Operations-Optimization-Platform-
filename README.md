# FleetFlow — Milestone 1 starter

FleetFlow is a starter implementation for the Milestone 1 brief:
- Landing page inspired by the supplied FleetFlow reference image
- Login and registration pages
- FastAPI backend with JWT authentication and role selection
- PostgreSQL database via Docker Compose
- Password hashing
- Basic authenticated `/api/auth/me` endpoint

> This is a development starter, not production-ready. Before deployment, add email verification, password reset, rate limiting, HTTPS, stronger secret management, audit logging, and a proper admin-controlled role assignment flow. The public registration form currently allows role selection for local demonstration only.

## Stack
- Frontend: React + Vite + plain CSS
- Backend: Python FastAPI, SQLAlchemy, PostgreSQL, JWT
- Local services: Docker Compose (PostgreSQL and Redis)
- Redis is included for the Milestone 1 architecture setup; this starter does not yet use it for session storage.

## Prerequisites (Windows)
1. Install Node.js LTS: https://nodejs.org/
2. Install Python 3.11 or 3.12: https://www.python.org/downloads/
3. Install Git: https://git-scm.com/downloads
4. Install Docker Desktop: https://www.docker.com/products/docker-desktop/
5. Open the folder in VS Code.

## Run the database services
In the VS Code terminal at the project root:
```powershell
docker compose up -d
```
Check:
```powershell
docker compose ps
```

## Run the backend
Open Terminal 1 in VS Code:
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```
If PowerShell blocks activation, run this for the current terminal only:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```
Backend API docs: http://127.0.0.1:8000/docs

## Run the frontend
Open Terminal 2 in VS Code at the project root:
```powershell
cd frontend
npm install
npm run dev
```
Open the local URL printed by Vite, usually http://localhost:5173.

## Test the flow
1. Open the frontend URL.
2. Click Get Started or Login.
3. Choose Register and create a demo account.
4. Log in with that email and password.
5. After login, the demo dashboard appears.
6. Use the browser developer console / Network tab or API docs to inspect requests.

## Git workflow
Check your branch before committing:
```powershell
git branch
git status
git add frontend backend docker-compose.yml README.md
git commit -m "Build FleetFlow landing and authentication starter"
git push
```
Do not push directly to `main`; work on your individual internship branch.

## Troubleshooting
- `docker` not recognized: install/start Docker Desktop and reopen VS Code.
- `npm` not recognized: install Node.js LTS and restart VS Code.
- `py` not recognized: install Python and enable the PATH option.
- DB connection error: wait for PostgreSQL to finish starting; check `docker compose ps`.
- `CORS` error: keep frontend on `http://localhost:5173` and backend on `http://127.0.0.1:8000`.
- `Invalid credentials`: register first, then use the same email/password.


## Simulated GPS tracking (added)
After logging in, the Fleet Monitoring Dashboard includes a Live GPS Tracking panel. It polls `GET /api/tracking/vehicles` every four seconds using the current bearer token. The endpoint returns demo coordinates, speed, status, and timestamps for sample vehicles. The dashboard map is a schematic visualization, not a real street map. No physical GPS tracker or Google Maps key is required.

To test: start PostgreSQL/Redis with `docker compose up -d`, start the FastAPI backend, start the Vite frontend, log in, and scroll to **Live GPS Tracking**. You can also open `http://127.0.0.1:8000/docs` and call `GET /api/tracking/vehicles` with a bearer token obtained from login/register.


## Enhanced role-based workspace and map GPS (added)
The dashboard now uses a persistent left-side workspace navigation. Available sections depend on the authenticated account role:
- Administration: overview, user management, vehicles, live GPS, analytics, maintenance, settings.
- Fleet Manager: overview, vehicles, drivers, live GPS, trips/routes, shipments, maintenance, fuel, analytics, notifications, settings.
- Dispatcher: overview, trip dispatch, live GPS, vehicles, drivers, shipments, notifications.
- Driver: personal dashboard, assigned trip, GPS, deliveries, notifications, trip history, profile.

The Live GPS section uses an OpenStreetMap street map (internet connection required) with vehicle markers and popups. The browser polls the authenticated tracking API every four seconds. The default feed is **simulated GPS** for development and milestone demonstration; it is not a physical tracker.

### Connect a physical GPS device
1. Set `GPS_DEVICE_API_KEY` in `backend/.env` to a long random secret. Keep this key private and configure the same key in your trusted GPS gateway/device integration.
2. Restart FastAPI with `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`.
3. Send tracker updates to `POST http://YOUR_BACKEND_HOST:8000/api/tracking/ingest` with header `X-Device-Key: YOUR_SECRET` and JSON body:
```json
{
  "vehicle_id": "TRK-101",
  "driver": "Arjun Rao",
  "latitude": 16.5062,
  "longitude": 80.6480,
  "speed_kmh": 42,
  "status": "In Transit"
}
```
4. The dashboard will display recent device readings in preference to simulated coordinates for the same vehicle. Device readings older than 120 seconds are treated as stale.

Example PowerShell request (replace the host/key and values):
```powershell
$headers = @{ "X-Device-Key" = "YOUR_SECRET" }
$body = @{
  vehicle_id = "TRK-101"
  driver = "Arjun Rao"
  latitude = 16.5062
  longitude = 80.6480
  speed_kmh = 42
  status = "In Transit"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/tracking/ingest" -Headers $headers -ContentType "application/json" -Body $body
```

GPS readings are held in backend process memory in this starter and are lost when the API restarts. For production, store device telemetry in PostgreSQL/TimescaleDB or another time-series store, use HTTPS, rotate device keys, and authenticate each device separately. OpenStreetMap tiles are provided by community infrastructure and are subject to its usage policy.

### Install and run the enhanced frontend
Because the map uses React Leaflet, install the new dependencies after replacing the project files:
```powershell
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```
Run the backend from another terminal:
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Use the same hostname/IP for frontend and backend access. The frontend automatically builds its API URL from the hostname in the browser address bar. For a custom API host, set `VITE_API_URL` in `frontend/.env`.


## Additional workspace features

This update adds the following development features:

- **Trip route planning:** POST `/api/routes/plan` geocodes origin/destination and asks OSRM for driving route alternatives. The shortest-distance road alternative is recommended.
- **Traffic-aware routing:** Set `GOOGLE_ROUTES_API_KEY` in `backend/.env` to use Google's `TRAFFIC_AWARE_OPTIMAL` routing. Without that key, the OSRM fallback applies a clearly labelled congestion time estimate; it is not live traffic data. Enable the Google Routes API and restrict the key in Google Cloud before use.
- **Dashboard graphs:** Role-specific overview headings with fleet activity bars and fleet availability charts. Metrics are based on the current demo records.
- **Shipment management:** Create, edit, search and delete shipment records from the Shipments section. In this starter release, shipment changes are persisted in the browser's local storage, not the server database.
- **Driver profiles:** The Drivers section provides detailed sample driver contact, license, emergency contact, assignment and performance information. Replace demo values with verified driver records before production.

### Route planning API example

`POST /api/routes/plan` JSON body:

```json
{
  "origin": "Vijayawada, Andhra Pradesh",
  "destination": "Guntur, Andhra Pradesh",
  "traffic_level": "moderate"
}
```

Traffic levels accepted: `low`, `moderate`, `heavy`. The OSRM fallback needs backend internet access for Nominatim geocoding and OSRM routing.
