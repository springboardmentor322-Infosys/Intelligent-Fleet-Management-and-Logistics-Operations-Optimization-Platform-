import asyncio
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import time
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_FILE = DATA_DIR / "fleet.json"

BENGALURU_HUBS: Dict[str, List[float]] = {
    "Whitefield": [12.9698, 77.7500],
    "Koramangala": [12.9352, 77.6245],
    "Peenya": [13.0285, 77.5197],
    "Yeshwanthpur": [13.0285, 77.5407],
    "Indiranagar": [12.9784, 77.6408],
    "Jayanagar": [12.9250, 77.5838],
    "Electronic City": [12.8452, 77.6602],
    "Hebbal": [13.0358, 77.5970],
    "MG Road": [12.9751, 77.6068],
    "Depot, Bengaluru": [12.9716, 77.5946],
    "Service centre": [12.9611, 77.6387],
    "Hyderabad": [17.3850, 78.4867],
    "Bengaluru": [12.9716, 77.5946],
    "Bangalore": [12.9716, 77.5946],
    "Vijayawada": [16.5062, 80.6480],
    "Guntur": [16.3067, 80.4365],
    "Mangalagiri": [16.4307, 80.5535],
    "Navuluru": [16.4085, 80.5480],
    "Amaravati": [16.5131, 80.5165],
    "Chennai": [13.0827, 80.2707],
}

SHIPMENT_TRANSITIONS: Dict[str, Set[str]] = {
    "Created": {"Assigned", "Cancelled"},
    "Assigned": {"In Transit", "Delayed", "Cancelled"},
    "In Transit": {"Delayed", "Delivered", "Cancelled"},
    "Delayed": {"In Transit", "Delivered", "Cancelled"},
    "Delivered": set(),
    "Cancelled": set(),
}

SEED: Dict[str, Any] = {
    "vehicles": [
        {
            "id": "VH-1042",
            "name": "Mercedes Sprinter",
            "plate": "KA 03 MN 4821",
            "type": "Van",
            "capacity": "1,200 kg",
            "fuelType": "Diesel",
            "driver": "Arjun Mehta",
            "status": "On route",
            "fuel": 78,
            "mileage": 42860,
            "location": "Whitefield, Bengaluru",
            "lat": 12.9698,
            "lng": 77.7500,
            "speed": 48.5,
            "gpsDeviceId": "GPS-SIM-1042",
            "gpsSource": "SIMULATED_TELEMATICS",
            "lastPingAt": "2026-11-25T09:10:00Z",
            "service": "2026-12-04",
            "color": "#d9e9e4",
        },
        {
            "id": "VH-1038",
            "name": "Tata Ace Gold",
            "plate": "KA 05 AB 2207",
            "type": "Mini truck",
            "capacity": "750 kg",
            "fuelType": "Diesel",
            "driver": "Priya Nair",
            "status": "Available",
            "fuel": 92,
            "mileage": 28640,
            "location": "Yeshwanthpur, Bengaluru",
            "lat": 13.0285,
            "lng": 77.5407,
            "speed": 0.0,
            "gpsDeviceId": "GPS-SIM-1038",
            "gpsSource": "SIMULATED_TELEMATICS",
            "lastPingAt": "2026-11-25T09:05:00Z",
            "service": "2026-12-18",
            "color": "#f5e5d8",
        },
        {
            "id": "VH-1031",
            "name": "Ashok Leyland Dost",
            "plate": "KA 51 MC 9012",
            "type": "Truck",
            "capacity": "1,500 kg",
            "fuelType": "Diesel",
            "driver": "Ravi Kumar",
            "status": "On route",
            "fuel": 46,
            "mileage": 63120,
            "location": "Electronic City, Bengaluru",
            "lat": 12.8452,
            "lng": 77.6602,
            "speed": 34.0,
            "gpsDeviceId": "GPS-SIM-1031",
            "gpsSource": "SIMULATED_TELEMATICS",
            "lastPingAt": "2026-11-25T09:12:00Z",
            "service": "2026-12-10",
            "color": "#e8e4f4",
        },
        {
            "id": "VH-1026",
            "name": "Mahindra Bolero Pik-Up",
            "plate": "KA 04 CD 7715",
            "type": "Pickup",
            "capacity": "1,000 kg",
            "fuelType": "Diesel",
            "driver": "Unassigned",
            "status": "In service",
            "fuel": 35,
            "mileage": 51420,
            "location": "Service centre",
            "lat": 12.9611,
            "lng": 77.6387,
            "speed": 0.0,
            "gpsDeviceId": "GPS-SIM-1026",
            "gpsSource": "SIMULATED_TELEMATICS",
            "lastPingAt": "2026-11-25T08:30:00Z",
            "service": "2026-11-28",
            "color": "#e8ebef",
        },
        {
            "id": "VH-1019",
            "name": "Force Traveller",
            "plate": "KA 02 EF 3654",
            "type": "Van",
            "capacity": "900 kg",
            "fuelType": "Diesel",
            "driver": "Nisha Rao",
            "status": "On route",
            "fuel": 84,
            "mileage": 37810,
            "location": "Indiranagar, Bengaluru",
            "lat": 12.9784,
            "lng": 77.6408,
            "speed": 41.2,
            "gpsDeviceId": "GPS-SIM-1019",
            "gpsSource": "SIMULATED_TELEMATICS",
            "lastPingAt": "2026-11-25T09:11:00Z",
            "service": "2026-12-12",
            "color": "#f1ead8",
        },
    ],
    "trips": [
        {
            "id": "TR-2084",
            "from": "Whitefield",
            "to": "Koramangala",
            "driver": "Arjun Mehta",
            "vehicle": "VH-1042",
            "routeId": "RT-FAST-01",
            "routeStrategy": "Fastest Route",
            "distanceKm": 16.4,
            "durationMin": 34,
            "scheduledDeparture": "2026-11-25T09:30:00Z",
            "eta": "10:42 AM",
            "etaIso": "2026-11-25T10:42:00Z",
            "status": "In transit",
            "progress": 68,
            "nextStop": "Marathahalli Bridge (5.2 km remaining)",
            "waypoints": [[12.9698, 77.7500], [12.9682, 77.7428], [12.9654, 77.7345], [12.9621, 77.7258], [12.9592, 77.7165], [12.9569, 77.7011], [12.9558, 77.6915], [12.9544, 77.6812], [12.9522, 77.6710], [12.9488, 77.6604], [12.9445, 77.6498], [12.9408, 77.6412], [12.9378, 77.6328], [12.9352, 77.6245]],
        },
        {
            "id": "TR-2083",
            "from": "Peenya",
            "to": "Indiranagar",
            "driver": "Nisha Rao",
            "vehicle": "VH-1019",
            "routeId": "RT-TRAFFIC-02",
            "routeStrategy": "Traffic-Avoidance Route",
            "distanceKm": 19.2,
            "durationMin": 42,
            "scheduledDeparture": "2026-11-25T10:00:00Z",
            "eta": "11:15 AM",
            "etaIso": "2026-11-25T11:15:00Z",
            "status": "In transit",
            "progress": 42,
            "nextStop": "Mekhri Circle (9.8 km remaining)",
            "waypoints": [[13.0285, 77.5197], [13.0282, 77.5295], [13.0278, 77.5407], [13.0254, 77.5512], [13.0218, 77.5625], [13.0168, 77.5738], [13.0125, 77.5850], [13.0068, 77.5945], [13.0012, 77.6032], [12.9955, 77.6124], [12.9895, 77.6225], [12.9838, 77.6318], [12.9784, 77.6408]],
        },
        {
            "id": "TR-2081",
            "from": "Jayanagar",
            "to": "Electronic City",
            "driver": "Ravi Kumar",
            "vehicle": "VH-1031",
            "routeId": "RT-SHORT-03",
            "routeStrategy": "Shortest Route",
            "distanceKm": 14.8,
            "durationMin": 39,
            "scheduledDeparture": "2026-11-25T09:00:00Z",
            "eta": "10:28 AM",
            "etaIso": "2026-11-25T10:28:00Z",
            "status": "Delayed",
            "progress": 81,
            "nextStop": "Silk Board Junction (3.1 km remaining)",
            "waypoints": [[12.9250, 77.5838], [12.9235, 77.5932], [12.9212, 77.6035], [12.9192, 77.6138], [12.9177, 77.6238], [12.9085, 77.6285], [12.8982, 77.6334], [12.8875, 77.6388], [12.8764, 77.6442], [12.8655, 77.6496], [12.8552, 77.6548], [12.8452, 77.6602]],
        },
        {
            "id": "TR-2079",
            "from": "Hebbal",
            "to": "MG Road",
            "driver": "Priya Nair",
            "vehicle": "VH-1038",
            "routeId": "RT-ECO-04",
            "routeStrategy": "Fuel-Efficient Route",
            "distanceKm": 11.5,
            "durationMin": 26,
            "scheduledDeparture": "2026-11-25T08:00:00Z",
            "eta": "08:36 AM",
            "etaIso": "2026-11-25T08:36:00Z",
            "actualArrival": "08:34 AM",
            "status": "Delivered",
            "progress": 100,
            "nextStop": "Completed",
            "waypoints": [[13.0358, 77.5970], [13.0265, 77.5962], [13.0172, 77.5954], [13.0085, 77.5952], [12.9998, 77.5965], [12.9912, 77.5992], [12.9835, 77.6028], [12.9751, 77.6068]],
        },
    ],
    "shipments": [
        {
            "id": "SHP-501",
            "cargo": "Industrial Sensors & PLC Kits",
            "weight": "420 kg",
            "origin": "Whitefield",
            "destination": "Koramangala",
            "tripId": "TR-2084",
            "vehicleId": "VH-1042",
            "driverName": "Arjun Mehta",
            "status": "In Transit",
            "eta": "10:42 AM",
            "estimatedArrival": "2026-11-25T10:42:00Z",
            "actualArrival": None,
            "delayMinutes": 0,
            "history": [
                {"status": "Created", "timestamp": "2026-11-25T08:15:00Z", "note": "Shipment registered at Whitefield hub"},
                {"status": "Assigned", "timestamp": "2026-11-25T08:40:00Z", "note": "Assigned to trip TR-2084 (VH-1042)"},
                {"status": "In Transit", "timestamp": "2026-11-25T09:30:00Z", "note": "Departed origin via Fastest Route"},
            ],
        },
        {
            "id": "SHP-502",
            "cargo": "Cold-Chain Medical Supplies",
            "weight": "310 kg",
            "origin": "Jayanagar",
            "destination": "Electronic City",
            "tripId": "TR-2081",
            "vehicleId": "VH-1031",
            "driverName": "Ravi Kumar",
            "status": "Delayed",
            "eta": "10:28 AM",
            "estimatedArrival": "2026-11-25T10:28:00Z",
            "actualArrival": None,
            "delayMinutes": 18,
            "history": [
                {"status": "Created", "timestamp": "2026-11-25T07:50:00Z", "note": "Priority cold-chain manifest created"},
                {"status": "Assigned", "timestamp": "2026-11-25T08:10:00Z", "note": "Assigned to trip TR-2081 (VH-1031)"},
                {"status": "In Transit", "timestamp": "2026-11-25T09:00:00Z", "note": "Vehicle departed Jayanagar depot"},
                {"status": "Delayed", "timestamp": "2026-11-25T09:48:00Z", "note": "Heavy congestion near Silk Board (+18 mins)"},
            ],
        },
        {
            "id": "SHP-503",
            "cargo": "Retail Electronics Pallets",
            "weight": "580 kg",
            "origin": "Peenya",
            "destination": "Indiranagar",
            "tripId": "TR-2083",
            "vehicleId": "VH-1019",
            "driverName": "Nisha Rao",
            "status": "In Transit",
            "eta": "11:15 AM",
            "estimatedArrival": "2026-11-25T11:15:00Z",
            "actualArrival": None,
            "delayMinutes": 0,
            "history": [
                {"status": "Created", "timestamp": "2026-11-25T08:50:00Z", "note": "Shipment logged in dispatch desk"},
                {"status": "Assigned", "timestamp": "2026-11-25T09:20:00Z", "note": "Assigned to trip TR-2083 (VH-1019)"},
                {"status": "In Transit", "timestamp": "2026-11-25T10:00:00Z", "note": "Active on Traffic-Avoidance corridor"},
            ],
        },
        {
            "id": "SHP-504",
            "cargo": "Automotive Spare Assemblies",
            "weight": "490 kg",
            "origin": "Hebbal",
            "destination": "MG Road",
            "tripId": "TR-2079",
            "vehicleId": "VH-1038",
            "driverName": "Priya Nair",
            "status": "Delivered",
            "eta": "08:36 AM",
            "estimatedArrival": "2026-11-25T08:36:00Z",
            "actualArrival": "2026-11-25T08:34:00Z",
            "delayMinutes": 0,
            "history": [
                {"status": "Created", "timestamp": "2026-11-25T07:10:00Z", "note": "Manifest verified"},
                {"status": "Assigned", "timestamp": "2026-11-25T07:30:00Z", "note": "Assigned to trip TR-2079 (VH-1038)"},
                {"status": "In Transit", "timestamp": "2026-11-25T08:00:00Z", "note": "En route via Fuel-Efficient Route"},
                {"status": "Delivered", "timestamp": "2026-11-25T08:34:00Z", "note": "Delivered 2 mins ahead of ETA"},
            ],
        },
        {
            "id": "SHP-505",
            "cargo": "Solar Inverter Units (12 Boxes)",
            "weight": "650 kg",
            "origin": "Whitefield",
            "destination": "Yeshwanthpur",
            "tripId": None,
            "vehicleId": None,
            "driverName": "Unassigned",
            "status": "Created",
            "eta": "Pending assignment",
            "estimatedArrival": None,
            "actualArrival": None,
            "delayMinutes": 0,
            "history": [
                {"status": "Created", "timestamp": "2026-11-25T09:15:00Z", "note": "Awaiting trip scheduling and vehicle assignment"},
            ],
        },
    ],
    "locationPings": [
        {
            "id": "PING-9001",
            "vehicleId": "VH-1042",
            "deviceId": "GPS-SIM-1042",
            "lat": 12.9698,
            "lng": 77.7500,
            "speed": 48.5,
            "heading": 245,
            "source": "SIMULATED_TELEMATICS",
            "timestamp": "2026-11-25T09:10:00Z",
        },
        {
            "id": "PING-9002",
            "vehicleId": "VH-1031",
            "deviceId": "GPS-SIM-1031",
            "lat": 12.8452,
            "lng": 77.6602,
            "speed": 34.0,
            "heading": 150,
            "source": "SIMULATED_TELEMATICS",
            "timestamp": "2026-11-25T09:12:00Z",
        },
        {
            "id": "PING-9003",
            "vehicleId": "VH-1019",
            "deviceId": "GPS-SIM-1019",
            "lat": 12.9784,
            "lng": 77.6408,
            "speed": 41.2,
            "heading": 110,
            "source": "SIMULATED_TELEMATICS",
            "timestamp": "2026-11-25T09:11:00Z",
        },
    ],
    "drivers": [
        {
            "id": "DR-204",
            "name": "Arjun Mehta",
            "phone": "+91 98450 11234",
            "email": "arjun.mehta@northstarfleet.in",
            "address": "Whitefield, Bengaluru",
            "emergencyContact": "+91 98450 99811",
            "joinedOn": "Jan 15, 2024",
            "license": "KA05201800421",
            "licenseType": "Commercial (HMV)",
            "licenseIssueDate": "Jan 10, 2022",
            "licenseExpiryDate": "Jan 10, 2029",
            "licenseDocument": "KA05201800421_HMV.pdf",
            "documentVerified": True,
            "accountActive": True,
            "vehicle": "VH-1042",
            "status": "On Trip",
            "completedTrips": 42,
            "successfulDeliveries": 39,
            "delayedDeliveries": 3,
            "onTimeRate": 93,
            "totalDistanceKm": 12450,
            "currentLocation": "Near Marathahalli, Bengaluru",
            "speed": 48.5,
            "nextStop": "Koramangala Hub",
            "eta": "10:42 AM",
        },
        {
            "id": "DR-187",
            "name": "Priya Nair",
            "phone": "+91 98450 22561",
            "email": "priya.nair@northstarfleet.in",
            "address": "Yeshwanthpur, Bengaluru",
            "emergencyContact": "+91 98450 88210",
            "joinedOn": "Mar 08, 2024",
            "license": "KA03201700816",
            "licenseType": "Light Commercial (LMV-TR)",
            "licenseIssueDate": "May 14, 2021",
            "licenseExpiryDate": "May 14, 2028",
            "licenseDocument": "KA03201700816_LMV.pdf",
            "documentVerified": True,
            "accountActive": True,
            "vehicle": "VH-1038",
            "status": "Available",
            "completedTrips": 56,
            "successfulDeliveries": 54,
            "delayedDeliveries": 2,
            "onTimeRate": 96,
            "totalDistanceKm": 15820,
            "currentLocation": "Yeshwanthpur Depot, Bengaluru",
            "speed": 0,
            "nextStop": "Awaiting dispatch",
            "eta": "—",
        },
        {
            "id": "DR-165",
            "name": "Ravi Kumar",
            "phone": "+91 98450 30872",
            "email": "ravi.kumar@northstarfleet.in",
            "address": "Jayanagar, Bengaluru",
            "emergencyContact": "+91 98450 77341",
            "joinedOn": "Nov 20, 2023",
            "license": "KA04201900593",
            "licenseType": "Commercial (HMV)",
            "licenseIssueDate": "Aug 22, 2020",
            "licenseExpiryDate": "Aug 22, 2027",
            "licenseDocument": "KA04201900593_HMV.pdf",
            "documentVerified": True,
            "accountActive": True,
            "vehicle": "VH-1031",
            "status": "On Trip",
            "completedTrips": 64,
            "successfulDeliveries": 58,
            "delayedDeliveries": 6,
            "onTimeRate": 91,
            "totalDistanceKm": 19340,
            "currentLocation": "Near Silk Board, Bengaluru",
            "speed": 34.0,
            "nextStop": "Electronic City Phase 1",
            "eta": "10:28 AM",
        },
        {
            "id": "DR-142",
            "name": "Nisha Rao",
            "phone": "+91 98450 44109",
            "email": "nisha.rao@northstarfleet.in",
            "address": "Indiranagar, Bengaluru",
            "emergencyContact": "+91 98450 66219",
            "joinedOn": "Jun 12, 2024",
            "license": "KA03202000218",
            "licenseType": "Light Commercial (LMV-TR)",
            "licenseIssueDate": "Feb 02, 2022",
            "licenseExpiryDate": "Feb 02, 2029",
            "licenseDocument": "KA03202000218_LMV.pdf",
            "documentVerified": False,
            "accountActive": True,
            "vehicle": "VH-1019",
            "status": "At Stop",
            "completedTrips": 31,
            "successfulDeliveries": 30,
            "delayedDeliveries": 1,
            "onTimeRate": 97,
            "totalDistanceKm": 8910,
            "currentLocation": "Indiranagar 100ft Rd, Bengaluru",
            "speed": 41.2,
            "nextStop": "Indiranagar Drop Hub",
            "eta": "11:15 AM",
        },
    ],
    "maintenance": [
        {"id": "WO-083", "vehicle": "VH-1026", "name": "Mahindra Bolero Pik-Up", "service": "Brake inspection", "due": "2026-11-28", "status": "Scheduled"},
        {"id": "WO-081", "vehicle": "VH-1031", "name": "Ashok Leyland Dost", "service": "Oil and filter change", "due": "2026-12-02", "status": "Due soon"},
        {"id": "WO-076", "vehicle": "VH-1038", "name": "Tata Ace Gold", "service": "Tyre rotation", "due": "2026-12-10", "status": "Scheduled"},
    ],
    "settings": {
        "company": "Northstar Logistics",
        "baseCity": "Bengaluru",
        "currency": "INR",
        "gpsGatewayProvider": "Cellular IoT Telematics (4G LTE SIM / MQTT-HTTPS Bridge)",
        "gpsIngestionSecret": "FF-IOT-KEY-2026",
        "googleMapsApiKey": "",
    },
    "users": [],
}

