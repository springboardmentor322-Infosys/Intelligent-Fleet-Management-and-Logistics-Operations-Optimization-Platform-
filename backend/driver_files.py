"""Driver photo and document files, and document verification.

Files live on disk under backend/uploads/ (git-ignored); the database only holds a random
stored name. Nothing a user types ever becomes a path. The real file type is checked from the
file's first bytes (see upload_rules.py).

ACCESS: the same rule as the profile. Staff and the driver themselves can view a driver's
files; only a manager or the driver themselves can upload or remove them; only a manager can
verify a document.
"""
import secrets
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import models
from database import get_db
from driver_profile import MANAGE, MANAGE_ROLES, document_out, load_driver_for
from security import get_current_user
from upload_rules import (
    CONTENT_TYPES, DOC_MAX_BYTES, DOC_TYPES, PHOTO_MAX_BYTES, PHOTO_TYPES, check_upload,
    clean_filename,
)

router = APIRouter(tags=["driver files"])

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
MAX_DOCUMENTS = 10
# Files are private: never cached by shared caches, and never sniffed as another type.
SAFE_HEADERS = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"}


# ---------- helpers ----------
def need_upload_rights(user, d):
    if user.role not in MANAGE_ROLES and not (d.user_id is not None and d.user_id == user.id):
        raise HTTPException(403, "You do not have permission to change this driver's files")


def new_name(kind):
    return f"{secrets.token_hex(16)}.{kind}"          # random: a user-supplied name is never used


def path_for(stored_name):
    """The file's path, only ever inside the uploads folder."""
    path = (UPLOAD_DIR / stored_name).resolve()
    if path.parent != UPLOAD_DIR.resolve():
        raise HTTPException(404, "File not found")
    return path


def save_file(stored_name, data):
    UPLOAD_DIR.mkdir(exist_ok=True)
    path_for(stored_name).write_bytes(data)


def remove_file(stored_name):
    try:
        path_for(stored_name).unlink()
    except (OSError, HTTPException):
        pass  # already gone: nothing to clean up


def load_document(db, d, doc_id):
    doc = db.get(models.DriverDocument, doc_id)
    if doc is None or doc.driver_id != d.id:
        raise HTTPException(404, "Document not found")
    return doc


# ---------- photo ----------
@router.post("/drivers/{driver_id}/photo")
async def upload_photo(driver_id: int, file: UploadFile = File(...),
                       user=Depends(get_current_user), db: Session = Depends(get_db)):
    d = load_driver_for(db, user, driver_id)
    need_upload_rights(user, d)
    data = await file.read(PHOTO_MAX_BYTES + 1)       # one byte over the limit is enough to know
    kind, status, message = check_upload(data, PHOTO_TYPES, PHOTO_MAX_BYTES)
    if kind is None:
        raise HTTPException(status, message)
    old, name = d.photo_name, new_name(kind)
    save_file(name, data)
    d.photo_name = name
    try:
        db.commit()
    except Exception:
        db.rollback()
        remove_file(name)
        raise
    if old:
        remove_file(old)
    return {"photo_url": f"/drivers/{d.id}/photo"}


@router.get("/drivers/{driver_id}/photo")
def get_photo(driver_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    d = load_driver_for(db, user, driver_id)
    if not d.photo_name:
        raise HTTPException(404, "This driver has no photo")
    path = path_for(d.photo_name)
    if not path.is_file():
        raise HTTPException(404, "The photo file is missing")
    kind = d.photo_name.rsplit(".", 1)[-1]
    return FileResponse(path, media_type=CONTENT_TYPES.get(kind, "application/octet-stream"),
                        headers=SAFE_HEADERS)


# ---------- documents ----------
@router.post("/drivers/{driver_id}/documents", status_code=201)
async def upload_document(driver_id: int, doc_type: str = Form(...), file: UploadFile = File(...),
                          user=Depends(get_current_user), db: Session = Depends(get_db)):
    d = load_driver_for(db, user, driver_id)
    need_upload_rights(user, d)
    if doc_type not in models.DOCUMENT_TYPES:
        raise HTTPException(400, "Document type must be one of: " + ", ".join(models.DOCUMENT_TYPES))
    data = await file.read(DOC_MAX_BYTES + 1)
    kind, status, message = check_upload(data, DOC_TYPES, DOC_MAX_BYTES)
    if kind is None:
        raise HTTPException(status, message)

    # A new Licence front / back / ID proof replaces the old one (and so starts unverified).
    replaced = None
    if doc_type != "Other":
        replaced = next((x for x in d.documents if x.doc_type == doc_type), None)
    if len(d.documents) - (1 if replaced else 0) >= MAX_DOCUMENTS:
        raise HTTPException(400, f"A driver can have at most {MAX_DOCUMENTS} documents")

    name, old_name = new_name(kind), replaced.stored_name if replaced else None
    save_file(name, data)
    if replaced:
        d.documents.remove(replaced)
        db.flush()
    doc = models.DriverDocument(
        driver_id=d.id, doc_type=doc_type, original_name=clean_filename(file.filename),
        stored_name=name, content_type=CONTENT_TYPES[kind], size_bytes=len(data))
    d.documents.append(doc)
    try:
        db.commit()
    except Exception:
        db.rollback()
        remove_file(name)
        raise
    if old_name:
        remove_file(old_name)
    return document_out(doc, d.id)


@router.get("/drivers/{driver_id}/documents/{doc_id}/file")
def download_document(driver_id: int, doc_id: int, user=Depends(get_current_user),
                      db: Session = Depends(get_db)):
    d = load_driver_for(db, user, driver_id)
    doc = load_document(db, d, doc_id)
    path = path_for(doc.stored_name)
    if not path.is_file():
        raise HTTPException(404, "The document file is missing")
    return FileResponse(path, media_type=doc.content_type, filename=doc.original_name,
                        headers=SAFE_HEADERS)


@router.delete("/drivers/{driver_id}/documents/{doc_id}")
def delete_document(driver_id: int, doc_id: int, user=Depends(get_current_user),
                    db: Session = Depends(get_db)):
    d = load_driver_for(db, user, driver_id)
    doc = load_document(db, d, doc_id)
    need_upload_rights(user, d)
    if doc.verified and user.role not in MANAGE_ROLES:
        raise HTTPException(403, "A verified document can only be removed by a manager")
    stored = doc.stored_name
    d.documents.remove(doc)
    db.commit()
    remove_file(stored)
    return {"deleted": doc_id}


@router.post("/drivers/{driver_id}/documents/{doc_id}/verify")
def verify_document(driver_id: int, doc_id: int, user=Depends(MANAGE),
                    db: Session = Depends(get_db)):
    d = load_driver_for(db, user, driver_id)
    doc = load_document(db, d, doc_id)
    doc.verified, doc.verified_by = True, user.username
    doc.verified_at = datetime.now(timezone.utc)
    db.commit()
    return document_out(doc, d.id)


@router.post("/drivers/{driver_id}/documents/{doc_id}/unverify")
def unverify_document(driver_id: int, doc_id: int, user=Depends(MANAGE),
                      db: Session = Depends(get_db)):
    d = load_driver_for(db, user, driver_id)
    doc = load_document(db, d, doc_id)
    doc.verified, doc.verified_by, doc.verified_at = False, None, None
    db.commit()
    return document_out(doc, d.id)
