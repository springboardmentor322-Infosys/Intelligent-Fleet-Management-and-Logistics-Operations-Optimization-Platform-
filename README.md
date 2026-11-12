# FleetFlow

FleetFlow is a fleet operations application with a FastAPI/SQLAlchemy backend, React/Vite frontend, PostgreSQL storage, and optional Redis-backed background work. It supports fleet, driver, vehicle, shipment history, route estimates, scheduling, maintenance, attendance history, fuel logs, in-app notifications, analytics, reports, and simulated GPS workflows.

## Current capabilities and limits

- Backend APIs: authentication and account settings, administrator overview, vehicles, drivers and attendance history, shipments and status history, routing, GPS history/simulation/WebSockets, maintenance, fuel logs, alerts, analytics, reports, and background jobs.
- Frontend: administrator dashboard, vehicle and driver management, shipment management/history, Route Planning, GPS tracking, maintenance, fuel logs, attendance history, alerts, analytics, and PDF/Excel exports for fleet roles.
- Route estimates use public OSRM and OpenStreetMap Nominatim services. OSRM duration estimates do not include live traffic; alternatives are only reported when returned by OSRM. Public service availability and usage policies apply.
- GPS simulation writes generated positions to the GPS history table and broadcasts them to connected WebSocket clients. These are simulated coordinates, not physical telemetry. WebSocket fanout is process-local; multiple API workers do not share subscribers.
- Shipment status changes are stored in a status-history table. History begins after the additive migration is applied; previous transitions cannot be reconstructed from current shipment rows.
- Fuel logs store actual entered liters, cost, odometer readings, and whether a fill completed a full tank. Full-tank efficiency uses logged liters between consecutive full-tank readings divided by their odometer distance. Empty data is unavailable; values are never fabricated.
- Driver attendance changes are stored as events. Driver on-time performance uses the timestamp of a saved `delivered` status event and its saved ETA, excludes deliveries without an ETA, and reports its sample size.
- Maintenance records support service type, description, service date, optional cost and next due date, plus scheduled/completed/cancelled states. Managers and administrators can create and update records; fleet roles can view history. Due indicators and alerts use the latest completed record per vehicle.
- Current alerts are computed from stored data and displayed in-app. Celery can persist and refresh maintenance reminders; no external notifications are sent. Analytics include status counts, delivery history, fuel purchase totals, full-tank efficiency, and maintenance summaries. Vehicle/driver utilization and route efficiency remain unavailable because their source events are not stored.
- Redis is included in Compose. CRUD and WebSocket APIs do not require Redis; Celery workers and the scheduled reminder scan do.

## Architecture

`backend/app/api` contains FastAPI routers; `models` and `schemas` define persistence and validation; `services` contains routing, GPS fanout, analytics, and notification jobs. Alembic revisions live in `backend/alembic/versions`. The frontend is a Vite app in `frontend/src` and calls the backend through Axios. Compose starts PostgreSQL and Redis; the API and UI run as local development processes. An optional Linux Celery worker and Beat scheduler can run in the `background` Compose profile.

## Prerequisites

- Windows 10/11, VS Code, Python 3.11, Node.js/npm, and Docker Desktop (or a compatible PostgreSQL 18 server).
- Backend settings load from process environment first and then `backend/.env` (relative to the backend working directory). `DATABASE_URL` and `SECRET_KEY` are required; startup requires a signing key of at least 32 characters. Compose requires `DOCKER_POSTGRES_PASSWORD` in the root `.env`. Do not commit real secrets.
- `frontend/.env` may set `VITE_API_URL` (defaults to `http://127.0.0.1:8000`). Backend `CORS_ORIGINS` is a comma-separated list of allowed frontend origins; it defaults to the two local Vite URLs.
- Compose publishes PostgreSQL on host port `5433` (container port `5432`). When the API runs directly on Windows and uses that Compose database, configure `DATABASE_URL` in the untracked `backend/.env` for `127.0.0.1:5433`; a different local PostgreSQL installation may use another port.
- Optional integrations: Redis is required only for Celery. Public OSRM and OpenStreetMap Nominatim are used for route planning and require internet access. OSRM has no live traffic data. Email, SMS, push, and physical GPS providers are not configured.

