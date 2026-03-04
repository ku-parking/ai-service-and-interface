from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import logging
from models import BoundingBox, SpotDefinition, SaveSpotsRequest
from io import BytesIO
from fastapi import UploadFile, File, HTTPException
from functools import lru_cache
from setting import Settings
from predict_utils import _model_predict, _car_detection_predict

logging.basicConfig(level=logging.INFO)

app = FastAPI()

@lru_cache
def get_settings():
    return Settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allow_origins,
    allow_credentials=True,
    allow_methods=get_settings().allow_methods,
    allow_headers=get_settings().allow_headers,
)

# In-memory store for the confirmed parking spot definitions
parking_spots: list[dict] = []


# ── Endpoints ────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "KU PARKING SPOT MANAGEMENT SYSTEM"}


@app.post("/init")
async def init(frame: UploadFile = File(...)):
    """Send an initial frame to detect parking spots via YOLO."""
    try:
        image = Image.open(BytesIO(await frame.read()))
        spots = _model_predict(image)
        logging.info("Spots detected: %s", len(spots))
        return {"spots": spots}
    except Exception as e:
        logging.error(e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/spots")
async def save_spots(req: SaveSpotsRequest):
    """Save the user-confirmed parking spot definitions."""
    global parking_spots
    parking_spots = [s.model_dump() for s in req.spots]
    logging.info("Saved %d parking spot definitions", len(parking_spots))
    return {"saved": len(parking_spots)}


@app.get("/spots")
async def get_spots():
    """Return the current parking spot definitions."""
    return {"spots": parking_spots}


@app.post("/frame")
async def receive_frame(frame: UploadFile = File(...)):
    """
    Receive a monitoring frame from the frontend.
    For now just acknowledges receipt. Later this will be processed
    by the car-detection model and saved to the database.
    """
    image = Image.open(BytesIO(await frame.read()))
    car_results = _car_detection_predict(image)
    logging.info("Car results: %s", car_results)
    return {"received": True}
