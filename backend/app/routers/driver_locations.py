
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.core.dependencies import get_current_user, require_roles
from app.db.dependencies import get_db
from app.models.driver import Driver
from app.models.driver_location import DriverLocation
from app.models.user import User
from app.models.trip import Trip
from app.schemas.driver_location import (
    DriverLocationUpdate,
    DriverLocationResponse,
)
from app.schemas.user import UserRole
from fastapi import Query, WebSocket, WebSocketDisconnect
import jwt
from jwt.exceptions import InvalidTokenError
from app.core.location_connections import location_manager
from app.core.config import (
    JWT_ALGORITHM,
    JWT_SECRET_KEY,
    SHARED_DRIVER_EMAIL,
)
from app.core.location_connections import location_manager

router = APIRouter(
    prefix="/driver-locations",
    tags=["Driver Locations"],
)

def verify_location_access(
    current_user: User = Depends(get_current_user),
):
    role = current_user.role

    if hasattr(role, "value"):
        role = role.value

    allowed_roles = {
        UserRole.ADMINISTRATOR.value,
        UserRole.FLEET_MANAGER.value,
        UserRole.DISPATCHER.value,
    }

    is_shared_driver = (
        role == UserRole.DRIVER.value
        and (current_user.email or "").strip().lower()
        == SHARED_DRIVER_EMAIL.strip().lower()
    )

    if role not in allowed_roles and not is_shared_driver:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access driver locations.",
        )

    return current_user


def can_view_fleet_locations(
    current_user: User = Depends(get_current_user),
):
    role = current_user.role
    if hasattr(role, "value"):
        role = role.value

    allowed_roles = {
        UserRole.ADMINISTRATOR.value,
        UserRole.FLEET_MANAGER.value,
        UserRole.DISPATCHER.value,
    }

    is_shared_driver = (
        role == UserRole.DRIVER.value
        and (current_user.email or "").strip().lower()
        == SHARED_DRIVER_EMAIL.strip().lower()
    )

    if role not in allowed_roles and not is_shared_driver:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view fleet locations.",
        )

    return current_user

@router.put("/me", response_model=DriverLocationResponse)
async def update_my_location(
    location_data: DriverLocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    driver = db.query(Driver).filter(
        Driver.user_id == current_user.id
    ).first()
    
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found.",
        )

    check_simulation_not_active(db, driver.id)
    location = db.query(DriverLocation).filter(
        DriverLocation.driver_id == driver.id
    ).first()

    # The database column currently stores a timezone-naive UTC timestamp.
    now_utc = datetime.now(timezone.utc)

    if location is None:
        location = DriverLocation(
            driver_id=driver.id,
            latitude=location_data.latitude,
            longitude=location_data.longitude,
            accuracy=location_data.accuracy,
            updated_at=now_utc,
        )
        db.add(location)
    else:
        location.latitude = location_data.latitude
        location.longitude = location_data.longitude
        location.accuracy = location_data.accuracy
        location.updated_at = now_utc
        location.is_simulated = False
    db.commit()
    db.refresh(location)

    await location_manager.broadcast_location({
        "driver_id": location.driver_id,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "accuracy": location.accuracy,
        "updated_at": location.updated_at.isoformat()
        if location.updated_at
        else None,
    })

    return {
        "driver_id": location.driver_id,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "accuracy": location.accuracy,
        "updated_at": location.updated_at,
    }


@router.get("/me", response_model=DriverLocationResponse)
def get_my_location(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    driver = db.query(Driver).filter(
        Driver.user_id == current_user.id
    ).first()

    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found.",
        )

    location = db.query(DriverLocation).filter(
        DriverLocation.driver_id == driver.id
    ).first()

    if location is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No GPS location has been recorded yet.",
        )

    return {
        "driver_id": location.driver_id,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "accuracy": location.accuracy,
        "updated_at": location.updated_at,
        "is_simulated": location.is_simulated,
    }

@router.get(
    "/",
    response_model=list[DriverLocationResponse],
)
def get_all_driver_locations(
    db: Session = Depends(get_db),
    current_user: User = Depends(can_view_fleet_locations),
):
    locations = (
        db.query(DriverLocation)
        .join(Driver, Driver.id == DriverLocation.driver_id)
        .all()
    )

    return [
        {
            "driver_id": location.driver_id,
            "latitude": location.latitude,
            "longitude": location.longitude,
            "accuracy": location.accuracy,
            "updated_at": location.updated_at,
            "is_simulated": location.is_simulated,
        }
        for location in locations
    ]


@router.get(
    "/by-driver/{driver_id}",
    response_model=DriverLocationResponse,
)
def get_selected_driver_location(
    driver_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_location_access(current_user)

    driver = db.query(Driver).filter(
        Driver.id == driver_id
    ).first()

    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found.",
        )

    location = db.query(DriverLocation).filter(
        DriverLocation.driver_id == driver_id
    ).first()

    if location is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No GPS location has been recorded for this driver.",
        )

    return {
        "driver_id": location.driver_id,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "accuracy": location.accuracy,
        "updated_at": location.updated_at,
        "is_simulated": location.is_simulated,
    }