VALID_ROLES = {"admin", "fleet_manager", "dispatcher", "driver"}
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def load_db() -> Dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text(json.dumps(SEED, indent=2), encoding="utf-8")
    try:
        value = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        for key in ("users", "drivers", "maintenance", "vehicles", "trips", "shipments", "locationPings"):
            if key not in value or value[key] is None:
                value[key] = deepcopy(SEED.get(key, []))
        if "settings" not in value or not value["settings"]:
            value["settings"] = deepcopy(SEED["settings"])
        else:
            for sk, sv in SEED["settings"].items():
                value["settings"].setdefault(sk, sv)
        return value
    except Exception:
        return deepcopy(SEED)


db: Dict[str, Any] = load_db()
sessions: Dict[str, Dict[str, Any]] = {}


def save_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(db, indent=2), encoding="utf-8")
    sync_orm_snapshot()

# --- SQLAlchemy Relational Persistence Layer (PostgreSQL / SQLite) ---
from sqlalchemy import Boolean, Column, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DATA_DIR / 'fleetflow.db'}")
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class ShipmentORM(Base):
    __tablename__ = "shipments"
    id = Column(String(32), primary_key=True, index=True)
    cargo = Column(String(120))
    origin = Column(String(100))
    destination = Column(String(100))
    trip_id = Column(String(32), nullable=True)
    status = Column(String(32), default="Created")
    eta = Column(String(64), nullable=True)
    estimated_arrival = Column(String(64), nullable=True)
    actual_arrival = Column(String(64), nullable=True)


class LocationPingORM(Base):
    __tablename__ = "location_pings"
    id = Column(String(32), primary_key=True, index=True)
    vehicle_id = Column(String(32), index=True)
    device_id = Column(String(64))
    lat = Column(Float)
    lng = Column(Float)
    speed = Column(Float)
    source = Column(String(48))
    timestamp = Column(String(64))


class TripORM(Base):
    __tablename__ = "trips"
    id = Column(String(32), primary_key=True, index=True)
    vehicle_id = Column(String(32))
    driver_name = Column(String(80))
    route_id = Column(String(48))
    origin = Column(String(100))
    destination = Column(String(100))
    scheduled_departure = Column(String(64))
    eta = Column(String(64))
    actual_arrival = Column(String(64), nullable=True)
    status = Column(String(32))


Base.metadata.create_all(bind=engine)


def sync_orm_snapshot() -> None:
    """Mirrors active FleetFlow JSON records into SQLAlchemy tables (PostgreSQL/SQLite)."""
    try:
        with SessionLocal() as session:
            for s in db.get("shipments", []):
                row = session.get(ShipmentORM, s["id"])
                if not row:
                    row = ShipmentORM(id=s["id"])
                    session.add(row)
                row.cargo = s.get("cargo", "")
                row.origin = s.get("origin", "")
                row.destination = s.get("destination", "")
                row.trip_id = s.get("tripId")
                row.status = s.get("status", "Created")
                row.eta = s.get("eta")
                row.estimated_arrival = s.get("estimatedArrival")
                row.actual_arrival = s.get("actualArrival")

            for t in db.get("trips", []):
                trow = session.get(TripORM, t["id"])
                if not trow:
                    trow = TripORM(id=t["id"])
                    session.add(trow)
                trow.vehicle_id = t.get("vehicle", "")
                trow.driver_name = t.get("driver", "")
                trow.route_id = t.get("routeId", "")
                trow.origin = t.get("from", "")
                trow.destination = t.get("to", "")
                trow.scheduled_departure = t.get("scheduledDeparture", "")
                trow.eta = t.get("eta", "")
                trow.actual_arrival = t.get("actualArrival")
                trow.status = t.get("status", "In transit")

            for p in db.get("locationPings", [])[:30]:
                if not session.get(LocationPingORM, p["id"]):
                    session.add(
                        LocationPingORM(
                            id=p["id"],
                            vehicle_id=p.get("vehicleId", ""),
                            device_id=p.get("deviceId", ""),
                            lat=float(p.get("lat", 0.0)),
                            lng=float(p.get("lng", 0.0)),
                            speed=float(p.get("speed", 0.0)),
                            source=p.get("source", "SIMULATED_TELEMATICS"),
                            timestamp=p.get("timestamp", ""),
                        )
                    )
            session.commit()
    except Exception:
        pass



