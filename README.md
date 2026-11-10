# FleetFlow

Fleet management and logistics tracking platform: vehicles, drivers, trips, shipments, live GPS
tracking, route planning with traffic, maintenance, fuel, analytics and reports.

**Stack:** FastAPI + SQLAlchemy + Alembic + PostgreSQL, Redis + Celery for background jobs,
React (Vite) with Leaflet / OpenStreetMap for the map, Docker Compose.

## Roles

| Role | Can do |
|---|---|
| Administrator | everything, including users and roles |
| Fleet Manager | vehicles, drivers, maintenance, fuel, analytics, reports, trips |
| Dispatcher | trips, shipments, driver assignment (read-only elsewhere) |
| Driver | their own profile, notifications and the trips and shipments they can view |

## Run it for development (Windows PowerShell)

```
docker compose up -d                       # PostgreSQL and Redis

cd backend
python -m venv .venv ; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env                     # then set SECRET_KEY (see the comment in the file)
alembic upgrade head                       # create / update the tables
python seed.py                             # sample users, vehicles, drivers, trips, shipments
uvicorn main:app --reload                  # API on http://127.0.0.1:8000  (docs at /docs)

cd ..\frontend
npm install
npm run dev                                # http://localhost:5173
```

Sample logins (from `seed.py`): `admin@fleetflow.com`, `manager@fleetflow.com`,
`dispatcher@fleetflow.com`, `driver@fleetflow.com`; the passwords are printed by the seed script
and defined in it.

Background jobs (maintenance alerts, weekly reports): see `backend/CELERY.md`.
Live GPS demo: run `python simulate_gps.py` while a trip is In Progress.

### Optional settings in `backend/.env`

* `TOMTOM_API_KEY` - live traffic on the map and traffic-aware rerouting (free key from TomTom).
  Without it the map works and routes are planned, but no traffic is shown.
* `ALLOWED_ORIGINS` - comma-separated browser origins allowed to call the API (defaults to the dev server).
* `CELERY_TIMEZONE` - schedule time zone for background jobs (default `Asia/Kolkata`).

## Run everything in containers

```
$env:SECRET_KEY = python -c "import secrets; print(secrets.token_urlsafe(48))"
docker compose --profile app up --build
docker compose exec api python seed.py     # first time only: sample data
```

Frontend on http://localhost:8080, API on http://localhost:8000. The API applies migrations when
it starts. The `api` container must run as a single process: live tracking keeps its browser
connections in memory.

## What is built, by milestone

* **Milestone 1** - JWT login with four roles, vehicle and driver management, fleet dashboard.
* **Milestone 2** - trips with scheduling conflict checks, shipments with allowed status changes
  and history, GPS ingest and live map over WebSocket, route options (shortest, fastest, least
  traffic where traffic data exists), traffic-aware reroute check and reroute, ETA and delay
  flagging (more than 15 minutes behind plan), estimated-vs-actual arrival.
* **Milestone 3** - maintenance scheduling with alerts and reports, driver assignment, fuel
  records and efficiency, operational analytics and the Fleet Performance dashboard, Celery jobs.
* **Also** - driver profiles, notification feed, Excel / PDF reports, Docker and CI.

### Known limits (be honest in the demo)

* Maps are OpenStreetMap, routes come from OSRM's public server (rate limited) and traffic from
  TomTom, not Google Maps.
* A "fuel efficient" route is not offered: it needs a per-vehicle consumption figure, which
  FleetFlow does not store.
* Email, SMS and push notifications are not implemented (they need provider accounts); the
  in-app notification feed is.
* Not deployed to AWS or Azure.

## Tests

From `backend` with the virtual environment active (no database needed):

```
python -m compileall .
Get-ChildItem test_*.py | Where-Object Name -ne "test_db.py" | ForEach-Object { python $_.Name }
```

From `frontend`: `npm run build`. GitHub Actions runs both on every push (`.github/workflows/ci.yml`).

## Demo script

1. Log in as the dispatcher. Create a shipment, plan a trip with the same origin and destination,
   choose a route, attach the shipment.
2. Start the trip, run `python simulate_gps.py`, and watch the vehicle move on Live Tracking
   with its ETA.
3. Use "Reroute check" on the running trip; slow the trip down to see it flagged Delayed.
4. Complete the trip and open the shipment history.
5. As the fleet manager: schedule maintenance on a vehicle (it becomes unavailable for trips),
   add fuel records, open Fleet Performance and download a report.