## Local startup (PowerShell)

From the repository root, start the data services:

```powershell
docker compose up -d postgres
# Optional: Redis is needed only for Celery background tasks.
docker compose up -d redis
```

Activate the backend environment (or create it from `backend` with `py -3.11 -m venv .venv` and install `pip install -r requirements.txt`):

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
$env:SECRET_KEY = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
# Keep this PowerShell session open so the API inherits the generated key.
python -m alembic current
python -m alembic upgrade head
python -m alembic current
uvicorn app.main:app --reload
```

The key command generates 32 random bytes and keeps the resulting key only in this PowerShell process. Run it again in a new development session, or store a generated key in an untracked local environment file. Never print it, paste it into source control, or reuse the development key in production. Set `DEBUG=development` for local debugging; production should set `DEBUG=production` (or `false`) and an explicit trusted `CORS_ORIGINS` list. `DEBUG` defaults to `False`; the same settings class supports both modes.

In a second terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). API docs are at `http://127.0.0.1:8000/docs`; `/health` checks the database connection. Run `python create_admin.py` from `backend` to use the existing administrator setup helper.

## Roles

- `administrator`: administrator APIs and fleet operations; maintenance and driver management.
- `fleet_manager`: fleet operations; maintenance and driver management.
- `dispatcher`: lands on the operational dashboard and can access vehicle, shipment, route, GPS, alert, analytics, maintenance-history, and driver-list pages. Driver creation/editing and maintenance changes require manager/admin roles.
- `driver`: lands on a self-scoped dashboard with their assigned shipments, linked vehicle, status updates, attendance history, inspections, maintenance, persisted GPS location, and authorized route estimates. Drivers cannot read or change another driver's records.

Authorization is checked by backend dependencies; hiding a frontend control is not the security boundary.

Driver creation through the protected Drivers page creates the account and its linked driver profile together. Public `/auth/register` is disabled so it cannot create unlinked driver accounts. Administrators can create dispatcher/fleet-manager accounts from the Admin user directory and add a profile to an existing unlinked driver account after verifying the driver's license number. The initial password is hashed by the backend; share it through an approved secure channel and have the user change it from Account settings after sign-in. Existing role changes and administrator creation are not available in that form.

To reset an existing user's password locally, start the API and frontend, sign in with an administrator account, open Admin > User directory, choose **Reset password** on the exact account row, enter a new password of at least 12 characters, and submit. The endpoint is administrator-only, hashes the new value, and returns no password or hash. Share the new password through an approved secure channel. Then sign out, sign in using the target user's email and new password, and confirm their role-specific dashboard opens. This operation does not change the user role, active state, driver profile, or operational records.

## Database, checks, and migrations

Inspect and confirm the target first with `python -m alembic current` from `backend`; `DATABASE_URL` may point somewhere other than the Compose database. This session did not connect to the configured database or apply the new revisions. The five new additive revisions create shipment status history, fuel logs, driver attendance history, notification events, and vehicle inspections; they do not reset or replace existing tables. Apply with `python -m alembic upgrade head` only after verifying the intended target, then check `python -m alembic current`. Take a database backup before production migrations. Do not reset the database to resolve migration issues.

Compose reports PostgreSQL healthy through `pg_isready` on container port `5432` (host port `5433`). Redis uses `redis-cli ping` on port `6379`; it is optional unless Celery is enabled. Use `docker compose ps` to inspect service health after startup.

```powershell
# backend (uses unittest and a per-test in-memory SQLite database)
.\.venv\Scripts\python.exe -m unittest discover -s tests -v

# frontend
npm run lint
npm run build
```

## Route estimates and GPS simulation

Create or select a shipment, set its scheduled departure, then use **View Route / ETA** for a current OSRM estimate or **Calculate & Save ETA** to persist arrival time relative to the scheduled departure. A successful response includes provider, distance, duration, available alternative count, and explicit traffic-data availability. Route calls need internet access to the public geocoding/routing services.

