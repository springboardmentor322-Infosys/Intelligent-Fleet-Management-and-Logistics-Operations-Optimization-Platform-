
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi import Depends
from app.api.dependencies import require_roles
from app.models.user import User
from app.core.config import settings
from app.core.database import check_database_connection
from app.api.auth import router as auth_router
from app.api.vehicles import router as vehicles_router
from app.api.dashboard import router as dashboard_router
from fastapi.middleware.cors import CORSMiddleware
from app.api.drivers import router as drivers_router
from app.api.admin import router as admin_router
from app.api.shipments import router as shipments_router
from app.api.routes import router as routes_router
from app.api.gps import router as gps_router
from app.api.maintenance import router as maintenance_router
from app.api.operations import router as operations_router
from app.api.fuel import router as fuel_router
from app.api.reports import router as reports_router
from app.api.jobs import router as jobs_router
from app.api.trips import router as trips_router
from app.services.live_gps_simulator import live_simulation_tasks


@asynccontextmanager
async def lifespan(_app):
    if len(settings.SECRET_KEY) < 32:
        raise RuntimeError("SECRET_KEY must be at least 32 characters before starting FleetFlow.")
    yield
    tasks = list(live_simulation_tasks.values())
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan, debug=settings.DEBUG)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in settings.CORS_ORIGINS.split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(vehicles_router)
app.include_router(dashboard_router)
app.include_router(drivers_router)
app.include_router(shipments_router)
app.include_router(admin_router)
app.include_router(routes_router)
app.include_router(gps_router)
app.include_router(maintenance_router)
app.include_router(operations_router)
app.include_router(fuel_router)
app.include_router(reports_router)
app.include_router(jobs_router)
app.include_router(trips_router)
@app.get("/")
def root():
    return {
        "message": "Welcome to FleetFlow",
        "status": "running",
    }


@app.get("/health")
def health():
    try:
        check_database_connection()
        return {
            "status": "healthy",
            "database": "connected",
        }
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        )
@app.get("/admin/test")
def admin_test(
    current_user: User = Depends(
        require_roles("administrator")
    ),
):
    return {
        "message": "Administrator access granted",
        "user": current_user.email,
    }
