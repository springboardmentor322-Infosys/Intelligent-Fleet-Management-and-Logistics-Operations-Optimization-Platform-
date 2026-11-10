"""Dummy data for development/testing. Run once: python seed.py"""
from datetime import datetime, timedelta, timezone

from database import SessionLocal
import models
from security import hash_password

USERS = [
    ("admin", "admin@fleetflow.com", "Admin@123", "admin"),
    ("manager", "manager@fleetflow.com", "Manager@123", "fleet_manager"),
    ("dispatcher", "dispatcher@fleetflow.com", "Dispatch@123", "dispatcher"),
    ("driver", "driver@fleetflow.com", "Driver@123", "driver"),
]
DRIVERS = [
    ("Rahul Sharma", "DL-0420110012345", "9876500001"),
    ("Priya Singh", "DL-0420110012346", "9876500002"),
    ("Amit Kumar", "DL-0420110012347", "9876500003"),
    ("Neha Patel", "DL-0420110012348", "9876500004"),
    ("Suresh Reddy", "DL-0420110012349", "9876500005"),
]
VEHICLES = [
    ("TRK101", "Truck", 12000, "Diesel", "Active"),
    ("TRK102", "Truck", 10000, "Diesel", "Active"),
    ("VAN010", "Van", 1500, "CNG", "Idle"),
    ("TRL301", "Trailer", 25000, "Diesel", "In Maintenance"),
    ("CAR201", "Car", 500, "Electric", "Idle"),
    ("PKP110", "Pickup", 2000, "Petrol", "Active"),
]


def seed_trips(db):
    """Sample trips; only added if there are none yet."""
    if db.query(models.Trip).first():
        return False
    vehicles = {v.registration_number: v for v in db.query(models.Vehicle)}
    drivers = db.query(models.Driver).order_by(models.Driver.id).all()
    admin = db.query(models.User).filter_by(role="admin").first()
    if len(drivers) < 3 or not {"TRK101", "TRK102", "VAN010"} <= vehicles.keys():
        return False
    now = datetime.now(timezone.utc)
    samples = [
        ("TRK101", drivers[0], "Kolkata", "Durgapur", "Steel coils", 8000,
         now - timedelta(hours=3), "In Progress"),
        ("TRK102", drivers[1], "Howrah", "Siliguri", "Packaged food", 9000,
         now + timedelta(days=1), "Planned"),
        ("VAN010", drivers[2], "Salt Lake", "Barasat", "Electronics", 900,
         now - timedelta(days=2), "Completed"),
    ]
    for reg, drv, origin, dest, cargo, weight, start, status in samples:
        t = models.Trip(
            vehicle_id=vehicles[reg].id, driver_id=drv.id, origin=origin,
            destination=dest, cargo_description=cargo, cargo_weight=weight,
            scheduled_start=start, status=status,
            created_by_id=admin.id if admin else None,
        )
        if status in ("In Progress", "Completed"):
            t.started_at = start
        if status == "Completed":
            t.completed_at = start + timedelta(hours=2)
            t.distance_km = 35
        db.add(t)
    db.commit()
    return True


def seed_shipments(db):
    """Sample shipments (status Created); only added if there are none yet."""
    if db.query(models.Shipment).first():
        return False
    samples = [
        ("Kolkata", "Durgapur", "Steel coils", 1200),
        ("Howrah", "Siliguri", "Packaged food", 800),
        ("Salt Lake", "Barasat", "Electronics", 150),
        ("Kolkata", "Asansol", "Auto parts", 600),
    ]
    for i, (origin, dest, desc, weight) in enumerate(samples, 1):
        s = models.Shipment(code=f"SH-SEED-{i}", origin=origin, destination=dest,
                            description=desc, weight_kg=weight, status="Created")
        db.add(s)
        db.flush()
        s.code = f"SH-{s.id:03d}"
        db.add(models.ShipmentHistory(shipment_id=s.id, status="Created",
                                      note="Shipment created", changed_by="seed"))
    db.commit()
    return True


def run():
    db = SessionLocal()
    if db.query(models.User).first():
        added = seed_trips(db)
        added_sh = seed_shipments(db)
        print("Users already seeded. " +
              ("Added sample trips. " if added else "") +
              ("Added sample shipments." if added_sh else "") +
              ("" if added or added_sh else "Nothing to do."))
        return
    for username, email, pw, role in USERS:
        db.add(models.User(username=username, email=email,
                           hashed_password=hash_password(pw), role=role))
    drivers = [models.Driver(name=n, license_number=l, phone=p) for n, l, p in DRIVERS]
    db.add_all(drivers)
    db.flush()
    for i, (reg, vtype, cap, fuel, status) in enumerate(VEHICLES):
        v = models.Vehicle(registration_number=reg, vehicle_type=vtype,
                           capacity=cap, fuel_type=fuel, status=status)
        if i < 3:
            v.assigned_driver_id = drivers[i].id
            drivers[i].status = "Assigned"
        db.add(v)
    db.commit()
    seed_trips(db)
    seed_shipments(db)
    print("Seeded. Logins (email / password):")
    for _, email, pw, role in USERS:
        print(f"  {role:14} {email}  /  {pw}")


if __name__ == "__main__":
    run()
