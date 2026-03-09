IOU_THRESHOLD = 0.3


def compute_iou(box_a: dict, box_b: dict) -> float:
    x1 = max(box_a["x1"], box_b["x1"])
    y1 = max(box_a["y1"], box_b["y1"])
    x2 = min(box_a["x2"], box_b["x2"])
    y2 = min(box_a["y2"], box_b["y2"])

    intersection = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = (box_a["x2"] - box_a["x1"]) * (box_a["y2"] - box_a["y1"])
    area_b = (box_b["x2"] - box_b["x1"]) * (box_b["y2"] - box_b["y1"])
    union = area_a + area_b - intersection
    return intersection / union if union > 0 else 0.0


def check_occupancy(
    spot_coords: list[dict], car_detections: list[dict]
) -> list[dict]:
    results = []
    for spot in spot_coords:
        occupied = any(
            compute_iou(spot, car["box"]) > IOU_THRESHOLD
            for car in car_detections
        )
        results.append({**spot, "occupied": occupied})
    return results
