from fastapi import BackgroundTasks, FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import json
import logging
import os
from io import BytesIO
from db import get_spot_coordinates
from iou_utils import check_occupancy
from redis_client import get_redis
from setting import get_settings
from datetime import datetime
logging.basicConfig(level=logging.INFO)

app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allow_origins,
    allow_credentials=True,
    allow_methods=get_settings().allow_methods,
    allow_headers=get_settings().allow_headers,
)


def _detect_parking_spots(image: Image.Image) -> list[dict]:
    if os.getenv("MOCK_DETECTION", "0") == "1":
        return [{"id": 1, "x1": 1, "y1": 1, "x2": 6, "y2": 6}]

    from predict_utils import _model_predict

    return _model_predict(image)


def _detect_cars(image: Image.Image) -> list[dict]:
    if os.getenv("MOCK_DETECTION", "0") == "1":
        return [{"box": {"x1": 1, "y1": 1, "x2": 6, "y2": 6}}]

    from predict_utils import _car_detection_predict

    return _car_detection_predict(image)


@app.get("/")
async def root():
    return {"message": "KU PARKING SPOT MANAGEMENT SYSTEM"}


@app.post("/init")
async def init(frame: UploadFile = File(...)):
    """Send an initial frame to detect parking spots via YOLO."""
    try:
        image = Image.open(BytesIO(await frame.read()))
        spots = _detect_parking_spots(image)
        logging.info("Spots detected: %s", len(spots))
        return {"spots": spots}
    except Exception as e:
        logging.error(e)
        raise HTTPException(status_code=500, detail=str(e)) from e




def _cache_occupancy(parking_spot_id: int, data: dict):
    """Fire-and-forget: persist the latest occupancy result to Redis."""
    try:
        r = get_redis()
        key = f"occupancy:{parking_spot_id}"
        r.set(key, json.dumps(data), ex=get_settings().redis_occupancy_ttl_seconds)
    except Exception as e:
        logging.warning("Redis write failed (non-fatal): %s", e)


@app.post("/frame")
async def receive_frame(
    frame: UploadFile = File(...),
    parking_spot_id: int = Form(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """
    Receive a monitoring frame, detect cars, read spot coords from DB,
    compute IoU to determine which spots are occupied.
    """
    try:
        image = Image.open(BytesIO(await frame.read()))
        car_results = _detect_cars(image)
        logging.info("Cars detected: %s", len(car_results))

        spot_coords = get_spot_coordinates(parking_spot_id)
        logging.info(
            "Loaded %d spot coordinates for parking_spot_id=%d",
            len(spot_coords),
            parking_spot_id,
        )

        occupancy = check_occupancy(spot_coords, car_results)
        occupied_count = sum(1 for s in occupancy if s["occupied"])

        result = {
            "spots": occupancy,
            "total": len(occupancy),
            "occupied": occupied_count,
            "available": len(occupancy) - occupied_count,
            "updated_at": datetime.now().isoformat(),
        }

        background_tasks.add_task(_cache_occupancy, parking_spot_id, result)

        return result
    except Exception as e:
        logging.error("Frame processing error: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e