In GPS Tracking, select a vehicle and shipment ID, then start/stop live simulation. Authorized clients receive saved coordinates over a WebSocket. A simulation runs in the API process and is cancelled when that process shuts down; it is not a durable distributed job. WebSocket fanout is process-local and does not coordinate multiple API workers.

## Maintenance, alerts, and analytics

Fleet managers and administrators can create and update maintenance history; dispatchers can view it. Records include service type, description, service date, optional cost, next due date, and scheduled/completed/cancelled status. Inspection records save a category, checklist, result, notes, inspector, and timestamp. Vehicle health reports show the saved vehicle status, latest completed service, and latest inspection without inventing a synthetic score. Shipment states include delayed and status changes appear in saved history. The dashboard shows upcoming and overdue counts based on each vehicle's latest completed service record. Current alerts are calculated in-app; Celery can also persist maintenance reminders.

## Fuel, attendance, reports, and exports

Administrators and fleet managers can record fuel events from actual receipts. Include liters, total cost, odometer reading, date, and whether the tank was filled completely. The first full-tank entry establishes a baseline. Efficiency uses the total liters logged between two full-tank readings divided by the distance between their odometer values. Fuel cost and volume totals describe logged purchases; they are not inferred consumption.

Attendance history is available from Drivers. Administrators and fleet managers can record present, absent, or leave; dispatchers can view history. Driver performance uses saved delivered status events and saved ETAs. Deliveries without an ETA are excluded from the on-time percentage, and the sample count is displayed.

Analytics exports are available as PDF and Excel (`.xlsx`) for Fleet, Fuel, Driver Performance, Delivery Performance, Maintenance, and Vehicle Inspections. They contain stored values only; legacy delivery transitions without saved history are not reconstructed.

## Celery and Redis (optional)

The maintenance reminder task scans the latest completed service for each vehicle, persists upcoming/overdue in-app reminders, deactivates reminders that no longer apply, and is safe to repeat. Celery Beat runs the scan daily at 00:15 UTC. Administrators can enqueue a scan with `POST /jobs/maintenance-reminders`. Queue outages return HTTP 503; database failures are retried with backoff.

Celery worker processes run in Linux containers because Celery does not support Windows workers. Start Redis and populate the following process environment variables from secure local configuration without placing their values in source control:

```powershell
# Set FLEETFLOW_BACKGROUND_DATABASE_URL and FLEETFLOW_BACKGROUND_SECRET_KEY
# in this process from the secure local configuration before running Compose.
docker compose --profile background up -d --build celery-worker celery-beat
```

The worker database URL must point at the same database used by the API and be reachable from Docker. Do not assume `127.0.0.1` inside a container is the Windows host. The background profile does not apply migrations. Identify the effective database first, then deliberately run `python -m alembic upgrade head` from `backend` and verify with `python -m alembic current`.

## Deployment notes

The included Compose file is for local data services. It does not build or serve the API/frontend as production containers. Production deployment still needs a managed secret store, production database, HTTPS reverse proxy, explicit trusted CORS origins, monitoring, backups, and a reviewed container/runtime setup. `DEBUG` defaults to `False`; set environment variables outside source control. The current local signing-key setting must be replaced with a randomly generated key of at least 32 characters before the API will start. Apply migrations as a deliberate release step, not by dropping/recreating tables.

## Known limitations

- No assignment-duration or working-time history is stored, so vehicle/driver utilization remains unavailable. Route outcomes are not stored, so route efficiency is unavailable.
- Existing shipments do not have reconstructed status history. ETA-backed driver analytics only include delivery events recorded after the history migration.
- No live traffic data; no routing API key is needed, but public OSRM/Nominatim can be rate-limited or unavailable.
- Route durations are OSRM estimates and do not include live traffic; traffic avoidance, fuel-efficient routing, and a traffic-aware provider are not implemented.
- Email, SMS, push notifications, and physical GPS feeds need provider/device configuration and are not implemented.
- Live simulation state and WebSocket fanout are process-local. Multiple API workers do not coordinate them.
- Cloud deployment and production runtime verification have not been completed.

