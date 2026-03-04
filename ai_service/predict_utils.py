from ultralytics.utils import ThreadingLocked
from PIL import Image
import torch
from ultralytics import YOLO

device = torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')
parking_spot_model = YOLO("models/parking_spot_v1.pt").to(device)
car_detection_model = YOLO("models/yolo26n.pt").to(device)

@ThreadingLocked()
def _model_predict(image: Image.Image) -> list[dict]:
    results = parking_spot_model.predict(image)
    return results[0].summary() if results else []


@ThreadingLocked()
def _car_detection_predict(image: Image.Image) -> list[dict]:
    results = car_detection_model.predict(image)
    return results[0].summary() if results else []