# WebSocket Connection Manager for real-time GPS & Shipment telemetry
class TelemetryConnectionManager:
    def __init__(self) -> None:
        self.active_connections: List[Dict[str, Any]] = []

    async def connect(self, websocket: WebSocket, user: Dict[str, Any]) -> None:
        await websocket.accept()
        self.active_connections.append({"ws": websocket, "user": user})

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections = [c for c in self.active_connections if c["ws"] != websocket]

    async def broadcast(self, event_type: str, payload: Dict[str, Any]) -> None:
        message = json.dumps({
            "type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        })
        stale: List[WebSocket] = []
        for conn in self.active_connections:
            ws: WebSocket = conn["ws"]
            user: Dict[str, Any] = conn["user"]
            # Role-based filtering: drivers only receive events for their assigned vehicle/trips
            if user.get("role") == "driver":
                v_driver = payload.get("driverName") or payload.get("driver")
                if v_driver and v_driver != user.get("name"):
                    continue
            try:
                await ws.send_text(message)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(ws)


ws_manager = TelemetryConnectionManager()


def safe_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"]}


def password_hash(password: str, salt: Optional[str] = None) -> str:
    salt = salt or secrets.token_hex(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt.encode("utf-8"), n=16384, r=8, p=1, dklen=64)
    return f"{salt}:{derived.hex()}"


def password_matches(password: str, stored: str) -> bool:
    if ":" not in str(stored or ""):
        return False
    salt, expected_hex = stored.split(":", 1)
    if not salt or not expected_hex:
        return False
    actual = hashlib.scrypt(password.encode("utf-8"), salt=salt.encode("utf-8"), n=16384, r=8, p=1, dklen=64)
    try:
        expected = bytes.fromhex(expected_hex)
    except ValueError:
        return False
    return len(actual) == len(expected) and hmac.compare_digest(actual, expected)


def issue_session(user: Dict[str, Any]) -> Dict[str, Any]:
    token = secrets.token_hex(32)
    sessions[token] = {"user_id": user["id"], "expires": time.time() + 60 * 60 * 24 * 7}
    return {"token": token, "user": safe_user(user)}


def resolve_user_from_token(token: str) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    session = sessions.get(token)
    if not session or session["expires"] <= time.time():
        sessions.pop(token, None)
        return None
    user = next((item for item in db["users"] if item["id"] == session["user_id"]), None)
    if not user:
        sessions.pop(token, None)
        return None
    return user


def get_current_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    token = re.sub(r"^Bearer\s+", "", authorization or "", flags=re.IGNORECASE).strip()
    user = resolve_user_from_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in to continue.")
    return user


def forbidden() -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your account does not have permission for this action.")


# --- Geo helpers: geocoding, real-road routing (OSRM) and route evaluation ---------------------
HTTP_USER_AGENT = "FleetFlow/2.3 (fleet management app; contact admin@fleetflow.local)"
OSRM_BASES = [
    "https://router.project-osrm.org/route/v1/driving",
    "https://routing.openstreetmap.de/routed-car/route/v1/driving",
]
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
DEFAULT_COORDS: List[float] = [12.9716, 77.5946]
COMMERCIAL_SPEED_FACTOR = 1.12  # OSRM uses a car profile; commercial vehicles are slower.
GEO_CACHE: Dict[str, List[float]] = {}
OSRM_CACHE: Dict[str, List[Dict[str, Any]]] = {}
STRATEGY_ORDER = ["Fastest Route", "Traffic-Avoidance Route", "Shortest Route", "Fuel-Efficient Route"]
STRATEGY_STYLE: Dict[str, Dict[str, str]] = {
    "Fastest Route": {"key": "FAST", "badge": "Recommended · Traffic-Aware", "color": "#1a73e8"},
    "Traffic-Avoidance Route": {"key": "TRAFFIC", "badge": "Rerouted · Clears Bottlenecks", "color": "#7c3aed"},
    "Shortest Route": {"key": "SHORT", "badge": "Minimum Distance", "color": "#d97706"},
    "Fuel-Efficient Route": {"key": "ECO", "badge": "Eco Cruise · Lowest Fuel Burn", "color": "#16a34a"},
}


def _http_get_json(url: str, timeout: float = 6.0) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": HTTP_USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _hav_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    return round(_hav_km(lat1, lng1, lat2, lng2), 2)


def coerce_coords(value: Any) -> Optional[List[float]]:
    try:
        lat, lng = float(value[0]), float(value[1])
    except (TypeError, ValueError, IndexError, KeyError):
        return None
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0) or (lat == 0 and lng == 0):
        return None
    return [round(lat, 6), round(lng, 6)]


def lookup_known_coords(place_name: str) -> Optional[List[float]]:
    """Match the most specific known hub. The first comma-separated part wins ("Navuluru, Mangalagiri" -> Navuluru)."""
    text = str(place_name or "").lower().strip()
    if not text:
        return None
    parts = [p.strip() for p in text.split(",") if p.strip()] or [text]
    for part in parts:
        best: Optional[List[float]] = None
        best_len = 0
        for key, coords in BENGALURU_HUBS.items():
            k = key.lower()
            if k in part and len(k) > best_len:
                best, best_len = coords, len(k)
        if best:
            return [best[0], best[1]]
    return None


def geocode_place(place_name: str) -> Optional[List[float]]:
    """Known hubs first, then OpenStreetMap Nominatim (India). Blocking: call through asyncio.to_thread."""
    known = lookup_known_coords(place_name)
    if known:
        return known
    key = str(place_name or "").strip().lower()
    if not key:
        return None
    if key in GEO_CACHE:
        return GEO_CACHE[key]
    try:
        url = f"{NOMINATIM_URL}?format=jsonv2&limit=1&countrycodes=in&q={urllib.parse.quote(key)}"
        data = _http_get_json(url, 5.0)
        if isinstance(data, list) and data:
            coords = coerce_coords([data[0]["lat"], data[0]["lon"]])
            if coords:
                GEO_CACHE[key] = coords
                return coords
    except Exception:
        pass
    return None


def resolve_coords(place_name: str) -> List[float]:
    """Non-blocking best effort (hubs and cached geocodes). Falls back to the depot only as a last resort."""
    known = lookup_known_coords(place_name)
    if known:
        return known
    cached = GEO_CACHE.get(str(place_name or "").strip().lower())
    return list(cached) if cached else list(DEFAULT_COORDS)


def path_length_km(points: List[List[float]]) -> float:
    return sum(_hav_km(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]) for i in range(len(points) - 1))


def point_at_fraction(points: List[List[float]], fraction: float) -> Dict[str, Any]:
    """Interpolated position along a polyline (by distance). Returns {pos, index}."""
    if not points:
        return {"pos": list(DEFAULT_COORDS), "index": 0}
    if len(points) == 1:
        return {"pos": [points[0][0], points[0][1]], "index": 0}
    f = max(0.0, min(1.0, fraction))
    segs = [_hav_km(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]) for i in range(len(points) - 1)]
    total = sum(segs)
    if total <= 0:
        return {"pos": [points[0][0], points[0][1]], "index": 0}
    target = f * total
    acc = 0.0
    for i, seg in enumerate(segs):
        if acc + seg >= target or i == len(segs) - 1:
            t = 0.0 if seg <= 0 else max(0.0, min(1.0, (target - acc) / seg))
            lat = points[i][0] + (points[i + 1][0] - points[i][0]) * t
            lng = points[i][1] + (points[i + 1][1] - points[i][1]) * t
            return {"pos": [round(lat, 6), round(lng, 6)], "index": i}
        acc += seg
    return {"pos": [points[-1][0], points[-1][1]], "index": len(points) - 2}


def project_on_path(points: List[List[float]], lat: float, lng: float) -> Dict[str, float]:
    """Snap a GPS fix onto a polyline. Returns fraction travelled (0-1), km remaining and km off the path."""
    kx = 111.320 * math.cos(math.radians(lat))
    ky = 110.574
    segs = [_hav_km(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]) for i in range(len(points) - 1)]
    total = sum(segs) or 1e-9
    best_d = float("inf")
    best_along = 0.0
    acc = 0.0
    px, py = lng * kx, lat * ky
    for i, seg in enumerate(segs):
        ax, ay = points[i][1] * kx, points[i][0] * ky
        bx, by = points[i + 1][1] * kx, points[i + 1][0] * ky
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
        d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
        if d < best_d:
            best_d = d
            best_along = acc + t * seg
        acc += seg
    frac = max(0.0, min(1.0, best_along / total))
    return {"fraction": frac, "remainingKm": max(0.0, total - best_along), "offPathKm": best_d}


def _rdp_indices(xy: List[tuple], tol: float) -> List[int]:
    n = len(xy)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        s, e = stack.pop()
        ax, ay = xy[s]
        bx, by = xy[e]
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        max_d, idx = -1.0, -1
        for i in range(s + 1, e):
            px, py = xy[i]
            if l2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > max_d:
                max_d, idx = d, i
        if idx != -1 and max_d > tol:
            keep[idx] = True
            stack.append((s, idx))
            stack.append((idx, e))
    return [i for i, k in enumerate(keep) if k]


def simplify_path(points: List[List[float]], max_points: int = 300) -> List[List[float]]:
    """Ramer-Douglas-Peucker simplification so stored trips stay small but still follow the road."""
    if len(points) <= max_points:
        return points
    kx = 111.320 * math.cos(math.radians(points[0][0]))
    xy = [(p[1] * kx, p[0] * 110.574) for p in points]
    tol = 0.004
    keep = list(range(len(points)))
    while tol < 8:
        keep = _rdp_indices(xy, tol)
        if len(keep) <= max_points:
            break
        tol *= 1.7
    if len(keep) > max_points:
        step = len(keep) / max_points
        keep = sorted({keep[min(len(keep) - 1, int(i * step))] for i in range(max_points)} | {0, len(points) - 1})
    return [points[i] for i in keep]


def sanitize_candidates(raw: Any) -> List[Dict[str, Any]]:
    """Validate road geometries sent by the browser (OSRM) before trusting them."""
    out: List[Dict[str, Any]] = []
    if not isinstance(raw, list):
        return out
    for item in raw[:8]:
        if not isinstance(item, dict):
            continue
        pts = []
        for p in (item.get("waypoints") or [])[:20000]:
            c = coerce_coords(p)
            if c:
                pts.append(c)
        if len(pts) < 2:
            continue
        try:
            dist = float(item.get("distanceKm"))
            dur = float(item.get("durationMin"))
        except (TypeError, ValueError):
            dist = path_length_km(pts) * 1.0
            dur = dist / 45.0 * 60.0
        if dist <= 0 or dur <= 0:
            continue
        out.append({"distanceKm": round(dist, 1), "durationMin": dur, "waypoints": simplify_path(pts, 400), "source": "osrm"})
    return out


def _fetch_osrm(coords: List[List[float]]) -> List[Dict[str, Any]]:
    coord_str = ";".join(f"{c[1]:.6f},{c[0]:.6f}" for c in coords)
    for base in OSRM_BASES:
        try:
            data = _http_get_json(f"{base}/{coord_str}?overview=full&geometries=geojson&alternatives=true&steps=false", 9.0)
            if data.get("code") == "Ok" and data.get("routes"):
                return [
                    {
                        "distanceKm": round(r["distance"] / 1000.0, 1),
                        "durationMin": max(1.0, r["duration"] / 60.0),
                        "waypoints": [[round(lat, 6), round(lng, 6)] for lng, lat in r["geometry"]["coordinates"]],
                        "source": "osrm",
                    }
                    for r in data["routes"]
                ]
        except Exception:
            continue
    return []


