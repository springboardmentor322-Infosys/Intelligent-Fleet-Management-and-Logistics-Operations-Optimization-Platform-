"""Checks the upload rules for driver photos and documents (plan step 4). No server needed.

    cd backend
    python test_upload_rules.py
"""
from upload_rules import (
    DOC_MAX_BYTES, DOC_TYPES, PHOTO_MAX_BYTES, PHOTO_TYPES, check_upload, clean_filename,
    detect_type,
)

JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 50
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 50
PDF = b"%PDF-1.7\n" + b"x" * 50
EXE = b"MZ\x90\x00" + b"\x00" * 100            # a Windows program
results = []


def check(name, ok):
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name)


# ---- the real type comes from the bytes ----
check("jpeg detected", detect_type(JPG) == "jpg")
check("png detected", detect_type(PNG) == "png")
check("webp detected", detect_type(WEBP) == "webp")
check("pdf detected", detect_type(PDF) == "pdf")
check("a program is not recognised", detect_type(EXE) is None)
check("RIFF that is not WEBP (e.g. a .wav) is not recognised", detect_type(b"RIFF\x24\x00\x00\x00WAVEfmt ") is None)
check("empty bytes are not recognised", detect_type(b"") is None)

# ---- photo rules ----
check("a jpg photo is accepted", check_upload(JPG, PHOTO_TYPES, PHOTO_MAX_BYTES)[0] == "jpg")
check("a webp photo is accepted", check_upload(WEBP, PHOTO_TYPES, PHOTO_MAX_BYTES)[0] == "webp")
check("a PDF is not a photo (415)", check_upload(PDF, PHOTO_TYPES, PHOTO_MAX_BYTES)[1] == 415)

# ---- document rules ----
check("a pdf document is accepted", check_upload(PDF, DOC_TYPES, DOC_MAX_BYTES)[0] == "pdf")
check("a png document is accepted", check_upload(PNG, DOC_TYPES, DOC_MAX_BYTES)[0] == "png")
check("a webp is not an accepted document (415)", check_upload(WEBP, DOC_TYPES, DOC_MAX_BYTES)[1] == 415)

# ---- the attacks ----
check("an .exe renamed to .pdf is rejected (the name is never looked at)",
      check_upload(EXE, DOC_TYPES, DOC_MAX_BYTES)[1] == 415)
check("a script with a PDF-looking name is rejected", check_upload(b"<?php echo 1; ?>", DOC_TYPES, DOC_MAX_BYTES)[1] == 415)
check("an empty file is rejected (400)", check_upload(b"", DOC_TYPES, DOC_MAX_BYTES)[1] == 400)
big_doc = PDF + b"0" * (6 * 1024 * 1024)
check("a 6 MB document is rejected (413)", check_upload(big_doc, DOC_TYPES, DOC_MAX_BYTES)[1] == 413)
big_photo = JPG + b"0" * (3 * 1024 * 1024)
check("a 3 MB photo is rejected (413)", check_upload(big_photo, PHOTO_TYPES, PHOTO_MAX_BYTES)[1] == 413)
exactly = PDF + b"0" * (DOC_MAX_BYTES - len(PDF))
check("a document of exactly 5 MB is accepted", check_upload(exactly, DOC_TYPES, DOC_MAX_BYTES)[0] == "pdf")
check("one byte over 5 MB is rejected", check_upload(exactly + b"0", DOC_TYPES, DOC_MAX_BYTES)[1] == 413)

# ---- filenames ----
check("../../x.pdf becomes x.pdf", clean_filename("../../x.pdf") == "x.pdf")
check("a Windows path becomes the file name", clean_filename("C:\\Users\\evil\\licence.pdf") == "licence.pdf")
check("control characters are removed", clean_filename("a\x00b\r\n.pdf") == "ab.pdf")
check("an empty name becomes 'file'", clean_filename("") == "file" and clean_filename(None) == "file")
check("'..' becomes 'file'", clean_filename("..") == "file" and clean_filename("../..") == "file")
check("a very long name is cut to 200 characters", len(clean_filename("a" * 500 + ".pdf")) == 200)
check("an ordinary name is kept", clean_filename("My Licence (front).jpg") == "My Licence (front).jpg")

# ---- must-fail: wrong expectations have to be rejected ----
check("must-fail: an .exe is not 'pdf'", detect_type(EXE) != "pdf")
check("must-fail: ../../x is not kept as a path", "/" not in clean_filename("../../x") and ".." not in clean_filename("../../x"))

print(f"\n{sum(results)}/{len(results)} passed")
raise SystemExit(0 if all(results) else 1)
