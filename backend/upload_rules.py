"""Rules for files uploaded to a driver profile (photo, licence and ID documents).

Pure functions, so they can be tested on their own. The file's real type is read from its
first bytes: a name or extension the user supplies is never trusted.
"""
import re

PHOTO_MAX_BYTES = 2 * 1024 * 1024
DOC_MAX_BYTES = 5 * 1024 * 1024
PHOTO_TYPES = ("jpg", "png", "webp")
DOC_TYPES = ("pdf", "jpg", "png")
CONTENT_TYPES = {
    "jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "pdf": "application/pdf",
}
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf"}


def detect_type(data):
    """'jpg', 'png', 'webp', 'pdf' or None, judged only by the file's first bytes."""
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data.startswith(b"%PDF-"):
        return "pdf"
    return None


def check_upload(data, allowed, max_bytes):
    """-> (kind, None, None) when the file is acceptable, else (None, http_status, message)."""
    if not data:
        return None, 400, "The file is empty"
    if len(data) > max_bytes:
        return None, 413, f"The file is too large (the limit is {max_bytes // (1024 * 1024)} MB)"
    kind = detect_type(data)
    if kind not in allowed:
        names = ", ".join(a.upper() for a in allowed)
        return None, 415, f"Only {names} files are accepted"
    return kind, None, None


def clean_filename(name, limit=200):
    """The name to show for an uploaded file: no folders, no control characters, never empty."""
    name = re.split(r"[\\/]", name or "")[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()
    if name in ("", ".", ".."):
        return "file"
    return name[:limit]