def _via_points(o: List[float], d: List[float]) -> List[List[float]]:
    mid_lat, mid_lng = (o[0] + d[0]) / 2, (o[1] + d[1]) / 2
    kx = 111.320 * math.cos(math.radians(mid_lat))
    dx, dy = (d[1] - o[1]) * kx, (d[0] - o[0]) * 110.574
    length = math.hypot(dx, dy) or 1e-9
    off = min(30.0, 0.2 * length)
    ux, uy = -dy / length, dx / length
    return [
        [round(mid_lat + s * uy * off / 110.574, 6), round(mid_lng + s * ux * off / kx, 6)]
        for s in (1, -1)
    ]


def _dedupe_candidates(cands: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    kept: List[Dict[str, Any]] = []
    for c in cands:
        mid = c["waypoints"][len(c["waypoints"]) // 2]
        dup = False
        for k in kept:
            kmid = k["waypoints"][len(k["waypoints"]) // 2]
            rel = abs(c["distanceKm"] - k["distanceKm"]) / max(c["distanceKm"], k["distanceKm"], 0.1)
            if rel < 0.02 and _hav_km(mid[0], mid[1], kmid[0], kmid[1]) < 0.5:
                dup = True
                break
        if not dup:
            kept.append(c)
    return kept


def fetch_road_candidates(o: List[float], d: List[float]) -> List[Dict[str, Any]]:
    """Real driving geometries: OSRM alternatives plus two via-point detours. Blocking."""
    key = f"{o[0]:.3f},{o[1]:.3f}>{d[0]:.3f},{d[1]:.3f}"
    if key in OSRM_CACHE:
        return OSRM_CACHE[key]
    v1, v2 = _via_points(o, d)
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(_fetch_osrm, [o, d]), pool.submit(_fetch_osrm, [o, v1, d]), pool.submit(_fetch_osrm, [o, v2, d])]
        direct, via1, via2 = [f.result() for f in futures]
    cands = direct + [r[0] for r in (via1, via2) if r]
    if cands:
        best = min(c["distanceKm"] for c in cands)
        cands = [c for c in cands if c["distanceKm"] <= best * 1.5]
    cands = _dedupe_candidates(cands)
    if cands:
        if len(OSRM_CACHE) > 200:
            OSRM_CACHE.clear()
        OSRM_CACHE[key] = cands
    return cands


def synth_candidates(o: List[float], d: List[float]) -> List[Dict[str, Any]]:
    """Offline fallback: smooth curved corridors (clearly flagged as estimated, not road-snapped)."""
    straight = max(0.5, _hav_km(o[0], o[1], d[0], d[1]))
    mid_lat, mid_lng = (o[0] + d[0]) / 2, (o[1] + d[1]) / 2
    kx = 111.320 * math.cos(math.radians(mid_lat))
    dx, dy = (d[1] - o[1]) * kx, (d[0] - o[0]) * 110.574
    length = math.hypot(dx, dy) or 1e-9
    ux, uy = -dy / length, dx / length
    raw_speed = 58.0 if straight >= 45 else 32.0
    out = []
    for bulge in (0.05, -0.11, 0.0, 0.14):
        ctrl_lat = mid_lat + uy * bulge * length * 2 / 110.574
        ctrl_lng = mid_lng + ux * bulge * length * 2 / kx
        pts = []
        for i in range(41):
            t = i / 40
            lat = (1 - t) ** 2 * o[0] + 2 * (1 - t) * t * ctrl_lat + t * t * d[0]
            lng = (1 - t) ** 2 * o[1] + 2 * (1 - t) * t * ctrl_lng + t * t * d[1]
            pts.append([round(lat, 6), round(lng, 6)])
        dist = path_length_km(pts) * 1.18
        out.append({"distanceKm": round(dist, 1), "durationMin": dist / raw_speed * 60.0, "waypoints": pts, "source": "estimated"})
    return out


def traffic_amplitude(now: Optional[datetime] = None) -> float:
    """Time-of-day congestion intensity (IST). There is no live traffic feed, so this is modelled."""
    now = now or datetime.now(timezone.utc)
    hour = (now + timedelta(hours=5, minutes=30)).hour
    if 8 <= hour < 11 or 17 <= hour < 21:
        return 1.0
    if 7 <= hour < 8 or 21 <= hour < 22:
        return 0.6
    if 11 <= hour < 17:
        return 0.55
    return 0.15


def fuel_l_per_km(avg_kmh: float) -> float:
    v = max(15.0, min(100.0, avg_kmh))
    return 0.11 * (1 + 0.9 * ((v - 60.0) / 60.0) ** 2)


def compute_eta(distance_km: float, speed_kmh: float, traffic_factor: float = 1.0, fallback_speed: float = 34.0) -> Dict[str, Any]:
    effective_speed = max(18.0, speed_kmh if speed_kmh > 5 else fallback_speed)
    remaining_min = max(1, int(round((distance_km / effective_speed) * 60 * traffic_factor)))
    arrival_dt = datetime.now(timezone.utc) + timedelta(minutes=remaining_min)
    local_ist = arrival_dt + timedelta(hours=5, minutes=30)
    return {
        "remainingMinutes": remaining_min,
        "etaDisplay": local_ist.strftime("%I:%M %p"),
        "etaIso": arrival_dt.isoformat(),
    }


def evaluate_candidates(cands: List[Dict[str, Any]], straight_km: float, now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    amp = traffic_amplitude(now)
    urban = straight_km < 45
    dists = [c["distanceKm"] for c in cands]
    dmin, span = min(dists), max(dists) - min(dists)
    out = []
    for c in cands:
        free = max(3.0, c["durationMin"] * COMMERCIAL_SPEED_FACTOR)
        rel = 0.5 if span < 0.5 else (c["distanceKm"] - dmin) / span  # 0 = shortest, 1 = longest
        # Shorter routes tend to run through congested city cores; longer bypasses stay freer.
        exposure = (0.05 + 0.30 * (1 - rel)) if urban else (0.02 + 0.10 * (1 - rel))
        delay = free * amp * exposure
        total = free + delay
        fuel = c["distanceKm"] * fuel_l_per_km(c["distanceKm"] / (total / 60.0))
        ratio = delay / free
        level = "Heavy" if ratio >= 0.2 else "Moderate" if ratio >= 0.09 else "Low"
        out.append({**c, "freeMin": free, "delayMin": delay, "totalMin": total, "fuelL": fuel, "level": level})
    return out


def select_strategies(ev: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    fast = min(ev, key=lambda c: c["totalMin"])
    short = min(ev, key=lambda c: (c["distanceKm"], c["totalMin"]))
    eco = min(ev, key=lambda c: c["fuelL"])
    others = [c for c in ev if c is not fast and c["totalMin"] <= fast["totalMin"] * 1.25]
    avoid = min(others, key=lambda c: c["delayMin"]) if others else fast
    if avoid is not fast and avoid["delayMin"] >= fast["delayMin"]:
        avoid = fast
    return {"Fastest Route": fast, "Traffic-Avoidance Route": avoid, "Shortest Route": short, "Fuel-Efficient Route": eco}


def build_route_alternatives(
    origin: str,
    destination: str,
    o_coords: Optional[List[float]] = None,
    d_coords: Optional[List[float]] = None,
    candidates: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    o = o_coords or resolve_coords(origin)
    d = d_coords or resolve_coords(destination)
    straight = max(0.5, _hav_km(o[0], o[1], d[0], d[1]))
    cands = candidates or synth_candidates(o, d)
    ev = evaluate_candidates(cands, straight)
    picks = select_strategies(ev)
    fast = picks["Fastest Route"]
    routes: List[Dict[str, Any]] = []
    seen: Dict[int, str] = {}
    for strategy in STRATEGY_ORDER:
        c = picks[strategy]
        style = STRATEGY_STYLE[strategy]
        minutes = max(5, int(round(c["totalMin"])))
        arrival = datetime.now(timezone.utc) + timedelta(minutes=minutes)
        if strategy == "Fastest Route":
            summary = f"Quickest option: about {minutes} min over {c['distanceKm']} km"
        elif strategy == "Traffic-Avoidance Route":
            if c is fast:
                summary = "Fastest road is also the least congested right now"
            else:
                saved = max(0, round(fast["delayMin"] - c["delayMin"]))
                summary = f"Avoids about {saved} min of expected congestion ({c['distanceKm'] - fast['distanceKm']:+.1f} km vs fastest)"
        elif strategy == "Shortest Route":
            summary = f"Minimum distance: {c['distanceKm']} km ({c['distanceKm'] - fast['distanceKm']:+.1f} km vs fastest)"
        else:
            summary = f"Lowest estimated diesel burn: {c['fuelL']:.1f} L at a steady average speed"
        routes.append({
            "id": f"RT-{style['key']}-{secrets.token_hex(2).upper()}",
            "strategy": strategy,
            "badge": style["badge"],
            "summary": summary,
            "distanceKm": c["distanceKm"],
            "durationMin": minutes,
            "trafficLevel": c["level"],
            "trafficDelayMin": int(round(c["delayMin"])),
            "fuelLitres": round(c["fuelL"], 2),
            "co2Kg": round(c["fuelL"] * 2.68, 1),
            "color": style["color"],
            "waypoints": c["waypoints"],
            "geometrySource": c.get("source", "osrm"),
            "sameRoadAs": seen.get(id(c)),
            "etaDisplay": (arrival + timedelta(hours=5, minutes=30)).strftime("%I:%M %p"),
            "etaIso": arrival.isoformat(),
        })
        seen.setdefault(id(c), strategy)
    return routes


def build_traffic_alert(origin: str, destination: str, routes: List[Dict[str, Any]]) -> Dict[str, Any]:
    fast = next(r for r in routes if r["strategy"] == "Fastest Route")
    avoid = next(r for r in routes if r["strategy"] == "Traffic-Avoidance Route")
    saved = fast["durationMin"] - avoid["durationMin"]
    corridor = f"{origin} → {destination}"
    if avoid["sameRoadAs"] is None and saved >= 2 and fast["trafficDelayMin"] >= 3:
        return {
            "detected": True,
            "corridor": corridor,
            "message": f"Estimated {fast['trafficDelayMin']} min congestion on the fastest road (time-of-day model, no live feed). Traffic-Avoidance Route saves about {saved} min.",
            "recommendedStrategy": "Traffic-Avoidance Route",
        }
    return {
        "detected": fast["trafficDelayMin"] >= 3,
        "corridor": corridor,
        "message": (
            f"Expected delay on this corridor is about {fast['trafficDelayMin']} min (time-of-day model). No alternative road is meaningfully faster."
            if fast["trafficDelayMin"] >= 3
            else "No significant congestion expected on this corridor right now."
        ),
        "recommendedStrategy": "Fastest Route",
    }


def plan_routes_blocking(
    origin: str,
    destination: str,
    o_hint: Any = None,
    d_hint: Any = None,
    raw_candidates: Any = None,
) -> Dict[str, Any]:
    """Geocode, fetch road geometry and evaluate all four strategies. Blocking: run via asyncio.to_thread."""
    o = coerce_coords(o_hint) or geocode_place(origin)
    if not o:
        raise ValueError(f"Could not locate '{origin}'. Try a more specific place name.")
    d = coerce_coords(d_hint) or geocode_place(destination)
    if not d:
        raise ValueError(f"Could not locate '{destination}'. Try a more specific place name.")
    cands = sanitize_candidates(raw_candidates) or fetch_road_candidates(o, d) or synth_candidates(o, d)
    routes = build_route_alternatives(origin, destination, o, d, cands)
    return {"origin": o, "destination": d, "routes": routes}


app = FastAPI(title="FleetFlow Milestone 2 API", version="2.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.get("/api")
async def api_root():
    return RedirectResponse(url="/", status_code=302)


@app.get("/api/health")
async def api_health():
    return {
        "ok": True,
        "service": "FleetFlow Milestone 2 Python FastAPI + WebSockets",
        "wsClients": len(ws_manager.active_connections),
    }


# --- WebSocket Endpoint for Real-Time GPS, Shipment & ETA Streaming ---
@app.websocket("/ws/tracking")
async def websocket_tracking(websocket: WebSocket, token: str = Query(default="")):
    user = resolve_user_from_token(token)
    if not user:
        await websocket.close(code=4401, reason="Unauthorized WebSocket token")
        return
    await ws_manager.connect(websocket, user)
    try:
        await websocket.send_text(json.dumps({
            "type": "CONNECTED",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "message": "Connected to FleetFlow Real-Time Telemetry Stream",
                "role": user["role"],
                "activeClients": len(ws_manager.active_connections),
            },
        }))
        while True:
            # Keep connection alive and handle client ping/heartbeat
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text(json.dumps({"type": "PONG", "timestamp": datetime.now(timezone.utc).isoformat()}))
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


# --- Auth Endpoints ---
@app.post("/api/auth/register", status_code=201)
async def auth_register(payload: Dict[str, Any]):
    email = str(payload.get("email") or "").strip().lower()
    name = str(payload.get("name") or "").strip()
    password = str(payload.get("password") or "")
    role = str(payload.get("role") or "")
    if len(name) < 2 or len(name) > 80 or not EMAIL_RE.match(email) or len(password) < 8 or len(password) > 200 or role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Enter a name, valid email, password with at least 8 characters, and choose a role.")
    if any(u["email"] == email for u in db["users"]):
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please sign in.")
    user = {
        "id": str(uuid.uuid4()),
        "name": name,
        "email": email,
        "role": role,
        "passwordHash": password_hash(password),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    db["users"].append(user)
    if role == "driver" and not any(d["name"].lower() == name.lower() for d in db["drivers"]):
        db["drivers"].append({
            "id": f"DR-{str(int(time.time() * 1000))[-4:]}",
            "name": name,
            "phone": "",
            "email": email,
            "address": "Bengaluru, Karnataka",
            "emergencyContact": "",
            "joinedOn": datetime.now(timezone.utc).strftime("%b %d, %Y"),
            "license": "Pending",
            "licenseType": "Commercial (LMV-TR)",
            "licenseIssueDate": "—",
            "licenseExpiryDate": "2028-12-31",
            "licenseDocument": "Pending upload",
            "documentVerified": False,
            "accountActive": True,
            "vehicle": "Unassigned",
            "status": "Available",
            "completedTrips": 0,
            "successfulDeliveries": 0,
            "delayedDeliveries": 0,
            "onTimeRate": 100,
            "totalDistanceKm": 0,
            "currentLocation": "Depot, Bengaluru",
            "speed": 0,
            "nextStop": "Awaiting assignment",
            "eta": "—",
        })
    save_db()
    return issue_session(user)


@app.post("/api/auth/login")
async def auth_login(payload: Dict[str, Any]):
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")
    user = next((u for u in db["users"] if u["email"] == email), None)
    if not user or not password_matches(password, user.get("passwordHash", "")):
        raise HTTPException(status_code=401, detail="That email and password combination was not found.")
    return issue_session(user)


@app.get("/api/auth/me")
async def auth_me(user: Dict[str, Any] = Depends(get_current_user)):
    return {"user": safe_user(user)}


@app.post("/api/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(default=None)):
    token = re.sub(r"^Bearer\s+", "", authorization or "", flags=re.IGNORECASE).strip()
    sessions.pop(token, None)
    return {"ok": True}


@app.patch("/api/profile")
async def update_profile(payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    name = str(payload.get("name") or "").strip()
    email = str(payload.get("email") or "").strip().lower()
    if len(name) < 2 or len(name) > 80 or not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Enter a name and a valid email address.")
    if any(item["id"] != user["id"] and item["email"] == email for item in db["users"]):
        raise HTTPException(status_code=409, detail="That email is already used by another account.")
    old_name = user["name"]
    user["name"] = name
    user["email"] = email
    if user["role"] == "driver" and old_name != name:
        for d in db["drivers"]:
            if d["name"] == old_name:
                d["name"] = name
                d["email"] = email
        for t in db["trips"]:
            if t["driver"] == old_name:
                t["driver"] = name
        for v in db["vehicles"]:
            if v["driver"] == old_name:
                v["driver"] = name
    save_db()
    return {"user": safe_user(user)}


# --- Users (Admin) ---
@app.get("/api/users")
async def list_users(user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] != "admin":
        raise forbidden()
    return [safe_user(u) for u in db["users"]]


@app.post("/api/users", status_code=201)
async def create_user(payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] != "admin":
        raise forbidden()
    name = str(payload.get("name") or "").strip()
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")
    role = str(payload.get("role") or "")
    if len(name) < 2 or not EMAIL_RE.match(email) or len(password) < 8 or role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Name, valid email, password of 8+ characters and a role are required.")
    if any(u["email"] == email for u in db["users"]):
        raise HTTPException(status_code=409, detail="That email is already registered.")
    created = {
        "id": str(uuid.uuid4()),
        "name": name,
        "email": email,
        "role": role,
        "passwordHash": password_hash(password),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    db["users"].append(created)
    save_db()
    return safe_user(created)


@app.patch("/api/users/{user_id}")
async def update_user_role(user_id: str, payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] != "admin":
        raise forbidden()
    target = next((u for u in db["users"] if u["id"] == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    new_role = payload.get("role")
    if new_role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Choose a valid role.")
    if target["id"] == user["id"] and new_role != "admin":
        raise HTTPException(status_code=400, detail="You cannot remove your own administrator access.")
    if target["role"] == "admin" and new_role != "admin" and sum(1 for u in db["users"] if u["role"] == "admin") <= 1:
        raise HTTPException(status_code=400, detail="Keep at least one administrator in the workspace.")
    target["role"] = new_role
    save_db()
    return safe_user(target)


@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] != "admin":
        raise forbidden()
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot remove your own account.")
    target = next((u for u in db["users"] if u["id"] == user_id), None)
    if target and target["role"] == "admin" and sum(1 for u in db["users"] if u["role"] == "admin") <= 1:
        raise HTTPException(status_code=400, detail="Keep at least one administrator in the workspace.")
    before = len(db["users"])
    db["users"] = [u for u in db["users"] if u["id"] != user_id]
    if len(db["users"]) == before:
        raise HTTPException(status_code=404, detail="User not found")
    save_db()
    return {"ok": True}


# --- Dashboard Overview ---
@app.get("/api/dashboard")
async def get_dashboard(user: Dict[str, Any] = Depends(get_current_user)):
    is_admin = user["role"] == "admin"
    vehicles = db["vehicles"]
    trips = db["trips"]
    shipments = db["shipments"]
    if user["role"] == "driver":
        vehicles = [v for v in db["vehicles"] if v["driver"] == user["name"]]
        trips = [t for t in db["trips"] if t["driver"] == user["name"]]
        shipments = [s for s in db["shipments"] if s.get("driverName") == user["name"]]
    drivers = [d for d in db["drivers"] if d["name"] == user["name"]] if user["role"] == "driver" else db["drivers"]
    maint = db["maintenance"] if user["role"] in ("admin", "fleet_manager") else []
    return {
        "vehicles": vehicles,
        "trips": trips,
        "shipments": shipments,
        "drivers": drivers,
        "maintenance": maint,
        "locationPings": db["locationPings"][:25],
        "summary": {
            "fleet": len(vehicles),
            "active": sum(1 for v in vehicles if v["status"] == "On route"),
            "available": sum(1 for v in vehicles if v["status"] == "Available"),
            "deliveries": sum(1 for t in trips if t["status"] == "Delivered"),
            "shipmentsActive": sum(1 for s in shipments if s["status"] in ("Assigned", "In Transit", "Delayed")),
            "shipmentsDelayed": sum(1 for s in shipments if s["status"] == "Delayed"),
            "onTime": 96,
            "distance": 1248,
            "fuel": 72,
            "drivers": len(drivers),
            "maintenanceDue": sum(1 for x in maint if x["status"] != "Complete"),
            "users": len(db["users"]) if is_admin else None,
        },
        "settings": db["settings"] if is_admin else {"googleMapsApiKey": db["settings"].get("googleMapsApiKey", "")},
    }


# --- Milestone 2: Hardware GPS Telemetry Ingestion & Simulator API ---
@app.post("/api/gps/ping")
async def ingest_gps_ping(
    payload: Dict[str, Any],
    authorization: Optional[str] = Header(default=None),
    x_device_key: Optional[str] = Header(default=None),
):
    """
    Receives real-time coordinates from a dedicated vehicle-installed GPS tracker (4G LTE SIM / IoT gateway)
    OR from the FleetFlow development GPS simulator.
    """
    token = re.sub(r"^Bearer\s+", "", authorization or "", flags=re.IGNORECASE).strip()
    user = resolve_user_from_token(token)
    valid_device_key = x_device_key and x_device_key == db["settings"].get("gpsIngestionSecret", "FF-IOT-KEY-2026")
    if not user and not valid_device_key:
        raise HTTPException(status_code=401, detail="Invalid device key or user session token.")

    vehicle_id = str(payload.get("vehicleId") or "").strip()
    vehicle = next((v for v in db["vehicles"] if v["id"] == vehicle_id), None)
    if not vehicle:
        raise HTTPException(status_code=404, detail=f"Vehicle {vehicle_id} not registered in FleetFlow.")

    try:
        lat = float(payload["lat"])
        lng = float(payload["lng"])
        speed = float(payload.get("speed", 0.0))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Valid numeric lat, lng, and speed are required.")

    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0) or speed < 0:
        raise HTTPException(status_code=400, detail="GPS coordinates or speed out of valid range.")

    source = str(payload.get("source") or ("SIMULATED_TELEMATICS" if user else "HARDWARE_GPS_SIM_DEVICE"))
    device_id = str(payload.get("deviceId") or vehicle.get("gpsDeviceId") or f"GPS-{vehicle_id}")
    ts = str(payload.get("timestamp") or datetime.now(timezone.utc).isoformat())
    location_label = str(payload.get("locationLabel") or f"{lat:.4f}° N, {lng:.4f}° E")

    # Update vehicle latest telemetry
    vehicle["lat"] = round(lat, 6)
    vehicle["lng"] = round(lng, 6)
    vehicle["speed"] = round(speed, 1)
    vehicle["gpsDeviceId"] = device_id
    vehicle["gpsSource"] = source
    vehicle["lastPingAt"] = ts
    vehicle["location"] = location_label
    if speed > 3 and vehicle["status"] == "Available":
        vehicle["status"] = "On route"

    ping_record = {
        "id": f"PING-{str(int(time.time() * 1000))[-5:]}",
        "vehicleId": vehicle_id,
        "deviceId": device_id,
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "speed": round(speed, 1),
        "heading": payload.get("heading", 90),
        "source": source,
        "timestamp": ts,
    }
    db["locationPings"].insert(0, ping_record)
    db["locationPings"] = db["locationPings"][:200]

    # Recalculate active trip progress & ETA
    updated_trip = None
    updated_shipments = []
    active_trip = next(
        (t for t in db["trips"] if t["vehicle"] == vehicle_id and t["status"] in ("In transit", "Delayed", "Scheduled")),
        None,
    )
    if active_trip:
        wps = active_trip.get("waypoints") or []
        avg_route_speed = 34.0
        if active_trip.get("distanceKm") and active_trip.get("durationMin"):
            avg_route_speed = max(18.0, float(active_trip["distanceKm"]) / (float(active_trip["durationMin"]) / 60.0))
        snapped = project_on_path(wps, lat, lng) if len(wps) >= 2 else None
        if snapped and snapped["offPathKm"] <= 3.0:
            pct = int(min(99, max(0, round(snapped["fraction"] * 100))))
            rem_dist = snapped["remainingKm"]
        else:
            dest_lat, dest_lng = active_trip.get("destCoords") or resolve_coords(active_trip["to"])
            orig_lat, orig_lng = active_trip.get("originCoords") or resolve_coords(active_trip["from"])
            total_dist = max(1.0, haversine_km(orig_lat, orig_lng, dest_lat, dest_lng))
            rem_dist = haversine_km(lat, lng, dest_lat, dest_lng)
            pct = int(min(99, max(0, round((1.0 - min(rem_dist, total_dist) / total_dist) * 100))))
        if payload.get("progress") is not None:
            try:
                pct = int(min(100, max(0, round(float(payload["progress"])))))
                total_km = float(active_trip.get("distanceKm") or 0)
                if total_km > 0:
                    rem_dist = total_km * (1 - pct / 100.0)
            except (TypeError, ValueError):
                pass
        traffic_mult = 1.35 if active_trip["status"] == "Delayed" else 1.0
        eta_calc = compute_eta(rem_dist, speed, traffic_mult, avg_route_speed)
        active_trip["progress"] = pct
        active_trip["eta"] = eta_calc["etaDisplay"]
        active_trip["etaIso"] = eta_calc["etaIso"]
        active_trip["nextStop"] = f"{active_trip['to']} ({rem_dist:.1f} km remaining)"
        updated_trip = active_trip

        # Sync associated shipments
        for shp in db["shipments"]:
            if shp.get("tripId") == active_trip["id"] and shp["status"] not in ("Delivered", "Cancelled"):
                shp["eta"] = eta_calc["etaDisplay"]
                shp["estimatedArrival"] = eta_calc["etaIso"]
                if shp["status"] == "Assigned":
                    shp["status"] = "In Transit"
                    shp["history"].append({
                        "status": "In Transit",
                        "timestamp": ts,
                        "note": f"GPS motion detected ({speed:.1f} km/h) on {vehicle_id}",
                    })
                updated_shipments.append(shp)

    # Sync driver profile live GPS telemetry
    driver_obj = next((d for d in db["drivers"] if d["name"] == vehicle["driver"]), None)
    if driver_obj:
        driver_obj["currentLocation"] = location_label
        driver_obj["speed"] = round(speed, 1)
        if updated_trip:
            driver_obj["eta"] = updated_trip["eta"]
            driver_obj["nextStop"] = updated_trip["nextStop"]

    save_db()

    broadcast_payload = {
        "ping": ping_record,
        "vehicle": vehicle,
        "driverName": vehicle["driver"],
        "trip": updated_trip,
        "shipments": updated_shipments,
    }
    await ws_manager.broadcast("GPS_UPDATE", broadcast_payload)
    return broadcast_payload


@app.get("/api/gps/provider-info")
async def get_gps_provider_info(user: Dict[str, Any] = Depends(get_current_user)):
    return {
        "deviceModel": "Teltonika FMB920 / OBD-II 4G LTE Cellular GPS Tracker",
        "phoneIndependent": True,
        "connectivity": "Embedded M2M IoT SIM (4G LTE / GPRS fallback) -> HTTPS/MQTT Telemetry Gateway",
        "ingestionEndpoint": "POST /api/gps/ping",
        "authHeader": "X-Device-Key",
        "websocketStream": "WS /ws/tracking?token=<jwt_or_session_token>",
        "payloadSchema": {
            "vehicleId": "VH-1042",
            "deviceId": "GPS-SIM-1042",
            "lat": 12.9698,
            "lng": 77.7500,
            "speed": 48.5,
            "timestamp": "2026-11-25T10:15:00Z",
            "source": "HARDWARE_GPS_SIM_DEVICE | SIMULATED_TELEMATICS",
        },
        "simulationActive": True,
        "simulationNote": "Physical vehicle hardware is unavailable in local dev; simulated coordinates are tagged as SIMULATED_TELEMATICS.",
    }


@app.get("/api/trips/{trip_id}")
async def get_trip_details(trip_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    trip = next((t for t in db["trips"] if t["id"] == trip_id), None)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    vehicle = next((v for v in db["vehicles"] if v["id"] == trip["vehicle"]), None)
    driver = next((d for d in db["drivers"] if d["name"] == trip["driver"]), None)
    linked_shipments = [s for s in db["shipments"] if s.get("tripId") == trip_id]
    return {
        "trip": trip,
        "vehicle": vehicle,
        "driver": driver,
        "shipments": linked_shipments,
    }


@app.get("/api/gps/latest")
async def get_latest_gps(user: Dict[str, Any] = Depends(get_current_user)):
    vehicles = db["vehicles"]
    if user["role"] == "driver":
        vehicles = [v for v in vehicles if v["driver"] == user["name"]]
    return {
        "vehicles": [
            {
                "vehicleId": v["id"],
                "name": v["name"],
                "plate": v["plate"],
                "driver": v["driver"],
                "status": v["status"],
                "lat": v.get("lat"),
                "lng": v.get("lng"),
                "speed": v.get("speed", 0),
                "gpsDeviceId": v.get("gpsDeviceId"),
                "gpsSource": v.get("gpsSource", "SIMULATED_TELEMATICS"),
                "lastPingAt": v.get("lastPingAt"),
                "location": v.get("location"),
            }
            for v in vehicles
        ],
        "recentPings": db["locationPings"][:20],
    }


# --- Milestone 2: Route Optimization & Traffic-Aware Planning ---
@app.post("/api/routes/optimize")
async def optimize_routes(payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    origin = str(payload.get("origin") or "").strip()
    destination = str(payload.get("destination") or "").strip()
    if not origin or not destination:
        raise HTTPException(status_code=400, detail="Origin and destination are required to optimize routes.")
    try:
        plan = await asyncio.to_thread(
            plan_routes_blocking, origin, destination,
            payload.get("originCoords"), payload.get("destinationCoords"), payload.get("candidates"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    routes = plan["routes"]
    return {
        "origin": origin,
        "destination": destination,
        "originCoords": plan["origin"],
        "destinationCoords": plan["destination"],
        "routes": routes,
        "geometrySource": routes[0].get("geometrySource", "osrm"),
        "trafficAlert": build_traffic_alert(origin, destination, routes),
    }


@app.post("/api/trips/{trip_id}/reroute")
async def reroute_trip(trip_id: str, payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] not in ("admin", "fleet_manager", "dispatcher"):
        raise forbidden()
    trip = next((t for t in db["trips"] if t["id"] == trip_id), None)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip["status"] in ("Delivered", "Cancelled"):
        raise HTTPException(status_code=409, detail=f"Trip {trip_id} is already {trip['status']} and cannot be rerouted.")
    strategy = str(payload.get("strategy") or "Traffic-Avoidance Route")
    if strategy not in STRATEGY_ORDER:
        raise HTTPException(status_code=400, detail=f"Unknown route strategy '{strategy}'.")

    old_wps = trip.get("waypoints") or []
    progress = float(trip.get("progress") or 0)
    from_current = len(old_wps) >= 2 and 3 <= progress <= 97
    prefix: List[List[float]] = []
    start: Any = trip.get("originCoords")
    if from_current:
        cur = point_at_fraction(old_wps, progress / 100.0)
        prefix = [list(p) for p in old_wps[: cur["index"] + 1]] + [cur["pos"]]
        start = cur["pos"]
    try:
        plan = await asyncio.to_thread(plan_routes_blocking, trip["from"], trip["to"], start, trip.get("destCoords"), None)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    routes = plan["routes"]
    chosen = next(r for r in routes if r["strategy"] == strategy)

    trip["routeId"] = chosen["id"]
    trip["routeStrategy"] = chosen["strategy"]
    trip["eta"] = chosen["etaDisplay"]
    trip["etaIso"] = chosen["etaIso"]
    trip["destCoords"] = plan["destination"]
    if from_current:
        prefix_km = path_length_km(prefix)
        total_km = prefix_km + chosen["distanceKm"]
        trip["waypoints"] = prefix + chosen["waypoints"][1:]
        trip["distanceKm"] = round(total_km, 1)
        trip["durationMin"] = int(round(chosen["durationMin"] / max(0.05, 1 - prefix_km / max(total_km, 0.1))))
        trip["progress"] = int(round(prefix_km / max(total_km, 0.1) * 100))
        trip["nextStop"] = f"{trip['to']} ({chosen['distanceKm']} km remaining)"
    else:
        trip["originCoords"] = plan["origin"]
        trip["waypoints"] = chosen["waypoints"]
        trip["distanceKm"] = chosen["distanceKm"]
        trip["durationMin"] = chosen["durationMin"]
        trip["nextStop"] = f"{trip['to']} ({chosen['distanceKm']} km remaining)"
    if trip["status"] == "Delayed" and strategy == "Traffic-Avoidance Route":
        trip["status"] = "In transit"

    ts = datetime.now(timezone.utc).isoformat()
    for shp in db["shipments"]:
        if shp.get("tripId") == trip["id"] and shp["status"] not in ("Delivered", "Cancelled"):
            shp["eta"] = chosen["etaDisplay"]
            shp["estimatedArrival"] = chosen["etaIso"]
            if shp["status"] == "Delayed" and strategy == "Traffic-Avoidance Route":
                shp["status"] = "In Transit"
            shp["history"].append({
                "status": shp["status"],
                "timestamp": ts,
                "note": f"Route updated to {chosen['strategy']} (New ETA: {chosen['etaDisplay']})",
            })

    save_db()
    await ws_manager.broadcast("ROUTE_UPDATED", {"trip": trip, "driverName": trip["driver"]})
    return {"trip": trip, "selectedRoute": chosen}


# --- Milestone 2: Shipment Tracking & Status Workflow ---

# --- Milestone 2 Feature 8: Dedicated ETA Calculation & Delivery Progress Engine ---
@app.get("/api/eta/overview")
async def get_eta_overview(user: Dict[str, Any] = Depends(get_current_user)):
    items = []
    for shp in db["shipments"]:
        if user["role"] == "driver" and shp.get("driverName") != user["name"]:
            continue
        trip = next((t for t in db["trips"] if t["id"] == shp.get("tripId")), None)
        vehicle = next((v for v in db["vehicles"] if v["id"] == shp.get("vehicleId")), None)

        total_dist = float(trip.get("distanceKm", 16.4)) if trip else 18.0
        progress = int(trip.get("progress", 100 if shp["status"] == "Delivered" else 0)) if trip else (100 if shp["status"] == "Delivered" else 0)
        rem_dist = round(max(0.0, total_dist * (1.0 - progress / 100.0)), 1)
        speed = float(vehicle.get("speed", 38.0)) if vehicle else 36.0
        traffic_mult = 1.35 if shp["status"] == "Delayed" else 1.0
        eta_calc = compute_eta(rem_dist if rem_dist > 0 else 1.0, speed, traffic_mult)

        delay_flag = shp["status"] == "Delayed" or int(shp.get("delayMinutes", 0)) > 10
        items.append({
            "shipmentId": shp["id"],
            "cargo": shp.get("cargo", "Freight"),
            "origin": shp["origin"],
            "destination": shp["destination"],
            "status": shp["status"],
            "vehicleId": shp.get("vehicleId") or "Unassigned",
            "driverName": shp.get("driverName") or "Unassigned",
            "currentLocation": vehicle.get("location") if vehicle else shp["origin"],
            "distanceRemainingKm": 0.0 if shp["status"] == "Delivered" else rem_dist,
            "totalDistanceKm": total_dist,
            "plannedRoute": f"{total_dist} km | {trip.get('durationMin', 34) if trip else 35} mins ({trip.get('routeStrategy', 'Fastest Route') if trip else 'Standard'})",
            "progress": progress,
            "actualDeparture": trip.get("scheduledDeparture", "2026-11-25T09:00:00Z") if trip else "Pending",
            "expectedDelivery": shp.get("eta") or eta_calc["etaDisplay"],
            "remainingDurationText": "Delivered" if shp["status"] == "Delivered" else f"{eta_calc['remainingMinutes']} mins",
            "actualArrival": shp.get("actualArrival"),
            "delayStatus": "Delayed" if delay_flag else "On Time",
            "delayMinutes": int(shp.get("delayMinutes", 0)),
        })
    return {"items": items, "delayThresholdMin": 10}


@app.post("/api/shipments/{shipment_id}/recalculate-eta")
async def recalculate_shipment_eta(shipment_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    shp = next((s for s in db["shipments"] if s["id"] == shipment_id), None)
    if not shp:
        raise HTTPException(status_code=404, detail="Shipment not found")
    trip = next((t for t in db["trips"] if t["id"] == shp.get("tripId")), None)
    vehicle = next((v for v in db["vehicles"] if v["id"] == shp.get("vehicleId")), None)

    total_dist = float(trip.get("distanceKm", 16.4)) if trip else 15.0
    progress = int(trip.get("progress", 45)) if trip else 35
    rem_dist = round(max(1.2, total_dist * (1.0 - progress / 100.0)), 1)
    speed = float(vehicle.get("speed", 40.0)) if vehicle and float(vehicle.get("speed", 0)) > 5 else 38.0
    traffic_mult = 1.35 if shp["status"] == "Delayed" else 1.0

    eta_info = compute_eta(rem_dist, speed, traffic_mult)
    shp["eta"] = eta_info["etaDisplay"]
    shp["estimatedArrival"] = eta_info["etaIso"]
    if trip:
        trip["eta"] = eta_info["etaDisplay"]
        trip["etaIso"] = eta_info["etaIso"]

    ts = datetime.now(timezone.utc).isoformat()
    shp["history"].append({
        "status": shp["status"],
        "timestamp": ts,
        "note": f"ETA recalculated to {eta_info['etaDisplay']} ({rem_dist} km remaining at {speed:.1f} km/h)",
    })
    save_db()
    await ws_manager.broadcast("SHIPMENT_UPDATE", {"shipment": shp, "driverName": shp.get("driverName")})
    return {"shipment": shp, "eta": eta_info}


@app.get("/api/shipments")
async def list_shipments(user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] == "driver":
        return [s for s in db["shipments"] if s.get("driverName") == user["name"]]
    return db["shipments"]


@app.post("/api/shipments", status_code=201)
async def create_shipment(payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] not in ("admin", "fleet_manager", "dispatcher"):
        raise forbidden()
    origin = str(payload.get("origin") or "").strip()
    destination = str(payload.get("destination") or "").strip()
    cargo = str(payload.get("cargo") or "General Freight").strip()
    weight = str(payload.get("weight") or "350 kg").strip()
    trip_id = str(payload.get("tripId") or "").strip() or None
    if not origin or not destination:
        raise HTTPException(status_code=400, detail="Origin and destination are required.")

    ts = datetime.now(timezone.utc).isoformat()
    trip = next((t for t in db["trips"] if t["id"] == trip_id), None) if trip_id else None
    initial_status = "Assigned" if trip else "Created"
    eta_str = trip["eta"] if trip else compute_eta(15.0, 35.0)["etaDisplay"]

    history = [{"status": "Created", "timestamp": ts, "note": f"Shipment registered ({cargo}, {weight})"}]
    if trip:
        history.append({"status": "Assigned", "timestamp": ts, "note": f"Assigned to trip {trip['id']} ({trip['vehicle']})"})

    record = {
        "id": f"SHP-{str(int(time.time() * 1000))[-4:]}",
        "cargo": cargo[:80],
        "weight": weight[:30],
        "origin": origin[:80],
        "destination": destination[:80],
        "tripId": trip["id"] if trip else None,
        "vehicleId": trip["vehicle"] if trip else None,
        "driverName": trip["driver"] if trip else "Unassigned",
        "status": initial_status,
        "eta": eta_str,
        "estimatedArrival": trip.get("etaIso") if trip else None,
        "actualArrival": None,
        "delayMinutes": 0,
        "history": history,
    }
    db["shipments"].insert(0, record)
    save_db()
    await ws_manager.broadcast("SHIPMENT_UPDATE", {"shipment": record, "driverName": record["driverName"]})
    return record


@app.patch("/api/shipments/{shipment_id}")
async def update_shipment(shipment_id: str, payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    shp = next((s for s in db["shipments"] if s["id"] == shipment_id), None)
    if not shp:
        raise HTTPException(status_code=404, detail="Shipment not found")
    if user["role"] == "driver" and shp.get("driverName") != user["name"]:
        raise forbidden()

    ts = datetime.now(timezone.utc).isoformat()
    if "tripId" in payload:
        trip_id = payload["tripId"] or None
        trip = next((t for t in db["trips"] if t["id"] == trip_id), None) if trip_id else None
        shp["tripId"] = trip["id"] if trip else None
        shp["vehicleId"] = trip["vehicle"] if trip else None
        shp["driverName"] = trip["driver"] if trip else "Unassigned"
        if trip:
            shp["eta"] = trip["eta"]
            if shp["status"] == "Created":
                shp["status"] = "Assigned"
            shp["history"].append({
                "status": shp["status"],
                "timestamp": ts,
                "note": f"Assigned to trip {trip['id']} · Vehicle {trip['vehicle']} ({trip['driver']})",
            })

    if "status" in payload and payload["status"] != shp["status"]:
        next_status = str(payload["status"])
        allowed = SHIPMENT_TRANSITIONS.get(shp["status"], set())
        if next_status not in allowed and user["role"] != "admin":
            raise HTTPException(
                status_code=400,
                detail=f"Invalid shipment transition from '{shp['status']}' to '{next_status}'. Allowed: {', '.join(allowed) or 'None'}",
            )
        shp["status"] = next_status
        note = str(payload.get("note") or f"Status updated to {next_status}")
        if next_status == "Delivered":
            local_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            shp["actualArrival"] = local_now.strftime("%I:%M %p")
            shp["etaVarianceNote"] = f"Delivered at {shp['actualArrival']} (Scheduled ETA: {shp.get('eta', 'On schedule')})"
        if next_status == "Delayed":
            shp["delayMinutes"] = int(payload.get("delayMinutes") or 15)
        shp["history"].append({"status": next_status, "timestamp": ts, "note": note})

    save_db()
    await ws_manager.broadcast("SHIPMENT_UPDATE", {"shipment": shp, "driverName": shp.get("driverName")})
    return shp


# --- Settings ---
@app.get("/api/settings")
async def get_settings(user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] != "admin":
        raise forbidden()
    return db["settings"]


@app.patch("/api/settings")
async def update_settings(payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] != "admin":
        raise forbidden()
    for key in ("company", "baseCity", "currency", "gpsGatewayProvider", "gpsIngestionSecret", "googleMapsApiKey"):
        if isinstance(payload.get(key), str):
            db["settings"][key] = payload[key][:160]
    save_db()
    return db["settings"]


# --- Drivers (Full Milestone 2 Profile & Admin Actions) ---
@app.get("/api/drivers")
async def list_drivers(user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] == "driver":
        return [d for d in db["drivers"] if d["name"] == user["name"]]
    return db["drivers"]


@app.post("/api/drivers", status_code=201)
async def create_driver(payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] not in ("admin", "fleet_manager"):
        raise forbidden()
    if not payload.get("name") or not payload.get("license"):
        raise HTTPException(status_code=400, detail="Driver name and license are required")
    record = {
        "id": f"DR-{str(int(time.time() * 1000))[-4:]}",
        "name": str(payload["name"])[:80],
        "phone": str(payload.get("phone") or "")[:24],
        "email": str(payload.get("email") or "")[:80],
        "address": str(payload.get("address") or "Bengaluru, Karnataka")[:100],
        "emergencyContact": str(payload.get("emergencyContact") or "")[:24],
        "joinedOn": datetime.now(timezone.utc).strftime("%b %d, %Y"),
        "license": str(payload["license"])[:40],
        "licenseType": str(payload.get("licenseType") or "Commercial (HMV)")[:40],
        "licenseIssueDate": str(payload.get("licenseIssueDate") or "Jan 10, 2023")[:30],
        "licenseExpiryDate": str(payload.get("licenseExpiryDate") or "Jan 10, 2029")[:30],
        "licenseDocument": f"{str(payload['license'])[:20]}_verified.pdf",
        "documentVerified": bool(payload.get("documentVerified", True)),
        "accountActive": True,
        "vehicle": str(payload.get("vehicle") or "Unassigned"),
        "status": "Available",
        "completedTrips": 0,
        "successfulDeliveries": 0,
        "delayedDeliveries": 0,
        "onTimeRate": 100,
        "totalDistanceKm": 0,
        "currentLocation": "Depot, Bengaluru",
        "speed": 0,
        "nextStop": "Awaiting assignment",
        "eta": "—",
    }
    db["drivers"].insert(0, record)
    assigned = next((v for v in db["vehicles"] if v["id"] == record["vehicle"]), None)
    if assigned:
        assigned["driver"] = record["name"]
    save_db()
    return record


@app.patch("/api/drivers/{driver_id}")
async def update_driver(driver_id: str, payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] not in ("admin", "fleet_manager"):
        raise forbidden()
    driver = next((d for d in db["drivers"] if d["id"] == driver_id), None)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    allowed_fields = (
        "name",
        "phone",
        "email",
        "address",
        "emergencyContact",
        "license",
        "licenseType",
        "licenseIssueDate",
        "licenseExpiryDate",
        "vehicle",
        "status",
    )
    for key in allowed_fields:
        if payload.get(key) is not None:
            driver[key] = str(payload[key])[:100]
    if "documentVerified" in payload:
        driver["documentVerified"] = bool(payload["documentVerified"])
    if "accountActive" in payload:
        driver["accountActive"] = bool(payload["accountActive"])
        if not driver["accountActive"]:
            driver["status"] = "Off Duty"
    if payload.get("vehicle"):
        for v in db["vehicles"]:
            if v["driver"] == driver["name"] and v["id"] != payload["vehicle"]:
                v["driver"] = "Unassigned"
        target_v = next((v for v in db["vehicles"] if v["id"] == payload["vehicle"]), None)
        if target_v:
            target_v["driver"] = driver["name"]
    save_db()
    return driver


@app.delete("/api/drivers/{driver_id}")
async def delete_driver(driver_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] != "admin":
        raise forbidden()
    before = len(db["drivers"])
    db["drivers"] = [d for d in db["drivers"] if d["id"] != driver_id]
    if len(db["drivers"]) == before:
        raise HTTPException(status_code=404, detail="Driver not found")
    save_db()
    return {"ok": True}


# --- Maintenance ---
@app.get("/api/maintenance")
async def list_maintenance(user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] not in ("admin", "fleet_manager"):
        raise forbidden()
    return db["maintenance"]


@app.post("/api/maintenance", status_code=201)
async def create_maintenance(payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] not in ("admin", "fleet_manager"):
        raise forbidden()
    if not payload.get("vehicle") or not payload.get("service"):
        raise HTTPException(status_code=400, detail="Vehicle and service type are required")
    vehicle = next((x for x in db["vehicles"] if x["id"] == payload["vehicle"]), None)
    record = {
        "id": f"WO-{str(int(time.time() * 1000))[-3:]}",
        "vehicle": payload["vehicle"],
        "name": vehicle["name"] if vehicle else "Vehicle",
        "service": str(payload["service"])[:80],
        "due": payload.get("due") or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "status": "Scheduled",
    }
    db["maintenance"].insert(0, record)
    save_db()
    return record


@app.patch("/api/maintenance/{work_order_id}")
async def update_maintenance(work_order_id: str, payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] not in ("admin", "fleet_manager"):
        raise forbidden()
    item = next((x for x in db["maintenance"] if x["id"] == work_order_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Work order not found")
    if payload.get("status"):
        item["status"] = str(payload["status"])[:30]
    save_db()
    return item


@app.delete("/api/maintenance/{work_order_id}")
async def delete_maintenance(work_order_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] != "admin":
        raise forbidden()
    before = len(db["maintenance"])
    db["maintenance"] = [x for x in db["maintenance"] if x["id"] != work_order_id]
    if len(db["maintenance"]) == before:
        raise HTTPException(status_code=404, detail="Work order not found")
    save_db()
    return {"ok": True}


# --- Vehicles ---
@app.get("/api/vehicles")
async def list_vehicles(user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] == "driver":
        return [v for v in db["vehicles"] if v["driver"] == user["name"]]
    return db["vehicles"]


@app.post("/api/vehicles", status_code=201)
async def create_vehicle(payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] not in ("admin", "fleet_manager"):
        raise forbidden()
    if not payload.get("name") or not payload.get("plate"):
        raise HTTPException(status_code=400, detail="Vehicle name and registration are required")
    vid = f"VH-{str(int(time.time() * 1000))[-4:]}"
    record = {
        "id": vid,
        "name": str(payload["name"])[:80],
        "plate": str(payload["plate"])[:24].upper(),
        "type": str(payload.get("type") or "Van")[:30],
        "capacity": str(payload.get("capacity") or "Not set")[:30],
        "fuelType": str(payload.get("fuelType") or "Diesel")[:30],
        "driver": str(payload.get("driver") or "Unassigned")[:60],
        "status": "Available",
        "fuel": 100,
        "mileage": 0,
        "location": "Depot, Bengaluru",
        "lat": 12.9716,
        "lng": 77.5946,
        "speed": 0.0,
        "gpsDeviceId": f"GPS-SIM-{vid[-4:]}",
        "gpsSource": "SIMULATED_TELEMATICS",
        "lastPingAt": datetime.now(timezone.utc).isoformat(),
        "service": payload.get("service") or "2026-12-01",
        "color": "#e4e9e3",
    }
    db["vehicles"].insert(0, record)
    save_db()
    return record


@app.delete("/api/vehicles/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] != "admin":
        raise forbidden()
    before = len(db["vehicles"])
    db["vehicles"] = [v for v in db["vehicles"] if v["id"] != vehicle_id]
    if len(db["vehicles"]) == before:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    save_db()
    return {"ok": True}


@app.patch("/api/vehicles/{vehicle_id}")
async def update_vehicle(vehicle_id: str, payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] not in ("admin", "fleet_manager", "dispatcher"):
        raise forbidden()
    vehicle = next((x for x in db["vehicles"] if x["id"] == vehicle_id), None)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if user["role"] == "dispatcher" and any(k not in ("driver", "status") for k in payload.keys()):
        raise forbidden()
    if "driver" in payload and payload["driver"] is not None:
        previous = next((d for d in db["drivers"] if d["name"] == vehicle["driver"]), None)
        if previous and previous["vehicle"] == vehicle["id"]:
            previous["vehicle"] = "Unassigned"
    for key in ("driver", "status", "fuel", "location"):
        if payload.get(key) is not None:
            vehicle[key] = payload[key]
    if "driver" in payload and payload["driver"] is not None:
        assigned = next((d for d in db["drivers"] if d["name"] == vehicle["driver"]), None)
        if assigned:
            assigned["vehicle"] = vehicle["id"]
    if "status" in payload and payload["status"] is not None:
        assigned = next((d for d in db["drivers"] if d["name"] == vehicle["driver"]), None)
        if assigned:
            assigned["status"] = "On Trip" if payload["status"] == "On route" else "Available"
    save_db()
    return vehicle


# --- Trips (Conflict Detection + Route Association + Shipment Linking) ---
@app.get("/api/trips")
async def list_trips(user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] == "driver":
        return [t for t in db["trips"] if t["driver"] == user["name"]]
    return db["trips"]


@app.post("/api/trips", status_code=201)
async def create_trip(payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    if user["role"] not in ("admin", "fleet_manager", "dispatcher"):
        raise forbidden()
    origin = str(payload.get("from") or "").strip()
    destination = str(payload.get("to") or "").strip()
    if not origin or not destination:
        raise HTTPException(status_code=400, detail="Pickup and destination are required")

    driver_name = str(payload.get("driver") or "Unassigned")[:60]
    vehicle_id = str(payload.get("vehicle") or "—")[:30]
    strategy = str(payload.get("routeStrategy") or "Fastest Route")
    shipment_id = str(payload.get("shipmentId") or "").strip() or None

    # Validate availability & prevent conflicting assignments
    assigned_vehicle = next((v for v in db["vehicles"] if v["id"] == vehicle_id), None)
    if vehicle_id != "—" and not assigned_vehicle:
        raise HTTPException(status_code=404, detail="Selected vehicle does not exist.")
    if assigned_vehicle and assigned_vehicle["status"] == "In service":
        raise HTTPException(
            status_code=409,
            detail=f"Conflict: {assigned_vehicle['name']} ({assigned_vehicle['id']}) is currently 'In service'.",
        )

    assigned_driver = next((d for d in db["drivers"] if d["name"] == driver_name), None)
    if driver_name != "Unassigned" and assigned_driver:
        if not assigned_driver.get("accountActive", True) or assigned_driver["status"] in ("Off Duty", "On leave"):
            raise HTTPException(
                status_code=409,
                detail=f"Conflict: Driver {assigned_driver['name']} is currently '{assigned_driver['status']}'.",
            )

    active_states = ("In transit", "Delayed", "Scheduled")
    if assigned_vehicle:
        busy = next((t for t in db["trips"] if t["vehicle"] == vehicle_id and t["status"] in active_states), None)
        if busy:
            raise HTTPException(
                status_code=409,
                detail=f"Conflict: {vehicle_id} is already on trip {busy['id']} ({busy['from']} → {busy['to']}). Complete or reroute it first.",
            )
    if driver_name != "Unassigned":
        busy_driver = next((t for t in db["trips"] if t["driver"] == driver_name and t["status"] in active_states), None)
        if busy_driver:
            raise HTTPException(
                status_code=409,
                detail=f"Conflict: Driver {driver_name} is already on trip {busy_driver['id']} ({busy_driver['from']} → {busy_driver['to']}).",
            )
    if strategy not in STRATEGY_ORDER:
        strategy = "Fastest Route"

    o_hint = [payload.get("originLat"), payload.get("originLng")]
    d_hint = [payload.get("destLat"), payload.get("destLng")]
    try:
        plan = await asyncio.to_thread(
            plan_routes_blocking, origin, destination, o_hint, d_hint, payload.get("candidates")
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    routes = plan["routes"]
    chosen_route = next(r for r in routes if r["strategy"] == strategy)

    record = {
        "id": f"TR-{str(int(time.time() * 1000))[-4:]}",
        "from": origin[:80],
        "to": destination[:80],
        "driver": driver_name,
        "vehicle": vehicle_id,
        "routeId": chosen_route["id"],
        "routeStrategy": chosen_route["strategy"],
        "distanceKm": chosen_route["distanceKm"],
        "durationMin": chosen_route["durationMin"],
        "scheduledDeparture": payload.get("scheduledDeparture") or datetime.now(timezone.utc).isoformat(),
        "eta": chosen_route["etaDisplay"],
        "etaIso": chosen_route["etaIso"],
        "status": "In transit",
        "progress": 0,
        "nextStop": f"{destination} ({chosen_route['distanceKm']} km remaining)",
        "waypoints": chosen_route["waypoints"],
        "originCoords": plan["origin"],
        "destCoords": plan["destination"],
    }
    db["trips"].insert(0, record)

    o_lat, o_lng = plan["origin"]
    if assigned_vehicle:
        assigned_vehicle["status"] = "On route"
        assigned_vehicle["lat"] = o_lat
        assigned_vehicle["lng"] = o_lng
        assigned_vehicle["location"] = f"{origin} → {destination}"
        if driver_name != "Unassigned":
            assigned_vehicle["driver"] = driver_name
    if assigned_driver:
        if assigned_vehicle:
            assigned_driver["vehicle"] = assigned_vehicle["id"]
        assigned_driver["status"] = "On Trip"
        assigned_driver["currentLocation"] = origin
        assigned_driver["nextStop"] = destination
        assigned_driver["eta"] = chosen_route["etaDisplay"]

    # Link shipment if provided
    if shipment_id:
        shp = next((s for s in db["shipments"] if s["id"] == shipment_id), None)
        if shp:
            ts = datetime.now(timezone.utc).isoformat()
            shp["tripId"] = record["id"]
            shp["vehicleId"] = vehicle_id if vehicle_id != "—" else None
            shp["driverName"] = driver_name
            shp["status"] = "In Transit"
            shp["eta"] = chosen_route["etaDisplay"]
            shp["estimatedArrival"] = chosen_route["etaIso"]
            shp["history"].append({
                "status": "In Transit",
                "timestamp": ts,
                "note": f"Dispatched on trip {record['id']} ({chosen_route['strategy']})",
            })

    save_db()
    await ws_manager.broadcast("TRIP_CREATED", {"trip": record, "driverName": driver_name})
    return record


@app.patch("/api/trips/{trip_id}")
async def update_trip(trip_id: str, payload: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    trip = next((x for x in db["trips"] if x["id"] == trip_id), None)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if user["role"] == "driver" and trip["driver"] != user["name"]:
        raise forbidden()
    if user["role"] == "driver" and any(k not in ("status", "progress") for k in payload.keys()):
        raise forbidden()
    for key in ("status", "progress", "eta"):
        if payload.get(key) is not None:
            trip[key] = payload[key]
    if payload.get("status"):
        vehicle = next((v for v in db["vehicles"] if v["id"] == trip["vehicle"]), None)
        if vehicle and payload["status"] in ("Delivered", "In transit", "Delayed"):
            vehicle["status"] = "Available" if payload["status"] == "Delivered" else "On route"
            if payload["status"] == "Delivered":
                vehicle["speed"] = 0.0
                d_lat, d_lng = resolve_coords(trip["to"])
                vehicle["lat"] = d_lat
                vehicle["lng"] = d_lng
                vehicle["location"] = trip["to"]
        driver = next((d for d in db["drivers"] if d["name"] == trip["driver"]), None)
        if driver and payload["status"] in ("Delivered", "In transit", "Delayed"):
            driver["status"] = "Available" if payload["status"] == "Delivered" else "On Trip"
            if payload["status"] == "Delivered":
                driver["completedTrips"] = int(driver.get("completedTrips", 0)) + 1
                driver["successfulDeliveries"] = int(driver.get("successfulDeliveries", 0)) + 1
                driver["speed"] = 0
                driver["nextStop"] = "Completed"
        if payload["status"] == "Delivered":
            trip["progress"] = 100
            trip["nextStop"] = "Completed"
            ts = datetime.now(timezone.utc).isoformat()
            for shp in db["shipments"]:
                if shp.get("tripId") == trip["id"] and shp["status"] not in ("Delivered", "Cancelled"):
                    shp["status"] = "Delivered"
                    shp["actualArrival"] = ts
                    shp["history"].append({
                        "status": "Delivered",
                        "timestamp": ts,
                        "note": f"Trip {trip['id']} marked Delivered",
                    })
    # Keep the assigned vehicle on the trip's road path (interpolated, not stepped)
    vehicle_for_trip = next((v for v in db["vehicles"] if v["id"] == trip["vehicle"]), None)
    if (
        vehicle_for_trip
        and len(trip.get("waypoints") or []) >= 2
        and (payload.get("progress") is not None or payload.get("status") == "Delivered")
    ):
        pct_frac = max(0.0, min(1.0, float(trip.get("progress", 0)) / 100.0))
        pt = point_at_fraction(trip["waypoints"], pct_frac)["pos"]
        vehicle_for_trip["lat"] = round(float(pt[0]), 6)
        vehicle_for_trip["lng"] = round(float(pt[1]), 6)
        if pct_frac >= 0.99 or trip.get("status") == "Delivered":
            vehicle_for_trip["location"] = trip["to"]
        elif pct_frac <= 0.02:
            vehicle_for_trip["location"] = trip["from"]
        else:
            vehicle_for_trip["location"] = f"{trip['from']} → {trip['to']} ({int(pct_frac*100)}%)"

    save_db()
    await ws_manager.broadcast("TRIP_UPDATED", {"trip": trip, "driverName": trip["driver"]})
    return trip


DIST_DIR = ROOT.parent / "frontend" / "dist"
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
