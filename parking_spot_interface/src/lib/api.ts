const BACKEND_URL = "/api/backend";

/* ── Types ──────────────────────────────────────────────────────────── */

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Raw YOLO detection from the backend */
export interface Detection {
  name: string;
  class: number;
  confidence: number;
  box: BoundingBox;
}

/** An editable parking spot managed by the frontend */
export interface EditableSpot {
  id: string;
  box: BoundingBox;
  confidence?: number;
}

export interface InitResponse {
  spots: Detection[];
}

export interface SpotOccupancy {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  occupied: boolean;
}

export interface FrameResponse {
  spots: SpotOccupancy[];
  total: number;
  occupied: number;
  available: number;
}

/* ── API calls ──────────────────────────────────────────────────────── */

/**
 * Send the initial frame to the AI service.
 * Returns detected parking-spot bounding boxes.
 */
export async function initParkingSpots(
  frameBlob: Blob,
): Promise<InitResponse> {
  const form = new FormData();
  form.append("frame", frameBlob, "init_frame.jpg");

  const res = await fetch(`${BACKEND_URL}/init`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Init failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as InitResponse;
}

/**
 * Save parking spot area (name + image + coordinates) to the database via Next.js API.
 */
export async function saveParkingSpot(
  name: string,
  imageBlob: Blob,
  spots: BoundingBox[],
): Promise<{ id: number }> {
  const form = new FormData();
  form.append("name", name);
  form.append("image", imageBlob, "parking_area.jpg");
  form.append("spots", JSON.stringify(spots));

  const res = await fetch("/api/parking-spots", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Save failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as { id: number };
}

/**
 * Send a monitoring frame to the AI service.
 * Returns per-spot occupancy status and summary counts.
 */
export async function sendFrame(
  frameBlob: Blob,
  parkingSpotId: number,
): Promise<FrameResponse> {
  const form = new FormData();
  form.append("frame", frameBlob, "frame.jpg");
  form.append("parking_spot_id", String(parkingSpotId));

  const res = await fetch(`${BACKEND_URL}/frame`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Send frame failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as FrameResponse;
}
