from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import require_roles
from app.models.user import User
from app.tasks.maintenance_reminders import scan_maintenance_reminders

router = APIRouter(prefix="/jobs", tags=["Background Jobs"])


@router.post("/maintenance-reminders", status_code=status.HTTP_202_ACCEPTED)
def enqueue_maintenance_reminder_scan(
    current_user: User = Depends(require_roles("administrator")),
):
    try:
        result = scan_maintenance_reminders.apply_async()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Background task queue is unavailable",
        )
    return {"task_id": result.id, "status": "queued"}
