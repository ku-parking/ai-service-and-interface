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

/* ── API calls ──────────────────────────────────────────────────────── */

/**
 * Send the initial frame to the backend.
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
 * Save the finalised parking-spot definitions to the backend.
 */
export async function saveSpots(spots: EditableSpot[]): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/spots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spots }),
  });

  if (!res.ok) {
    throw new Error(`Save spots failed: ${res.status} ${res.statusText}`);
  }
}

/**
 * Send a monitoring frame to the backend.
 * Fire-and-forget – we don't need the response on the frontend.
 */
export async function sendFrame(frameBlob: Blob): Promise<void> {
  const form = new FormData();
  form.append("frame", frameBlob, "frame.jpg");

  const res = await fetch(`${BACKEND_URL}/frame`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Send frame failed: ${res.status} ${res.statusText}`);
  }
}
