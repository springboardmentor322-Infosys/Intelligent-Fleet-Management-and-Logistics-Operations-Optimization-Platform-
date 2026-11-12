import unittest
from io import BytesIO
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.websockets import WebSocketDisconnect
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from openpyxl import load_workbook

from app import models
from app.api import auth as auth_api
from app.api import dependencies
from app.api import gps as gps_api
from app.api import jobs as jobs_api
from app.api import routes as routes_api
from app.core.database import Base
from app.core.config import Settings, settings
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.driver import Driver
from app.models.driver_attendance import DriverAttendanceRecord
from app.models.maintenance_record import MaintenanceRecord
from app.models.notification import NotificationEvent
from app.models.shipment import Shipment
from app.models.gps_location import GPSLocation
from app.models.trip import Trip, TripEtaHistory
from app.models.trip import ShipmentEtaHistory
from app.services import tracking as tracking_service
from app.models.user import User
from app.models.vehicle import Vehicle
from app.services.operations import build_alerts, build_analytics, maintenance_due_summary
from app.services.notification_jobs import refresh_maintenance_reminders


class FleetFlowOperationsTests(unittest.TestCase):
    def setUp(self):
        settings.SECRET_KEY = "fleetflow-isolated-tests-key-32-bytes-minimum"
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)
        self.db = self.Session()

        def override_db():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        self.db_override = override_db
        app.dependency_overrides[dependencies.get_db] = override_db
        app.dependency_overrides[auth_api.get_db] = override_db
        self.client = TestClient(app)
        self.manager = self.make_user("manager@example.com", "fleet_manager")
        self.admin = self.make_user("admin@example.com", "administrator")
        self.dispatcher = self.make_user("dispatch@example.com", "dispatcher")
        self.driver_user = self.make_user("driver@example.com", "driver")
        self.driver = Driver(user_id=self.driver_user.id, license_number="LIC-001")
        self.db.add(self.driver)
        self.vehicle = Vehicle(
            vehicle_id="VH-001", registration_number="TEST-001", vehicle_type="Truck",
            capacity=Decimal("1000"), fuel_type="Diesel", status="idle",
        )
        self.db.add(self.vehicle)
        self.db.commit()
        self.manager_token = self.token(self.manager)
        self.admin_token = self.token(self.admin)
        self.dispatcher_token = self.token(self.dispatcher)
        self.driver_token = self.token(self.driver_user)

    def tearDown(self):
        self.client.close()
        self.db.close()
        app.dependency_overrides.clear()
        # Disposing this per-test in-memory SQLite engine releases the isolated
        # database without issuing DROP statements against any configured DB.
        self.engine.dispose()

    def make_user(self, email, role):
        with self.Session() as db:
            user = User(email=email, full_name=role.title(), password_hash=hash_password("test-pass-123"), role=role)
            db.add(user)
            db.commit()
            db.refresh(user)
            return user

    @staticmethod
    def token(user):
        return create_access_token(str(user.id), user.role)

    def headers(self, token=None):
        return {"Authorization": f"Bearer {token or self.manager_token}"}

    def test_authentication_and_role_permissions(self):
        login = self.client.post("/auth/login", data={"username": "manager@example.com", "password": "test-pass-123"})
        self.assertEqual(login.status_code, 200, login.text)
        self.assertTrue(login.json()["access_token"])
        self.assertEqual(self.client.get("/vehicles").status_code, 401)
        self.assertEqual(self.client.get("/vehicles", headers=self.headers(self.driver_token)).status_code, 403)
        self.assertEqual(self.client.get("/dashboard/drivers", headers=self.headers(self.driver_token)).status_code, 200)
        self.assertEqual(self.client.get("/vehicles", headers=self.headers(self.dispatcher_token)).status_code, 200)
        self.assertEqual(self.client.get("/alerts", headers=self.headers(self.dispatcher_token)).status_code, 200)

    def test_centralized_driver_dashboard_roles_and_database_summary(self):
        self.vehicle.assigned_driver_id = self.driver.id
        self.driver.attendance_status = "present"
        off_duty_user = self.make_user("driver2@example.com", "driver")
        off_duty_driver = Driver(user_id=off_duty_user.id, license_number="LIC-002", attendance_status="leave")
        self.db.add(off_duty_driver)
        unknown_user = self.make_user("driver3@example.com", "driver")
        unknown_driver = Driver(user_id=unknown_user.id, license_number="LIC-003")
        self.db.add(unknown_driver)
        self.db.add(Shipment(
            tracking_number="DASH-001", origin="Depot", destination="North Hub",
            cargo_description="Boxes", weight=Decimal("10"), status="delayed",
            vehicle_id=self.vehicle.id, driver_id=self.driver.id,
        ))
        self.db.add(GPSLocation(
            vehicle_id=self.vehicle.id, latitude=Decimal("17.4"), longitude=Decimal("78.5"),
            speed_kph=Decimal("42"), source="simulated", recorded_at=datetime.now(timezone.utc),
        ))
        self.db.commit()

        for token in (self.admin_token, self.manager_token, self.dispatcher_token, self.driver_token):
            response = self.client.get("/dashboard/drivers", headers=self.headers(token))
            self.assertEqual(response.status_code, 200, response.text)
            body = response.json()
            self.assertEqual(body["summary"]["total"], 3)
            self.assertEqual(body["summary"]["delayed"], 1)
            self.assertEqual(body["summary"]["off_duty"], 1)
            self.assertEqual(body["summary"]["at_stop"], 0)
            self.assertEqual({row["id"] for row in body["drivers"]}, {self.driver.id, off_duty_driver.id, unknown_driver.id})
            self.assertEqual(next(row["status"] for row in body["drivers"] if row["id"] == unknown_driver.id), "unknown")
            row = next(row for row in body["drivers"] if row["id"] == self.driver.id)
            self.assertEqual(row["vehicle"]["registration_number"], "TEST-001")
            self.assertEqual(row["location"]["speed_kph"], 42.0)
            self.assertEqual(row["location"]["source"], "simulated")
            self.assertEqual(self.client.get(f"/dashboard/drivers/{self.driver.id}", headers=self.headers(token)).status_code, 200)
            if token == self.driver_token:
                self.assertIsNone(row["email"])
                self.assertIsNone(row["license_number"])
                profile = self.client.get(f"/dashboard/drivers/{off_duty_driver.id}", headers=self.headers(token)).json()
                self.assertEqual(profile["full_name"], off_duty_user.full_name)
                self.assertIsNone(profile["email"])


    def test_driver_management_write_permissions_are_enforced(self):
        replacement = Vehicle(
            vehicle_id="VH-002", registration_number="TEST-002", vehicle_type="Van",
            capacity=Decimal("500"), fuel_type="Diesel", status="idle",
        )
        self.db.add(replacement)
        self.db.commit()
        assignment_url = f"/drivers/{self.driver.id}/vehicle"
        self.assertEqual(self.client.patch(f"/drivers/{self.driver.id}", headers=self.headers(self.driver_token), json={"full_name": "Changed"}).status_code, 403)
        self.assertEqual(self.client.put(assignment_url, headers=self.headers(self.driver_token), json={"vehicle_id": replacement.id}).status_code, 403)
        self.assertEqual(self.client.patch(f"/drivers/{self.driver.id}/account", headers=self.headers(self.driver_token), json={"is_active": False}).status_code, 403)
        self.assertEqual(self.client.put(assignment_url, headers=self.headers(self.dispatcher_token), json={"vehicle_id": replacement.id}).status_code, 403)
        self.assertEqual(self.client.put(assignment_url, headers=self.headers(self.manager_token), json={"vehicle_id": replacement.id}).status_code, 200)
        self.db.refresh(replacement)
        self.assertEqual(replacement.assigned_driver_id, self.driver.id)
        account_url = f"/drivers/{self.driver.id}/account"
        self.assertEqual(self.client.patch(account_url, headers=self.headers(self.manager_token), json={"is_active": False}).status_code, 403)
        self.assertEqual(self.client.patch(account_url, headers=self.headers(self.dispatcher_token), json={"is_active": False}).status_code, 403)
        self.assertEqual(self.client.get("/alerts", headers=self.headers(self.driver_token)).status_code, 403)
        created = self.client.post("/drivers", headers=self.headers(self.dispatcher_token), json={
            "email": "new-driver@example.com", "full_name": "New Driver", "password": "password-123",
            "license_number": "LIC-NEW",
        })
        self.assertEqual(created.status_code, 403)
        self.assertEqual(self.client.get("/drivers", headers=self.headers(self.dispatcher_token)).status_code, 200)
        self.assertEqual(self.client.get("/analytics/summary", headers=self.headers(self.driver_token)).status_code, 403)
        self.assertEqual(self.client.get("/analytics/summary", headers=self.headers(self.dispatcher_token)).status_code, 200)
        driver_update = self.client.patch(f"/drivers/{self.driver.id}", headers=self.headers(), json={"full_name": "Updated Driver"})
        self.assertEqual(driver_update.status_code, 200, driver_update.text)
        self.assertEqual(driver_update.json()["full_name"], "Updated Driver")
        self.assertEqual(self.client.patch(account_url, headers=self.headers(self.admin_token), json={"is_active": False}).status_code, 200)

    def test_analytics_dashboard_authorization_range_validation_and_empty_data(self):
        params = {"start_date": "2026-10-01", "end_date": "2026-10-07"}
        denied = self.client.get("/analytics/dashboard", params=params, headers=self.headers(self.driver_token))
        self.assertEqual(denied.status_code, 403)
        invalid = self.client.get("/analytics/dashboard", params={"start_date": "2026-10-08", "end_date": "2026-10-01"}, headers=self.headers())
        self.assertEqual(invalid.status_code, 422)
        response = self.client.get("/analytics/dashboard", params=params, headers=self.headers(self.dispatcher_token))
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["kpis"]["shipments"], 0)
        self.assertIsNone(payload["kpis"]["distance_km"])
        self.assertEqual(payload["shipment_trend"][0]["date"], "2026-10-01")
        self.assertEqual(payload["table"]["rows"], [])

    def test_analytics_dashboard_filters_search_and_status_buckets(self):
        self.db.add(Shipment(
            tracking_number="AN-100", origin="North Yard", destination="Central Depot",
            cargo_description="Parts", weight=Decimal("12.5"), status="assigned",
            driver_id=self.driver.id, vehicle_id=self.vehicle.id,
            created_at=datetime(2026, 10, 3, 12, tzinfo=timezone.utc),
            estimated_arrival=datetime(2026, 10, 4, 12, tzinfo=timezone.utc),
        ))
        self.db.commit()
        params = {"start_date": "2026-10-01", "end_date": "2026-10-07", "driver_id": self.driver.id}
        response = self.client.get("/analytics/dashboard", params=params, headers=self.headers())
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["kpis"]["shipments"], 1)
        self.assertEqual(payload["shipment_status"], [{"status": "assigned", "count": 1}])
        self.assertEqual(payload["vehicle_activity"][0]["shipments"], 1)
        self.assertEqual(payload["table"]["rows"][0]["reference"], "AN-100")
        searched = self.client.get("/analytics/dashboard", params={**params, "q": "Central"}, headers=self.headers())
        self.assertEqual(searched.json()["table"]["total"], 1)
        self.assertEqual(searched.json()["kpis"]["shipments"], 1)
        missed = self.client.get("/analytics/dashboard", params={**params, "q": "missing"}, headers=self.headers()).json()
        self.assertEqual(missed["table"]["total"], 0)
        self.assertEqual(missed["kpis"]["shipments"], 1)

    def test_profile_update_requires_auth_and_rejects_duplicate_email(self):
        self.assertEqual(self.client.patch("/auth/me", json={"full_name": "No Token", "email": "none@example.com"}).status_code, 401)
        updated = self.client.patch("/auth/me", headers=self.headers(), json={
            "full_name": "  Fleet Lead  ", "email": " MANAGER@EXAMPLE.COM ",
        })
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["full_name"], "Fleet Lead")
        duplicate = self.client.patch("/auth/me", headers=self.headers(), json={
            "full_name": "Fleet Lead", "email": "admin@example.com",
        })
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(self.client.get("/auth/me", headers=self.headers()).json()["email"], "manager@example.com")

    def test_public_driver_registration_is_disabled_and_cannot_create_orphan_users(self):
        user_count = self.db.query(User).count()
        driver_count = self.db.query(Driver).count()
        response = self.client.post("/auth/register", json={
            "email": "public-driver@example.com", "full_name": "Public Driver",
            "password": "password-123", "role": "driver",
        })
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(self.db.query(User).count(), user_count)
        self.assertEqual(self.db.query(Driver).count(), driver_count)

    def test_password_change_verifies_current_password_and_replaces_hash(self):
        wrong = self.client.post("/auth/change-password", headers=self.headers(), json={
            "current_password": "wrong-password", "new_password": "new-password-123",
        })
        self.assertEqual(wrong.status_code, 400)
        same = self.client.post("/auth/change-password", headers=self.headers(), json={
            "current_password": "test-pass-123", "new_password": "test-pass-123",
        })
        self.assertEqual(same.status_code, 422)
        changed = self.client.post("/auth/change-password", headers=self.headers(), json={
            "current_password": "test-pass-123", "new_password": "new-password-123",
        })
        self.assertEqual(changed.status_code, 204)
        self.assertTrue(self.client.post("/auth/login", data={
            "username": "manager@example.com", "password": "new-password-123",
        }).is_success)
        self.assertEqual(self.client.post("/auth/login", data={
            "username": "manager@example.com", "password": "test-pass-123",
        }).status_code, 401)

    def test_application_rejects_short_signing_key(self):
        with patch.object(settings, "SECRET_KEY", "short"):
            with self.assertRaisesRegex(RuntimeError, "at least 32 characters"):
                with TestClient(app):
                    pass

    def test_development_and_production_debug_modes_are_distinct(self):
        common = {"DATABASE_URL": "sqlite://", "SECRET_KEY": "test-key-with-at-least-32-characters", "_env_file": None}
        self.assertTrue(Settings(**common, DEBUG="development").DEBUG)
        self.assertFalse(Settings(**common, DEBUG="production").DEBUG)

    def test_maintenance_crud_validation_and_permissions(self):
        payload = {
            "vehicle_id": self.vehicle.id,
            "service_type": "Oil change",
            "description": "Replace oil and filter",
            "service_date": "2026-01-01T10:00:00Z",
            "cost": "125.50",
            "next_due_date": "2026-07-01T10:00:00Z",
            "status": "completed",
        }
        created = self.client.post("/maintenance", headers=self.headers(), json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["vehicle_id"], self.vehicle.id)
        self.assertIn("service_date", created.json())
        self.assertIn("next_due_date", created.json())
        record_id = created.json()["id"]
        listed = self.client.get("/maintenance", headers=self.headers(self.dispatcher_token))
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()[0]["id"], record_id)
        updated = self.client.patch(f"/maintenance/{record_id}", headers=self.headers(), json={"cost": "140.00"})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["cost"], "140.00")
        self.assertEqual(self.client.get(f"/maintenance/{record_id}", headers=self.headers()).status_code, 200)
        self.assertEqual(self.db.get(MaintenanceRecord, record_id).vehicle.id, self.vehicle.id)
        self.assertIn(self.db.get(MaintenanceRecord, record_id), self.vehicle.maintenance_records)
        bad_due = {**payload, "next_due_date": "2025-01-01T00:00:00Z"}
        self.assertEqual(self.client.post("/maintenance", headers=self.headers(), json=bad_due).status_code, 422)
        bad_vehicle = {**payload, "vehicle_id": 9000}
        self.assertEqual(self.client.post("/maintenance", headers=self.headers(), json=bad_vehicle).status_code, 404)
        self.assertEqual(self.client.post("/maintenance", headers=self.headers(self.dispatcher_token), json=payload).status_code, 403)

    def test_alerts_are_data_derived_and_repeatable(self):
        now = datetime(2026, 5, 1, tzinfo=timezone.utc)
        self.vehicle.status = "maintenance"
        driver2_user = self.make_user("driver2@example.test", "driver")
        driver2 = Driver(user_id=driver2_user.id, license_number="LIC-002")
        self.db.add(driver2)
        overdue = Shipment(
            tracking_number="OVERDUE", origin="A", destination="B", cargo_description="Box", weight=10,
            status="in_transit", vehicle_id=self.vehicle.id, driver_id=self.driver.id,
            scheduled_departure=now - timedelta(days=2), estimated_arrival=now - timedelta(hours=1),
        )
        duplicate_vehicle = Shipment(
            tracking_number="CONFLICT", origin="A", destination="C", cargo_description="Box", weight=10,
            status="assigned", vehicle_id=self.vehicle.id, driver_id=driver2.id,
        )
        unassigned = Shipment(
            tracking_number="UNASSIGNED", origin="A", destination="D", cargo_description="Box", weight=2,
            status="pending",
        )
        self.db.add_all([overdue, duplicate_vehicle, unassigned])
        second_vehicle = Vehicle(vehicle_id="VH-002", registration_number="TEST-002", vehicle_type="Van", capacity=100, fuel_type="Diesel", status="idle")
        self.db.add(second_vehicle)
        self.db.flush()
        self.db.add(MaintenanceRecord(
            vehicle_id=self.vehicle.id, service_type="Inspection", description="Quarterly check",
            service_date=now - timedelta(days=60), next_due_date=now - timedelta(days=1), status="completed",
        ))
        self.db.add(MaintenanceRecord(
            vehicle_id=second_vehicle.id, service_type="Tire check", description="Inspect tires",
            service_date=now - timedelta(days=10), next_due_date=now + timedelta(days=10), status="completed",
        ))
        self.db.commit()
        first = build_alerts(self.db, now)
        second = build_alerts(self.db, now)
        self.assertEqual([a["id"] for a in first], [a["id"] for a in second])
        types = {a["type"] for a in first}
        self.assertTrue({"overdue_shipment", "unassigned_shipment", "assignment_conflict", "maintenance_overdue", "maintenance_upcoming"} <= types)
        self.assertEqual(len(first), len({a["id"] for a in first}))
        alerts_first = self.client.get("/alerts", headers=self.headers())
        alerts_second = self.client.get("/alerts", headers=self.headers())
        self.assertEqual(alerts_first.status_code, 200, alerts_first.text)
        self.assertEqual(alerts_first.json()["delivery"], "in_app_only")
        self.assertEqual(
            [alert["id"] for alert in alerts_first.json()["alerts"]],
            [alert["id"] for alert in alerts_second.json()["alerts"]],
        )
        due = maintenance_due_summary(self.db, now)
        self.assertEqual((due["overdue"], due["upcoming"]), (1, 1))

    def test_analytics_counts_and_unavailable_metrics(self):
        self.db.add(Shipment(tracking_number="PENDING", origin="A", destination="B", cargo_description="Box", weight=1, status="pending"))
        self.db.add(Shipment(tracking_number="DONE", origin="A", destination="B", cargo_description="Box", weight=1, status="delivered"))
        self.db.commit()
        result = build_analytics(self.db, datetime.now(timezone.utc))
        self.assertEqual(result["vehicles_by_status"]["idle"], 1)
        self.assertEqual(result["shipments_by_status"]["pending"], 1)
        self.assertEqual(result["delivery_performance"]["delivered_count"], 1)
        self.assertFalse(result["delivery_performance"]["available"])
        self.assertFalse(result["vehicle_utilization"]["available"])
        self.assertFalse(result["fuel_reporting"]["available"])
        response = self.client.get("/analytics/summary", headers=self.headers())
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["vehicles_by_status"]["idle"], 1)
        self.assertEqual(payload["shipments_by_status"]["delivered"], 1)
        self.assertFalse(payload["delivery_performance"]["available"])
        self.assertIn("reason", payload["vehicle_utilization"])
        self.assertIn("maintenance", payload)

    def test_management_endpoints_require_existing_records_and_valid_roles(self):
        self.assertEqual(self.client.get("/maintenance/999", headers=self.headers()).status_code, 404)
        self.assertEqual(self.client.post("/maintenance", headers=self.headers(self.dispatcher_token), json={}).status_code, 403)
        self.assertEqual(self.client.get("/gps/vehicles/999/latest", headers=self.headers()).status_code, 404)

    def test_shipment_schedule_eta_and_invalid_transition(self):
        created = self.client.post("/shipments", headers=self.headers(), json={
            "tracking_number": "ETA-1", "origin": "Origin", "destination": "Destination",
            "cargo_description": "Crate", "weight": "20", "scheduled_departure": "2026-06-01T10:00:00Z",
        })
        self.assertEqual(created.status_code, 201, created.text)
        shipment_id = created.json()["id"]
        self.assertEqual(self.client.patch(f"/shipments/{shipment_id}", headers=self.headers(), json={"status": "delivered"}).status_code, 409)
        invalid_eta = self.client.patch(f"/shipments/{shipment_id}", headers=self.headers(), json={"estimated_arrival": "2026-05-31T10:00:00Z"})
        self.assertEqual(invalid_eta.status_code, 422)
        route = {"distance_km": 20.0, "duration_minutes": 60.0, "provider": "OSRM", "traffic_aware": False, "traffic_data": "unavailable", "alternative_routes_count": 0}
        with patch("app.api.routes.geocode_address", side_effect=[(1.0, 2.0), (3.0, 4.0)]), patch("app.api.routes.get_road_route", return_value=route):
            response = self.client.post(f"/routes/shipments/{shipment_id}/calculate-eta", headers=self.headers())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("estimated_arrival", response.json())
        persisted = self.db.get(Shipment, shipment_id)
        self.assertIsNotNone(persisted.estimated_arrival)
        eta_history = self.client.get(f"/shipments/{shipment_id}/eta-history", headers=self.headers())
        self.assertEqual(eta_history.status_code, 200)
        self.assertEqual(len(eta_history.json()), 1)

    def test_assignment_capacity_and_duplicate_resource_validation(self):
        def create(number, weight="20"):
            return self.client.post("/shipments", headers=self.headers(), json={
                "tracking_number": number, "origin": "A", "destination": "B", "cargo_description": "Cargo",
                "weight": weight, "vehicle_id": self.vehicle.id, "driver_id": self.driver.id,
            })
        first = create("ASSIGN-1")
        self.assertEqual(first.status_code, 201, first.text)
        self.assertEqual(create("ASSIGN-2").status_code, 409)
        self.assertEqual(create("TOO-HEAVY", "2000").status_code, 422)

    def test_route_selection_and_provider_errors(self):
        class Response:
            def raise_for_status(self):
                pass
            def json(self):
                return {"code": "Ok", "routes": [
                    {"distance": 5000, "duration": 900},
                    {"distance": 3000, "duration": 1200},
                ]}
        with patch("app.api.routes.httpx.get", return_value=Response()):
            route = routes_api.get_road_route(1, 2, 3, 4)
        self.assertEqual(route["distance_km"], 5.0)
        self.assertEqual(route["shortest_distance_km"], 3.0)
        self.assertEqual(route["alternative_routes_count"], 1)
        self.assertFalse(route["traffic_aware"])
        with patch("app.api.routes.httpx.get", return_value=Response()):
            planned = self.client.get(
                "/routes/plan?origin_lat=1&origin_lon=2&destination_lat=3&destination_lon=4",
                headers=self.headers(),
            )
        self.assertEqual(planned.status_code, 200, planned.text)
        self.assertEqual(planned.json()["route_selection"], "fastest_available")
        with patch("app.api.routes.httpx.get", side_effect=routes_api.httpx.ConnectError("offline")):
            with self.assertRaises(HTTPException) as error:
                routes_api.get_road_route(1, 2, 3, 4)
        self.assertEqual(error.exception.status_code, 502)
        with patch("app.api.routes.httpx.get", side_effect=routes_api.httpx.ConnectError("offline")):
            route_error = self.client.get(
                "/routes/plan?origin_lat=1&origin_lon=2&destination_lat=3&destination_lon=4",
                headers=self.headers(),
            )
        self.assertEqual(route_error.status_code, 502)
        class NoRouteResponse(Response):
            def json(self):
                return {"code": "NoRoute", "routes": []}
        with patch("app.api.routes.httpx.get", return_value=NoRouteResponse()):
            with self.assertRaises(HTTPException) as no_route:
                routes_api.get_road_route(1, 2, 3, 4)
        self.assertEqual(no_route.exception.status_code, 422)

    def test_gps_simulation_status_and_invalid_ids(self):
        self.assertEqual(self.client.get("/gps/shipments/999/simulation-status", headers=self.headers()).status_code, 404)
        shipment = self.client.post("/shipments", headers=self.headers(), json={
            "tracking_number": "GPS-1", "origin": "A", "destination": "B", "cargo_description": "Box", "weight": 1,
        }).json()
        self.assertEqual(self.client.post(f"/gps/shipments/{shipment['id']}/simulate-live", headers=self.headers()).status_code, 409)
        assigned = self.client.patch(f"/shipments/{shipment['id']}", headers=self.headers(), json={"vehicle_id": self.vehicle.id})
        self.assertEqual(assigned.status_code, 200, assigned.text)
        with patch("app.api.gps.start_live_simulation", return_value=True), patch("app.api.gps.get_live_simulation_status", return_value={"running": True, "status": "running"}):
            started = self.client.post(f"/gps/shipments/{shipment['id']}/simulate-live", headers=self.headers())
            status = self.client.get(f"/gps/shipments/{shipment['id']}/simulation-status", headers=self.headers())
        self.assertEqual(started.status_code, 200)
        self.assertTrue(status.json()["running"])

    def test_shipment_status_history_and_delayed_transitions(self):
        created = self.client.post("/shipments", headers=self.headers(), json={
            "tracking_number": "HIST-001", "origin": "Origin", "destination": "Destination",
            "cargo_description": "Goods", "weight": "10.00",
        })
        self.assertEqual(created.status_code, 201, created.text)
        shipment_id = created.json()["id"]
        assigned = self.client.patch(f"/shipments/{shipment_id}", headers=self.headers(), json={
            "vehicle_id": self.vehicle.id, "driver_id": self.driver.id,
        })
        self.assertEqual(assigned.status_code, 200, assigned.text)
        for next_status in ("in_transit", "delayed", "in_transit"):
            response = self.client.patch(f"/shipments/{shipment_id}", headers=self.headers(), json={"status": next_status})
            self.assertEqual(response.status_code, 200, response.text)
        history = self.client.get(f"/shipments/{shipment_id}/history", headers=self.headers())
        self.assertEqual(history.status_code, 200, history.text)
        self.assertEqual([event["status"] for event in history.json()], [
            "pending", "assigned", "in_transit", "delayed", "in_transit",
        ])
        self.assertIsNone(history.json()[0]["previous_status"])
        self.assertEqual(history.json()[-1]["changed_by_user_id"], self.manager.id)

    def test_websocket_streams_persisted_gps_updates_and_checks_roles(self):
        with self.client.websocket_connect(f"/gps/ws/vehicles/{self.vehicle.id}") as websocket:
            websocket.send_json({"token": self.manager_token})
            self.assertEqual(websocket.receive_json()["type"], "ready")
            created = self.client.post(
                f"/gps/vehicles/{self.vehicle.id}/locations",
                headers=self.headers(),
                json={"latitude": 17.4, "longitude": 78.5},
            )
            self.assertEqual(created.status_code, 201, created.text)
            event = websocket.receive_json()
            self.assertEqual(event["type"], "location")
            self.assertEqual(event["location"]["id"], created.json()["id"])
            self.assertEqual(event["location"]["latitude"], 17.4)
            self.assertEqual(event["location"]["speed_kph"], None)
            self.assertEqual(event["location"]["is_simulated"], False)
            self.assertIsNotNone(self.db.get(GPSLocation, created.json()["id"]))

        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect(f"/gps/ws/vehicles/{self.vehicle.id}") as websocket:
                websocket.send_json({"token": self.driver_token})
                websocket.receive_json()
        self.assertNotIn(self.vehicle.id, gps_api.vehicle_location_hub._subscribers)

    def test_websocket_malformed_auth_and_vehicle_scope_are_closed_and_cleaned_up(self):
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect(f"/gps/ws/vehicles/{self.vehicle.id}") as websocket:
                websocket.send_text("not-json")
                websocket.receive_json()
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect("/gps/ws/vehicles/99999") as websocket:
                websocket.send_json({"token": self.manager_token})
                websocket.receive_json()
        self.assertNotIn(99999, gps_api.vehicle_location_hub._subscribers)

    def test_location_update_recalculates_throttled_trip_eta_and_broadcasts(self):
        tracking_service._eta_recalculation_state.clear()
        shipment = self.client.post("/shipments", headers=self.headers(), json={
            "tracking_number":"WS-ETA-1","origin":"A","destination":"Destination","cargo_description":"Box","weight":1,
        })
        now=datetime.now(timezone.utc)
        trip=Trip(vehicle_id=self.vehicle.id,driver_id=self.driver.id,origin="A",destination="Destination",route_selection="fastest",
                  scheduled_departure=now-timedelta(minutes=5),estimated_arrival=now+timedelta(hours=1),status="in_progress")
        self.db.add(trip);self.db.flush()
        shipment_row=self.db.get(Shipment,shipment.json()["id"]);shipment_row.trip_id=trip.id
        self.db.commit()
        route={"distance_km":12,"duration_minutes":30,"provider":"OSRM","traffic_aware":False,"traffic_data":"unavailable","alternative_routes_count":0}
        with patch("app.services.geocoding.geocode_address",return_value=(18,79)) as geocode, patch("app.api.routes.get_road_route",return_value=route) as routing:
            with self.client.websocket_connect(f"/gps/ws/vehicles/{self.vehicle.id}") as websocket:
                websocket.send_json({"token":self.manager_token});self.assertEqual(websocket.receive_json()["type"],"ready")
                first=self.client.post(f"/gps/vehicles/{self.vehicle.id}/locations",headers=self.headers(),json={"latitude":17.4,"longitude":78.5,"speed_kph":36,"source":"simulated"})
                self.assertEqual(first.status_code,201,first.text)
                location_event=websocket.receive_json()
                eta_event=websocket.receive_json()
                self.assertEqual(location_event["type"],"location")
                self.assertEqual(location_event["location"]["speed_kph"],36)
                self.assertEqual(location_event["location"]["source"],"simulated")
                self.assertTrue(location_event["location"]["is_simulated"])
                self.assertEqual(eta_event["type"],"eta",eta_event)
                self.assertEqual(eta_event["trip_id"],trip.id)
                second=self.client.post(f"/gps/vehicles/{self.vehicle.id}/locations",headers=self.headers(),json={"latitude":17.41,"longitude":78.51,"speed_kph":37})
                self.assertEqual(second.status_code,201,second.text)
                self.assertEqual(websocket.receive_json()["type"],"location")
            self.assertEqual(geocode.call_count,1)
            self.assertEqual(routing.call_count,1)
        self.db.refresh(trip)
        persisted_eta=trip.estimated_arrival.replace(tzinfo=timezone.utc) if trip.estimated_arrival.tzinfo is None else trip.estimated_arrival
        self.assertGreater(persisted_eta,now)
        self.assertEqual(self.db.query(TripEtaHistory).filter_by(trip_id=trip.id).count(),1)
        self.assertEqual(self.db.query(ShipmentEtaHistory).filter_by(shipment_id=shipment_row.id).count(),1)

    def test_location_is_still_broadcast_when_eta_provider_fails(self):
        tracking_service._eta_recalculation_state.clear()
        now=datetime.now(timezone.utc)
        trip=Trip(vehicle_id=self.vehicle.id,driver_id=self.driver.id,origin="A",destination="B",route_selection="fastest",
                  scheduled_departure=now-timedelta(minutes=1),estimated_arrival=now+timedelta(hours=1),status="in_progress")
        self.db.add(trip);self.db.commit()
        from fastapi import HTTPException
        with patch("app.services.geocoding.geocode_address",side_effect=HTTPException(status_code=502,detail="offline")):
            with self.client.websocket_connect(f"/gps/ws/vehicles/{self.vehicle.id}") as websocket:
                websocket.send_json({"token":self.manager_token});websocket.receive_json()
                response=self.client.post(f"/gps/vehicles/{self.vehicle.id}/locations",headers=self.headers(),json={"latitude":17.4,"longitude":78.5})
                self.assertEqual(response.status_code,201,response.text)
                self.assertEqual(websocket.receive_json()["type"],"location")
                failure=websocket.receive_json()
                self.assertEqual(failure["type"],"eta_unavailable")
        self.assertIsNotNone(self.db.get(GPSLocation,response.json()["id"]))

    def test_gps_speed_timestamp_source_persistence_and_validation(self):
        stamp = datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc)
        response = self.client.post(f"/gps/vehicles/{self.vehicle.id}/locations", headers=self.headers(), json={
            "latitude": 17.4, "longitude": 78.5, "speed_kph": 42.5,
            "timestamp": stamp.isoformat(), "source": "simulated",
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["speed_kph"], 42.5)
        self.assertEqual(response.json()["source"], "simulated")
        self.assertTrue(response.json()["is_simulated"])
        self.assertTrue(response.json()["timestamp"])
        invalid = self.client.post(f"/gps/vehicles/{self.vehicle.id}/locations", headers=self.headers(), json={
            "latitude": 17.4, "longitude": 78.5, "speed_kph": -1,
        })
        self.assertEqual(invalid.status_code, 422)
        untrusted_physical_claim = self.client.post(f"/gps/vehicles/{self.vehicle.id}/locations", headers=self.headers(), json={
            "latitude": 17.4, "longitude": 78.5, "source": "device",
        })
        self.assertEqual(untrusted_physical_claim.status_code, 422)
        future = self.client.post(f"/gps/vehicles/{self.vehicle.id}/locations", headers=self.headers(), json={
            "latitude": 17.4, "longitude": 78.5,
            "timestamp": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        })
        self.assertEqual(future.status_code, 422)

    def test_secure_gps_ingestion_validates_persists_and_broadcasts_provider_data(self):
        device_id = "gps-unit-test-01"
        self.vehicle.gps_device_id = device_id
        self.db.commit()
        timestamp = datetime.now(timezone.utc).isoformat()
        payload = {
            "device_id": device_id, "source": "provider", "latitude": 17.4, "longitude": 78.5,
            "speed_kph": 53.2, "heading_degrees": 271.5, "recorded_at": timestamp,
            "device_connected": True,
        }
        with patch.object(gps_api.settings, "GPS_INGESTION_API_KEY", None):
            not_configured = self.client.post("/gps/ingest", json=payload)
            self.assertEqual(not_configured.status_code, 503)
        with patch.object(gps_api.settings, "GPS_INGESTION_API_KEY", "isolated-test-key-with-at-least-32-characters"):
            unauthorized = self.client.post("/gps/ingest", json=payload, headers={"X-GPS-API-Key": "incorrect"})
            self.assertEqual(unauthorized.status_code, 401)
            with self.client.websocket_connect(f"/gps/ws/vehicles/{self.vehicle.id}") as websocket:
                websocket.send_json({"token": self.manager_token})
                self.assertEqual(websocket.receive_json()["type"], "ready")
                response = self.client.post("/gps/ingest", json=payload, headers={"X-GPS-API-Key": "isolated-test-key-with-at-least-32-characters"})
                self.assertEqual(response.status_code, 201, response.text)
                event = websocket.receive_json()
                self.assertEqual(event["type"], "location")
                self.assertEqual(event["location"]["heading_degrees"], 271.5)
                self.assertEqual(event["location"]["source"], "provider")
            reading = self.db.get(GPSLocation, response.json()["id"])
            self.assertEqual(reading.device_id, device_id)
            self.assertTrue(reading.device_connected)
            self.assertEqual(reading.speed_kph, Decimal("53.20"))
            self.assertEqual(reading.heading_degrees, Decimal("271.50"))
            invalid = self.client.post("/gps/ingest", json={**payload, "heading_degrees": 360}, headers={"X-GPS-API-Key": "isolated-test-key-with-at-least-32-characters"})
            self.assertEqual(invalid.status_code, 422)
            mismatch = self.client.post("/gps/ingest", json={**payload, "vehicle_id": self.vehicle.id + 100}, headers={"X-GPS-API-Key": "isolated-test-key-with-at-least-32-characters"})
            self.assertEqual(mismatch.status_code, 404)

    def test_driver_can_stream_only_own_assigned_vehicle_and_device_id_is_redacted(self):
        self.vehicle.assigned_driver_id = self.driver.id
        self.db.add(GPSLocation(vehicle_id=self.vehicle.id, latitude=Decimal("17.4"), longitude=Decimal("78.5"),
            speed_kph=Decimal("40"), heading_degrees=Decimal("90"), source="device", device_id="private-gps-id"))
        self.db.commit()
        with self.client.websocket_connect(f"/gps/ws/vehicles/{self.vehicle.id}") as websocket:
            websocket.send_json({"token": self.driver_token})
            self.assertEqual(websocket.receive_json()["type"], "ready")
            response = self.client.get(f"/gps/vehicles/{self.vehicle.id}/latest", headers=self.headers(self.driver_token))
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIsNone(response.json()["device_id"])
            self.assertEqual(response.json()["heading_degrees"], 90)
        other_vehicle = Vehicle(vehicle_id="VH-OTHER", registration_number="TEST-OTHER", vehicle_type="Van",
            capacity=Decimal("500"), fuel_type="Diesel", status="idle")
        self.db.add(other_vehicle)
        self.db.commit()
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect(f"/gps/ws/vehicles/{other_vehicle.id}") as websocket:
                websocket.send_json({"token": self.driver_token})
                websocket.receive_json()
        self.assertEqual(self.client.get(f"/gps/vehicles/{other_vehicle.id}/latest", headers=self.headers(self.driver_token)).status_code, 403)

    def test_trip_lifecycle_conflicts_authorization_and_shipment_history(self):
        created_shipment = self.client.post("/shipments", headers=self.headers(), json={
            "tracking_number": "TRIP-1", "origin": "Origin", "destination": "Destination",
            "cargo_description": "Box", "weight": 10,
        })
        self.assertEqual(created_shipment.status_code, 201, created_shipment.text)
        route_data = {"code":"Ok","routes":[{"distance":12000,"duration":900},{"distance":10000,"duration":1100}]}
        payload = {"vehicle_id":self.vehicle.id,"driver_id":self.driver.id,"origin":"Origin","destination":"Destination",
                   "scheduled_departure":(datetime.now(timezone.utc)+timedelta(days=1)).isoformat(),
                   "shipment_ids":[created_shipment.json()["id"]],"route_selection":"shortest"}
        with patch("app.api.routes.geocode_address",side_effect=[(1,2),(3,4)]),patch("app.api.routes.httpx.get") as get:
            get.return_value.raise_for_status.return_value=None; get.return_value.json.return_value=route_data
            created=self.client.post("/trips",headers=self.headers(),json=payload)
        self.assertEqual(created.status_code,201,created.text)
        trip=created.json(); self.assertEqual(trip["route_distance_km"],10)
        self.assertEqual(trip["shipment_ids"],[created_shipment.json()["id"]])
        self.assertEqual(self.client.get("/trips",headers=self.headers(self.driver_token)).status_code,403)
        conflict_payload={**payload,"shipment_ids":[]}
        with patch("app.api.routes.geocode_address",side_effect=[(1,2),(3,4)]),patch("app.api.routes.httpx.get") as get:
            get.return_value.raise_for_status.return_value=None; get.return_value.json.return_value=route_data
            conflict=self.client.post("/trips",headers=self.headers(),json=conflict_payload)
        self.assertEqual(conflict.status_code,409)
        self.assertEqual(self.client.patch(f"/trips/{trip['id']}",headers=self.headers(),json={"status":"completed"}).status_code,409)
        started=self.client.patch(f"/trips/{trip['id']}",headers=self.headers(),json={"status":"in_progress"})
        self.assertEqual(started.status_code,200,started.text)
        completed=self.client.patch(f"/trips/{trip['id']}",headers=self.headers(),json={"status":"completed"})
        self.assertEqual(completed.status_code,200,completed.text)
        shipment=self.client.get(f"/shipments/{created_shipment.json()['id']}",headers=self.headers()).json()
        self.assertEqual(shipment["status"],"delivered"); self.assertIsNotNone(shipment["actual_arrival"])
        history=self.client.get(f"/shipments/{shipment['id']}/history",headers=self.headers()).json()
        self.assertEqual([item["status"] for item in history],["pending","assigned","in_transit","delivered"])

    def test_route_reselection_saves_trip_route_history_and_eta(self):
        route_data={"code":"Ok","routes":[{"distance":10000,"duration":1200},{"distance":12000,"duration":900}]}
        shipment=self.client.post("/shipments",headers=self.headers(),json={"tracking_number":"ETA-TRIP","origin":"A","destination":"B","cargo_description":"Box","weight":2})
        self.assertEqual(shipment.status_code,201,shipment.text)
        payload={"vehicle_id":self.vehicle.id,"driver_id":self.driver.id,"origin":"A","destination":"B",
                 "scheduled_departure":(datetime.now(timezone.utc)+timedelta(days=2)).isoformat(),"shipment_ids":[shipment.json()["id"]]}
        with patch("app.api.routes.geocode_address",side_effect=[(1,2),(3,4)]),patch("app.api.routes.httpx.get") as get:
            get.return_value.raise_for_status.return_value=None;get.return_value.json.return_value=route_data
            created=self.client.post("/trips",headers=self.headers(),json=payload)
        self.assertEqual(created.status_code,201,created.text)
        with patch("app.api.routes.geocode_address",side_effect=[(1,2),(3,4)]),patch("app.api.routes.httpx.get") as get:
            get.return_value.raise_for_status.return_value=None;get.return_value.json.return_value=route_data
            updated=self.client.patch(f"/trips/{created.json()['id']}",headers=self.headers(),json={"route_selection":"shortest"})
        self.assertEqual(updated.status_code,200,updated.text)
        self.assertEqual(updated.json()["route_selection"],"shortest")
        history=self.client.get(f"/trips/{created.json()['id']}/history",headers=self.headers())
        self.assertEqual(history.status_code,200);self.assertEqual(len(history.json()),2)
        eta_history=self.client.get(f"/shipments/{shipment.json()['id']}/eta-history",headers=self.headers())
        self.assertEqual(eta_history.status_code,200);self.assertEqual(len(eta_history.json()),2)

    def test_fuel_logs_validate_odometer_and_calculate_real_data_metrics(self):
        def record(date, odometer, liters, cost, full_tank):
            return self.client.post("/fuel-logs", headers=self.headers(), json={
                "vehicle_id": self.vehicle.id,
                "logged_at": date,
                "odometer_km": odometer,
                "liters": liters,
                "total_cost": cost,
                "is_full_tank": full_tank,
            })

        first = record("2026-01-01T10:00:00Z", "1000", "30", "600", True)
        partial = record("2026-02-01T10:00:00Z", "1100", "12", "240", False)
        second_full = record("2026-03-01T10:00:00Z", "1200", "18", "360", True)
        self.assertEqual(first.status_code, 201, first.text)
        self.assertEqual(partial.status_code, 201, partial.text)
        self.assertEqual(second_full.status_code, 201, second_full.text)
        self.assertEqual(record("2026-04-01T10:00:00Z", "1190", "5", "100", False).status_code, 409)
        self.assertEqual(self.client.post("/fuel-logs", headers=self.headers(self.dispatcher_token), json={
            "vehicle_id": self.vehicle.id, "odometer_km": 1200, "liters": 5, "total_cost": 100,
        }).status_code, 403)
        reported = self.client.get("/analytics/summary", headers=self.headers()).json()["fuel_reporting"]
        self.assertTrue(reported["available"])
        self.assertEqual(reported["log_count"], 3)
        self.assertEqual(reported["total_liters_logged"], 60.0)
        self.assertEqual(reported["total_cost_logged"], 1200.0)
        self.assertEqual(reported["full_tank_liters_per_100km"], 15.0)

    def test_driver_delivery_performance_uses_persisted_delivery_and_eta_events(self):
        created = self.client.post("/shipments", headers=self.headers(), json={
            "tracking_number": "DRIVER-METRIC-1", "origin": "Origin", "destination": "Destination",
            "cargo_description": "Goods", "weight": "10.00",
        }).json()
        shipment_id = created["id"]
        self.client.patch(f"/shipments/{shipment_id}", headers=self.headers(), json={
            "vehicle_id": self.vehicle.id, "driver_id": self.driver.id,
            "estimated_arrival": "2099-01-01T10:00:00Z",
        })
        self.client.patch(f"/shipments/{shipment_id}", headers=self.headers(), json={"status": "in_transit"})
        delivered = self.client.patch(f"/shipments/{shipment_id}", headers=self.headers(), json={"status": "delivered"})
        self.assertEqual(delivered.status_code, 200, delivered.text)
        analytics = self.client.get("/analytics/summary", headers=self.headers()).json()
        driver_metric = next(item for item in analytics["driver_performance"] if item["driver_id"] == self.driver.id)
        self.assertEqual(driver_metric["delivered_count"], 1)
        self.assertEqual(driver_metric["on_time_delivery_rate"], 100.0)
        self.assertEqual(analytics["delivery_performance"]["on_time_rate"], 100.0)

    def test_driver_attendance_history_persists_actor_and_rejects_unprivileged_write(self):
        recorded = self.client.post(f"/drivers/{self.driver.id}/attendance", headers=self.headers(), json={
            "status": "present", "note": "Shift started",
        })
        self.assertEqual(recorded.status_code, 201, recorded.text)
        self.assertEqual(recorded.json()["recorded_by_user_id"], self.manager.id)
        self.db.expire_all()
        self.assertEqual(self.db.get(Driver, self.driver.id).attendance_status, "present")
        self.assertEqual(self.client.post(f"/drivers/{self.driver.id}/attendance", headers=self.headers(self.dispatcher_token), json={
            "status": "absent",
        }).status_code, 403)
        self.assertEqual(self.client.patch(f"/drivers/{self.driver.id}", headers=self.headers(), json={
            "attendance_status": "absent",
        }).status_code, 200)
        history = self.client.get(f"/drivers/{self.driver.id}/attendance", headers=self.headers(self.dispatcher_token))
        self.assertEqual(history.status_code, 200)
        self.assertEqual([row["status"] for row in history.json()], ["absent", "present"])

    def test_driver_dashboard_is_self_scoped_and_status_updates_use_workflow(self):
        own = self.client.post("/shipments", headers=self.headers(), json={
            "tracking_number": "SELF-001", "origin": "Depot", "destination": "Shop",
            "cargo_description": "Box", "weight": 5, "vehicle_id": self.vehicle.id,
            "driver_id": self.driver.id,
        }).json()
        other_user = self.make_user("other-driver@example.com", "driver")
        other = Driver(user_id=other_user.id, license_number="LIC-OTHER")
        self.db.add(other)
        self.db.commit()
        other_shipment = self.client.post("/shipments", headers=self.headers(), json={
            "tracking_number": "OTHER-001", "origin": "Depot", "destination": "Shop",
            "cargo_description": "Box", "weight": 5, "driver_id": other.id,
        })
        self.assertEqual(other_shipment.status_code, 201, other_shipment.text)
        dashboard = self.client.get("/dashboard/driver", headers=self.headers(self.driver_token))
        self.assertEqual(dashboard.status_code, 200, dashboard.text)
        self.assertEqual([item["id"] for item in dashboard.json()["shipments"]], [own["id"]])
        self.assertEqual(dashboard.json()["driver"]["email"], self.driver_user.email)
        self.assertEqual(dashboard.json()["vehicle"]["id"], self.vehicle.id)
        self.assertEqual(dashboard.json()["shipments"][0]["cargo_description"], "Box")
        self.assertEqual(self.client.get("/shipments", headers=self.headers(self.driver_token)).status_code, 403)
        self.assertEqual(self.client.patch(f"/dashboard/driver/shipments/{own['id']}", headers=self.headers(self.driver_token), json={"status": "delivered"}).status_code, 409)
        self.assertEqual(self.client.patch(f"/dashboard/driver/shipments/{own['id']}", headers=self.headers(self.driver_token), json={"status": "cancelled"}).status_code, 409)
        self.assertEqual(self.client.patch(f"/dashboard/driver/shipments/{own['id']}", headers=self.headers(self.driver_token), json={"status": "in_transit"}).status_code, 200)
        self.assertEqual(self.client.patch(f"/dashboard/driver/shipments/{own['id']}", headers=self.headers(self.driver_token), json={"status": "delayed", "origin": "Elsewhere"}).status_code, 422)
        self.assertEqual(self.client.patch(f"/dashboard/driver/shipments/{own['id']}", headers=self.headers(self.token(other_user)), json={"status": "delayed"}).status_code, 404)
        route = {"distance_km": 10.0, "duration_minutes": 20.0, "provider": "OSRM", "traffic_aware": False, "traffic_data": "unavailable", "alternative_routes_count": 0}
        with patch("app.api.routes.geocode_address", side_effect=[(1.0, 2.0), (3.0, 4.0)]), patch("app.api.routes.get_road_route", return_value=route):
            own_route = self.client.get(f"/routes/shipments/{own['id']}", headers=self.headers(self.driver_token))
        self.assertEqual(own_route.status_code, 200, own_route.text)
        self.assertEqual(self.client.get(f"/routes/shipments/{other_shipment.json()['id']}", headers=self.headers(self.driver_token)).status_code, 404)

    def test_dispatcher_dashboard_aggregates_live_records_and_checks_roles(self):
        self.client.post("/shipments", headers=self.headers(), json={
            "tracking_number": "DISPATCH-001", "origin": "A", "destination": "B",
            "cargo_description": "Cargo", "weight": 1,
        })
        response = self.client.get("/dashboard/dispatcher", headers=self.headers(self.dispatcher_token))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["shipments_by_status"]["pending"], 1)
        self.assertEqual(response.json()["alerts"][0]["type"], "unassigned_shipment")
        self.assertEqual(self.client.get("/dashboard/dispatcher", headers=self.headers(self.driver_token)).status_code, 403)
        self.assertEqual(self.client.get("/dashboard/driver", headers=self.headers(self.dispatcher_token)).status_code, 403)

    def test_admin_can_provision_existing_driver_profile_without_relinking_another_driver(self):
        orphan = self.make_user("orphan-driver@example.com", "driver")
        self.assertEqual(self.client.get("/dashboard/driver", headers=self.headers(self.token(orphan))).status_code, 404)
        payload = {"license_number": "LIC-LINKED-NEW"}
        self.assertEqual(self.client.post(f"/admin/users/{orphan.id}/driver-profile", headers=self.headers(self.manager_token), json=payload).status_code, 403)
        self.assertEqual(self.client.post(f"/admin/users/{orphan.id}/driver-profile", headers=self.headers(self.dispatcher_token), json=payload).status_code, 403)
        created = self.client.post(f"/admin/users/{orphan.id}/driver-profile", headers=self.headers(self.admin_token), json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["user_id"], orphan.id)
        self.assertEqual(created.json()["attendance_status"], "unknown")
        self.assertEqual(self.client.get("/dashboard/driver", headers=self.headers(self.token(orphan))).status_code, 200)
        self.assertEqual(self.client.post(f"/admin/users/{orphan.id}/driver-profile", headers=self.headers(self.admin_token), json={"license_number": "ANOTHER-LICENSE"}).status_code, 409)
        self.assertEqual(self.client.post(f"/admin/users/{self.driver_user.id}/driver-profile", headers=self.headers(self.admin_token), json={"license_number": "DUPLICATE-PROFILE"}).status_code, 409)
        other_orphan = self.make_user("other-orphan@example.com", "driver")
        self.assertEqual(self.client.post(f"/admin/users/{other_orphan.id}/driver-profile", headers=self.headers(self.admin_token), json=payload).status_code, 409)
        self.assertEqual(self.db.get(Driver, self.driver.id).user_id, self.driver_user.id)

    def test_admin_account_provisioning_is_admin_only_and_limits_roles(self):
        payload = {"email": "new-dispatcher@example.com", "full_name": "New Dispatcher", "password": "initial-passphrase-123", "role": "dispatcher"}
        self.assertEqual(self.client.post("/admin/users", headers=self.headers(self.manager_token), json=payload).status_code, 403)
        self.assertEqual(self.client.post("/admin/users", headers=self.headers(self.dispatcher_token), json=payload).status_code, 403)
        invalid_role = self.client.post("/admin/users", headers=self.headers(self.admin_token), json={**payload, "role": "administrator"})
        self.assertEqual(invalid_role.status_code, 422)
        created = self.client.post("/admin/users", headers=self.headers(self.admin_token), json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["role"], "dispatcher")
        self.assertNotIn("password_hash", created.json())
        user = self.db.scalar(select(User).where(User.email == payload["email"]))
        self.assertNotEqual(user.password_hash, payload["password"])
        login = self.client.post("/auth/login", data={"username": payload["email"], "password": payload["password"]})
        self.assertEqual(login.status_code, 200, login.text)
        dispatcher_headers = self.headers(login.json()["access_token"])
        self.assertEqual(self.client.get("/dashboard/dispatcher", headers=dispatcher_headers).status_code, 200)
        self.assertEqual(self.client.get("/admin/users", headers=dispatcher_headers).status_code, 403)
        self.assertEqual(self.client.post("/admin/users", headers=self.headers(self.admin_token), json=payload).status_code, 409)

    def test_fleet_manager_uses_fleet_operations_but_not_admin_account_routes(self):
        self.assertEqual(self.client.get("/dashboard/dispatcher", headers=self.headers(self.manager_token)).status_code, 200)
        self.assertEqual(self.client.get("/admin/users", headers=self.headers(self.manager_token)).status_code, 403)

    def test_admin_password_reset_changes_only_password_and_verifies_new_login(self):
        self.vehicle.assigned_driver_id = self.driver.id
        self.db.commit()
        created = self.client.post("/shipments", headers=self.headers(), json={
            "tracking_number": "RESET-PRESERVE-1", "origin": "Depot", "destination": "Store",
            "cargo_description": "Boxes", "weight": 20, "vehicle_id": self.vehicle.id,
            "driver_id": self.driver.id,
        })
        self.assertEqual(created.status_code, 201, created.text)
        shipment_id = created.json()["id"]
        attendance = self.client.post(f"/drivers/{self.driver.id}/attendance", headers=self.headers(), json={
            "status": "present", "note": "Preserve this record",
        })
        self.assertEqual(attendance.status_code, 201, attendance.text)

        self.db.expire_all()
        user_count = self.db.query(User).count()
        driver_before = self.db.get(Driver, self.driver.id)
        vehicle_before = self.db.get(Vehicle, self.vehicle.id)
        driver_snapshot = (driver_before.id, driver_before.user_id, driver_before.license_number, driver_before.attendance_status)
        vehicle_snapshot = (vehicle_before.id, vehicle_before.assigned_driver_id)
        shipment_snapshot = (shipment_id, created.json()["driver_id"], created.json()["vehicle_id"], created.json()["status"])
        attendance_count = self.db.query(DriverAttendanceRecord).filter(DriverAttendanceRecord.driver_id == self.driver.id).count()
        reset_payload = {"new_password": "new-driver-passphrase-2026"}

        for token in (self.manager_token, self.dispatcher_token, self.driver_token):
            denied = self.client.post(f"/admin/users/{self.driver_user.id}/reset-password", headers=self.headers(token), json=reset_payload)
            self.assertEqual(denied.status_code, 403)
        self.assertEqual(self.client.post(f"/admin/users/{self.driver_user.id}/reset-password", headers=self.headers(self.admin_token), json={"new_password": "short"}).status_code, 422)
        self.assertEqual(self.client.post(f"/admin/users/{self.driver_user.id}/reset-password", headers=self.headers(self.admin_token), json={**reset_payload, "role": "administrator"}).status_code, 422)
        self.assertEqual(self.client.post("/admin/users/99999/reset-password", headers=self.headers(self.admin_token), json=reset_payload).status_code, 404)

        reset = self.client.post(f"/admin/users/{self.driver_user.id}/reset-password", headers=self.headers(self.admin_token), json=reset_payload)
        self.assertEqual(reset.status_code, 204, reset.text)
        self.assertEqual(reset.content, b"")
        self.assertEqual(self.client.post("/auth/login", data={"username": self.driver_user.email, "password": "test-pass-123"}).status_code, 401)
        login = self.client.post("/auth/login", data={"username": self.driver_user.email, "password": reset_payload["new_password"]})
        self.assertEqual(login.status_code, 200, login.text)
        driver_headers = self.headers(login.json()["access_token"])
        self.assertEqual(self.client.get("/auth/me", headers=driver_headers).json()["role"], "driver")
        dashboard = self.client.get("/dashboard/driver", headers=driver_headers)
        self.assertEqual(dashboard.status_code, 200, dashboard.text)
        self.assertEqual([row["id"] for row in dashboard.json()["shipments"]], [shipment_id])
        self.assertEqual(dashboard.json()["vehicle"]["id"], self.vehicle.id)
        self.assertEqual(self.db.query(User).count(), user_count)
        self.db.expire_all()
        driver_after = self.db.get(Driver, self.driver.id)
        vehicle_after = self.db.get(Vehicle, self.vehicle.id)
        shipment_after = self.db.get(Shipment, shipment_id)
        self.assertEqual((driver_after.id, driver_after.user_id, driver_after.license_number, driver_after.attendance_status), driver_snapshot)
        self.assertEqual((vehicle_after.id, vehicle_after.assigned_driver_id), vehicle_snapshot)
        self.assertEqual((shipment_after.id, shipment_after.driver_id, shipment_after.vehicle_id, shipment_after.status), shipment_snapshot)
        self.assertEqual(self.db.query(DriverAttendanceRecord).filter(DriverAttendanceRecord.driver_id == self.driver.id).count(), attendance_count)

    def test_pdf_and_excel_reports_export_real_data_with_role_checks(self):
        for report_name in ("fleet", "fuel", "maintenance", "inspections", "drivers", "deliveries"):
            pdf = self.client.get(f"/reports/{report_name}.pdf", headers=self.headers())
            self.assertEqual(pdf.status_code, 200, pdf.text)
            self.assertEqual(pdf.headers["content-type"], "application/pdf")
            self.assertTrue(pdf.content.startswith(b"%PDF"))

            excel = self.client.get(f"/reports/{report_name}.xlsx", headers=self.headers())
            self.assertEqual(excel.status_code, 200, excel.text)
            self.assertIn("spreadsheetml.sheet", excel.headers["content-type"])
            workbook = load_workbook(BytesIO(excel.content), read_only=True, data_only=True)
            self.assertTrue(workbook.active.max_row >= 1)
            workbook.close()

        self.assertEqual(self.client.get("/reports/fuel.xlsx", headers=self.headers(self.driver_token)).status_code, 403)

    def test_maintenance_reminder_job_is_idempotent_and_updates_active_state(self):
        now = datetime(2026, 10, 20, tzinfo=timezone.utc)
        record = MaintenanceRecord(
            vehicle_id=self.vehicle.id,
            service_type="Inspection",
            description="Upcoming service",
            service_date=now - timedelta(days=20),
            next_due_date=now + timedelta(days=5),
            status="completed",
        )
        self.db.add(record)
        self.db.commit()
        first = refresh_maintenance_reminders(self.db, now)
        second = refresh_maintenance_reminders(self.db, now)
        self.assertEqual(first, {"active_count": 1, "created_count": 1})
        self.assertEqual(second, {"active_count": 1, "created_count": 0})
        self.assertEqual(self.db.query(NotificationEvent).count(), 1)
        record.next_due_date = now + timedelta(days=60)
        self.db.commit()
        cleared = refresh_maintenance_reminders(self.db, now)
        self.assertEqual(cleared["active_count"], 0)
        self.assertFalse(self.db.query(NotificationEvent).one().is_active)

    def test_maintenance_reminder_job_enqueue_is_admin_only_and_handles_queue_errors(self):
        with patch.object(jobs_api.scan_maintenance_reminders, "apply_async", return_value=type("Result", (), {"id": "test-task-id"})()):
            queued = self.client.post("/jobs/maintenance-reminders", headers=self.headers(self.admin_token))
        self.assertEqual(queued.status_code, 202, queued.text)
        self.assertEqual(queued.json()["task_id"], "test-task-id")
        self.assertEqual(self.client.post("/jobs/maintenance-reminders", headers=self.headers(self.dispatcher_token)).status_code, 403)
        with patch.object(jobs_api.scan_maintenance_reminders, "apply_async", side_effect=RuntimeError("queue offline")):
            unavailable = self.client.post("/jobs/maintenance-reminders", headers=self.headers(self.admin_token))
        self.assertEqual(unavailable.status_code, 503)

    def test_vehicle_inspections_and_health_report_use_saved_checklist(self):
        created = self.client.post("/maintenance/inspections", headers=self.headers(), json={
            "vehicle_id": self.vehicle.id,
            "category": "general_inspection",
            "result": "attention_required",
            "checklist": {"brakes": True, "tires": False},
            "notes": "Tire condition needs review",
        })
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["inspector_user_id"], self.manager.id)
        self.assertEqual(created.json()["checklist"], {"brakes": True, "tires": False})
        self.assertEqual(self.client.get("/maintenance/inspections", headers=self.headers(self.dispatcher_token)).status_code, 200)
        health = self.client.get(f"/maintenance/vehicles/{self.vehicle.id}/health", headers=self.headers()).json()
        self.assertEqual(health["health_assessment"], "attention_required")
        self.assertIsNone(health["last_completed_service"])
        self.assertIn("no synthetic health score", health["assessment_source"])
        self.assertEqual(self.client.post("/maintenance/inspections", headers=self.headers(self.dispatcher_token), json={
            "vehicle_id": self.vehicle.id, "result": "passed", "checklist": {"brakes": True},
        }).status_code, 403)


if __name__ == "__main__":
    unittest.main()
