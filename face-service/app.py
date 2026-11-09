"""
KEZMOTO face-service

A small private API that answers one question: is the face in this live
selfie the same person as the face printed on this valid ID?

It uses the open-source `face_recognition` library (dlib's pre-trained face
model). The model turns each face into a 128-number "face fingerprint"
(an encoding). The decision is then one simple rule:

    distance between the two fingerprints <= FACE_MATCH_THRESHOLD  ->  same person

Lower distance = more similar. The library's own default is 0.6; KEZMOTO uses
a strict 0.4, because dlib's model rates different people of the same
(especially Asian) ethnicity as closer than it should, and 0.5 let a
different person through in testing. The model
compares face geometry only - it never looks at gender, age or any other
attribute.

Only the KEZMOTO `face-match` Supabase Edge Function calls this service,
authenticated with the shared FACE_SERVICE_SECRET. Photos are processed in
memory and never written to disk.
"""

import base64
import binascii
import hmac
import io
import os

import face_recognition
import numpy as np
from fastapi import FastAPI, Header, HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel

# ---------------------------------------------------------------- settings

SECRET = os.environ.get("FACE_SERVICE_SECRET", "")
THRESHOLD = float(os.environ.get("FACE_MATCH_THRESHOLD", "0.4"))

# Big phone photos are shrunk first: the face model doesn't need more than
# this, and it keeps the work small enough for a free server (0.1 CPU).
# The ID gets a bit more room because its printed portrait is small; in a
# selfie the face fills the frame.
ID_MAX_EDGE = 1280
SELFIE_MAX_EDGE = 800

# Face detection normally runs at 1x. Only if no face is found on the ID at
# 1x is it re-scanned zoomed in (2x) - that is ~4x the work, so it is only
# paid when the portrait is genuinely too small to find.
ID_UPSAMPLE_RETRY = 2

# How many slightly shifted copies each face fingerprint is averaged over.
# 1 keeps the free server fast; the 0.4 threshold already leaves margin.
NUM_JITTERS = 1

app = FastAPI(title="KEZMOTO face-service", docs_url=None, redoc_url=None)


class CompareRequest(BaseModel):
    id_image: str  # base64 of the uploaded valid ID photo
    selfie_image: str  # base64 of the live selfie


# ---------------------------------------------------------------- helpers


def load_image(b64: str, label: str, max_edge: int) -> np.ndarray:
    """base64 -> upright, RGB, size-capped numpy array."""
    try:
        raw = base64.b64decode(b64, validate=False)
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)  # phone photos are often stored sideways
        img = img.convert("RGB")
    except (binascii.Error, UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=422, detail=f"bad_{label}_image")

    img.thumbnail((max_edge, max_edge))
    return np.array(img)


def box_area(box: tuple) -> int:
    top, right, bottom, left = box
    return max(0, bottom - top) * max(0, right - left)


# ---------------------------------------------------------------- routes


@app.get("/health")
def health():
    """Used by Render's health check, and to wake the service up."""
    return {"ok": True}


@app.post("/compare")
def compare(body: CompareRequest, authorization: str = Header(default="")):
    if not SECRET:
        raise HTTPException(status_code=500, detail="service_not_configured")
    # Constant-time comparison so the secret can't be guessed by timing.
    if not hmac.compare_digest(authorization, f"Bearer {SECRET}"):
        raise HTTPException(status_code=401, detail="unauthorized")

    id_img = load_image(body.id_image, "id", ID_MAX_EDGE)
    selfie_img = load_image(body.selfie_image, "selfie", SELFIE_MAX_EDGE)

    # --- find the faces (selfie first: if it has no single face, the
    # expensive ID scan is skipped entirely)
    selfie_boxes = face_recognition.face_locations(selfie_img, number_of_times_to_upsample=1)
    if len(selfie_boxes) == 1:
        id_boxes = face_recognition.face_locations(id_img, number_of_times_to_upsample=1)
        if not id_boxes:
            id_boxes = face_recognition.face_locations(id_img, number_of_times_to_upsample=ID_UPSAMPLE_RETRY)
    else:
        id_boxes = []

    result = {
        "id_faces": len(id_boxes),
        "selfie_faces": len(selfie_boxes),
        "distance": None,
        "matched": False,
        "threshold": THRESHOLD,
    }

    # The ID must show a face, and the selfie must show exactly one.
    # (Many IDs also print a small "ghost" copy of the portrait - the
    # largest face on the card is the real portrait, so that one is used.)
    if len(id_boxes) == 0 or len(selfie_boxes) != 1:
        return result

    id_box = max(id_boxes, key=box_area)

    # --- turn each face into its 128-number fingerprint
    id_enc = face_recognition.face_encodings(id_img, known_face_locations=[id_box], num_jitters=NUM_JITTERS)
    selfie_enc = face_recognition.face_encodings(selfie_img, known_face_locations=selfie_boxes, num_jitters=NUM_JITTERS)
    if not id_enc or not selfie_enc:
        result["id_faces"] = len(id_enc)
        result["selfie_faces"] = len(selfie_enc)
        return result

    # --- the rule: how far apart are the two fingerprints?
    distance = float(face_recognition.face_distance([id_enc[0]], selfie_enc[0])[0])
    result["distance"] = round(distance, 4)
    result["matched"] = distance <= THRESHOLD
    return result