@router.put(
    "/by-driver/{driver_id}",
    response_model=DriverLocationResponse,
)
async def update_selected_driver_location(
    driver_id: int,
    location_data: DriverLocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_location_access(current_user)

    driver = db.query(Driver).filter(
        Driver.id == driver_id
    ).first()

    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found.",
        )

    check_simulation_not_active(db, driver.id)

    location = db.query(DriverLocation).filter(
        DriverLocation.driver_id == driver_id
    ).first()

    now_utc = datetime.now(timezone.utc)

    if location is None:
        location = DriverLocation(
            driver_id=driver_id,
            latitude=location_data.latitude,
            longitude=location_data.longitude,
            accuracy=location_data.accuracy,
            updated_at=now_utc,
        )
        db.add(location)
    else:
        location.latitude = location_data.latitude
        location.longitude = location_data.longitude
        location.accuracy = location_data.accuracy
        location.updated_at = now_utc
        location.is_simulated = False
    db.commit()
    db.refresh(location)

    await location_manager.broadcast_location({
        "driver_id": location.driver_id,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "accuracy": location.accuracy,
        "is_simulated": location.is_simulated,
        "updated_at": location.updated_at.isoformat()
        if location.updated_at
        else None,
    })

    return {
        "driver_id": location.driver_id,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "accuracy": location.accuracy,
        "is_simulated": location.is_simulated,
        "updated_at": location.updated_at,
    }


@router.put("/by-trip/{trip_id}/simulation")
async def update_simulated_trip_location(
    trip_id: int,
    location_data: DriverLocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            UserRole.ADMINISTRATOR,
            UserRole.FLEET_MANAGER,
            UserRole.DISPATCHER,
        )
    ),
):
    trip = db.query(Trip).filter(
        Trip.id == trip_id
    ).first()

    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found.",
        )

    if trip.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only in-progress trips can receive simulated locations.",
        )

    driver = db.query(Driver).filter(
        Driver.id == trip.driver_id
    ).first()

    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver associated with this trip was not found.",
        )

    driver_location = db.query(DriverLocation).filter(
        DriverLocation.driver_id == driver.id
    ).first()

    if driver_location is None:
        driver_location = DriverLocation(
            driver_id=driver.id,
            latitude=location_data.latitude,
            longitude=location_data.longitude,
            accuracy=location_data.accuracy,
            is_simulated=True,
        )
        db.add(driver_location)
    else:
        driver_location.latitude = location_data.latitude
        driver_location.longitude = location_data.longitude
        driver_location.accuracy = location_data.accuracy
        driver_location.is_simulated = True

    driver_location.updated_at = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(driver_location)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unable to update simulated driver location.",
        )

    location_message = {
        "driver_id": driver.id,
        "trip_id": trip.id,
        "latitude": driver_location.latitude,
        "longitude": driver_location.longitude,
        "accuracy": driver_location.accuracy,
        "updated_at": driver_location.updated_at.isoformat(),
        "is_simulated": True,
    }

    await location_manager.broadcast_location(location_message)

    return location_message



@router.websocket("/ws")
async def driver_locations_websocket(
    websocket: WebSocket,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )

        user_id = payload.get("sub")

        if user_id is None:
            print("WEBSOCKET ERROR: Missing user ID in token.")
            await websocket.close(code=1008)
            return

        user_id = int(user_id)

    except InvalidTokenError as exc:
        print(f"WEBSOCKET JWT ERROR: {exc}")
        await websocket.close(code=1008)
        return

    except (ValueError, TypeError) as exc:
        print(f"WEBSOCKET TOKEN FORMAT ERROR: {exc}")
        await websocket.close(code=1008)
        return

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if user is None:
        print(f"WEBSOCKET ERROR: User {user_id} not found.")
        await websocket.close(code=1008)
        return

    if not user.is_active:
        print(f"WEBSOCKET ERROR: User {user_id} is inactive.")
        await websocket.close(code=1008)
        return

    role = user.role

    if hasattr(role, "value"):
        role = role.value

    role = str(role).strip().lower()

    allowed_roles = {
        UserRole.ADMINISTRATOR.value,
        UserRole.FLEET_MANAGER.value,
        UserRole.DISPATCHER.value,
    }

    is_shared_driver = (
        role == UserRole.DRIVER.value
        and (user.email or "").strip().lower()
        == SHARED_DRIVER_EMAIL.strip().lower()
    )

    print("WEBSOCKET AUTH CHECK:")
    print("User ID:", user.id)
    print("Database role:", role)
    print("User active:", user.is_active)
    print("Shared driver:", is_shared_driver)

    if role not in allowed_roles and not is_shared_driver:
        print("WEBSOCKET ERROR: Unauthorized role:", role)
        await websocket.close(code=1008)
        return

    await location_manager.connect(websocket)

    print(f"WEBSOCKET CONNECTED: User {user.id}")

    try:
        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        print(f"WEBSOCKET DISCONNECTED: User {user.id}")

    finally:
        await location_manager.disconnect(websocket)



def check_simulation_not_active(db: Session, driver_id: int):
    """Prevent real GPS updates from overwriting active trip simulation."""

    active_trip = db.query(Trip).filter(
        Trip.driver_id == driver_id,
        Trip.status == "in_progress",
    ).first()

    if active_trip is not None:
        location = db.query(DriverLocation).filter(
            DriverLocation.driver_id == driver_id
        ).first()

        if location is not None and location.is_simulated:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Location is currently controlled by "
                    "active trip simulation."
                ),
            )
