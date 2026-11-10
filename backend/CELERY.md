# Background jobs (Celery)

FleetFlow runs these jobs automatically, so nobody has to run them by hand:

| Job | When | What it does |
|---|---|---|
| `tasks.check_maintenance` | every day 06:00 | creates / escalates / resolves maintenance alerts |
| `tasks.notify_maintenance` | every day 06:05 | lists vehicles close to or past their service date (worker log) |
| `tasks.generate_maintenance_report` | Mondays 07:00 | Excel report saved in `backend/reports/` |
| `tasks.generate_fuel_report` | Mondays 07:10 | Excel report saved in `backend/reports/` |
| `tasks.refresh_analytics` | every hour | fleet performance snapshot stored in Redis |

Times use `CELERY_TIMEZONE` (default `Asia/Kolkata`). Delivering the notifications to users
(in-app, email, SMS) is part of the notifications module, which is not built yet.

## Start (Windows PowerShell)

Redis must be running: `docker compose up -d` from the project folder.

Open two terminals in `E:\FleetFlow\backend` with the virtual environment active:

```
pip install -r requirements.txt
celery -A celery_app worker --loglevel=info --pool=solo
celery -A celery_app beat --loglevel=info
```

`--pool=solo` is needed on Windows. Leave both windows open; the worker runs the jobs and
Beat decides when.

## Check that it works

1. Worker and Redis connected: `python -c "from tasks import ping; print(ping.delay().get(timeout=10))"` prints `pong`.
2. Run a job once without a worker: `python -c "import tasks; print(tasks.check_maintenance())"`.
3. Watch Beat trigger jobs quickly: stop Beat, then
   `$env:CELERY_BEAT_FAST="1"; celery -A celery_app beat --loglevel=info`
   and watch the worker log: the maintenance check, notifications and analytics refresh
   run every 30 seconds. Close the window afterwards so the normal schedule is used again.
4. Failure handling: stop the database container, run `tasks.check_maintenance.delay()`;
   the worker log shows the task being retried (up to 3 times) instead of being lost.
