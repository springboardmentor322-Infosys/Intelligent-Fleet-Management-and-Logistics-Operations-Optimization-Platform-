from fastapi.middleware.cors import CORSMiddleware
from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
from app.routers.users import router as users_router
from app.routers.auth import router as auth_router
from app.routers.vehicles import router as vehicles_router
from app.routers.drivers import router as drivers_router
from app.routers.trips import router as trips_router
from app.routers.dashboard import router as dashboard_router
from app.routers.password_reset import router as password_reset_router
from app.routers.driver_locations import router as driver_locations_router
from app.routers.shipments import router as shipments_router
from app.routers.route_preview import router as route_preview_router
from app.routers.maintenance import router as maintenance_router
from app.routers.analytics import router as analytics_router
from app.routers.fuel import router as fuel_router
from contextlib import asynccontextmanager
from app.core.trip_simulation import (
    start_trip_simulation_service,
    stop_trip_simulation_service,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await start_trip_simulation_service()

    yield

    await stop_trip_simulation_service()
    
app = FastAPI(
    title="FleetFlow API",
    description="Intelligent Fleet Management and Logistics Operations Optimization Platform",
    version="1.0.0",
    lifespan=lifespan,
    swagger_ui_parameters={
        "syntaxHighlight": False
    }
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(auth_router)
app.include_router(vehicles_router)
app.include_router(drivers_router)
app.include_router(driver_locations_router)
app.include_router(trips_router)
app.include_router(dashboard_router)
app.include_router(password_reset_router)
app.include_router(shipments_router)
app.include_router(route_preview_router)
app.include_router(maintenance_router)
app.include_router(analytics_router)
app.include_router(fuel_router)

@app.get("/")
def home():
    return {"message": "Welcome to FleetFlow API!"}


@app.get("/db-check")
def check_database(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))

    return {
        "status": "success",
        "message": "FleetFlow is connected to PostgreSQL!",
    }