"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  initParkingSpots,
  saveParkingSpot,
  sendFrame,
  type EditableSpot,
  type FrameResponse,
} from "~/lib/api";

/* ── Types ──────────────────────────────────────────────────────────── */

type Phase = "setup" | "initializing" | "editing" | "monitoring";
type CameraSource = "webcam" | "ip" | "screen";

interface CropRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

type EditAction =
  | { kind: "none" }
  | {
      kind: "move";
      spotId: string;
      startX: number;
      startY: number;
      origBox: EditableSpot["box"];
    }
  | {
      kind: "resize";
      spotId: string;
      handle: ResizeHandle;
      startX: number;
      startY: number;
      origBox: EditableSpot["box"];
    }
  | {
      kind: "draw";
      startX: number;
      startY: number;
      curX: number;
      curY: number;
    };

type ResizeHandle = "tl" | "tr" | "bl" | "br";

/* ── Helpers ────────────────────────────────────────────────────────── */

let _nextId = 1;
function newSpotId(): string {
  return `spot-${_nextId++}`;
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

const HANDLE_SIZE = 10;

function regionFromCorners(
  a: { x: number; y: number },
  b: { x: number; y: number },
): CropRegion {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

/* ── Component ──────────────────────────────────────────────────────── */

export default function ParkingMonitor() {
  /* refs */
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* phase & camera */
  const [phase, setPhase] = useState<Phase>("setup");
  const [cameraSource, setCameraSource] = useState<CameraSource>("webcam");
  const [ipUrl, setIpUrl] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [fps, setFps] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [initPreview, setInitPreview] = useState<string | null>(null);
  const [framesSent, setFramesSent] = useState(0);

  /* crop */
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState<CropRegion | null>(null);
  const [cropDragStart, setCropDragStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [cropDragCur, setCropDragCur] = useState<{
    x: number;
    y: number;
  } | null>(null);

  /* spots & editing */
  const [spots, setSpots] = useState<EditableSpot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [editAction, setEditAction] = useState<EditAction>({ kind: "none" });

  /* save & monitoring */
  const [areaName, setAreaName] = useState("");
  const [savedParkingSpotId, setSavedParkingSpotId] = useState<number | null>(null);
  const [occupancyData, setOccupancyData] = useState<FrameResponse | null>(null);
  const initFrameBlobRef = useRef<Blob | null>(null);
  const [saving, setSaving] = useState(false);

  /* ── Derived ──────────────────────────────────────────────────────── */

  const nativeW = videoRef.current?.videoWidth ?? 1280;
  const nativeH = videoRef.current?.videoHeight ?? 720;

  const cropDisplay =
    cropDragStart && cropDragCur
      ? regionFromCorners(cropDragStart, cropDragCur)
      : crop;

  const drawPreview: CropRegion | null =
    editAction.kind === "draw"
      ? regionFromCorners(
          { x: editAction.startX, y: editAction.startY },
          { x: editAction.curX, y: editAction.curY },
        )
      : null;

  /* ── Coordinate mapping ───────────────────────────────────────────── */

  const toVideoCoords = useCallback((e: ReactMouseEvent) => {
    const c = containerRef.current;
    const v = videoRef.current;
    if (!c || !v) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    return {
      x: Math.round(
        ((e.clientX - rect.left) / rect.width) * (v.videoWidth || 1280),
      ),
      y: Math.round(
        ((e.clientY - rect.top) / rect.height) * (v.videoHeight || 720),
      ),
    };
  }, []);

  /* ── Camera helpers ───────────────────────────────────────────────── */

  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraReady(true);
      setError(null);
    } catch (err) {
      setError("Could not access webcam. Check permissions.");
      console.error(err);
    }
  }, []);

  const startScreenCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1920, height: 1080 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setCameraReady(false);
        streamRef.current = null;
      });
      setCameraReady(true);
      setError(null);
    } catch (err) {
      setError("Screen capture was cancelled or denied.");
      console.error(err);
    }
  }, []);

  const startIpCamera = useCallback(() => {
    if (!ipUrl) {
      setError("Enter a camera URL.");
      return;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = ipUrl;
    }
    setCameraReady(true);
    setError(null);
  }, [ipUrl]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = "";
    }
    setCameraReady(false);
  }, []);

  const connectCamera = useCallback(() => {
    if (cameraSource === "webcam") return startWebcam();
    if (cameraSource === "screen") return startScreenCapture();
    startIpCamera();
    return Promise.resolve();
  }, [cameraSource, startWebcam, startScreenCapture, startIpCamera]);

  /* ── Frame capture (respects crop) ────────────────────────────────── */

  const captureFrame = useCallback((): Promise<Blob | null> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return Promise.resolve(null);
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;

    if (crop && crop.w > 10 && crop.h > 10) {
      const sx = clamp(crop.x, 0, vw);
      const sy = clamp(crop.y, 0, vh);
      const sw = Math.min(crop.w, vw - sx);
      const sh = Math.min(crop.h, vh - sy);
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return Promise.resolve(null);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    } else {
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return Promise.resolve(null);
      ctx.drawImage(video, 0, 0, vw, vh);
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
    });
  }, [crop]);

  /* ── Phase 1: Init ────────────────────────────────────────────────── */

  const handleInit = useCallback(async () => {
    setError(null);
    setPhase("initializing");
    try {
      const blob = await captureFrame();
      if (!blob) {
        setError("Failed to capture frame.");
        setPhase("setup");
        return;
      }
      initFrameBlobRef.current = blob;
      setInitPreview(URL.createObjectURL(blob));
      const res = await initParkingSpots(blob);
      const editableSpots: EditableSpot[] = res.spots.map((d) => ({
        id: newSpotId(),
        box: { ...d.box },
        confidence: d.confidence,
      }));
      setSpots(editableSpots);
      setPhase("editing");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Initialization failed.");
      setPhase("setup");
    }
  }, [captureFrame]);

  /* ── Phase 2: Editing helpers ─────────────────────────────────────── */

  const deleteSpot = useCallback(
    (id: string) => {
      setSpots((prev) => prev.filter((s) => s.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId],
  );

  const updateSpotBox = useCallback(
    (id: string, box: EditableSpot["box"]) => {
      setSpots((prev) =>
        prev.map((s) => (s.id === id ? { ...s, box } : s)),
      );
    },
    [],
  );

  /* ── Phase 3: Start monitoring ────────────────────────────────────── */

  const handleConfirmSpots = useCallback(async () => {
    setError(null);
    if (!areaName.trim()) {
      setError("Please enter a name for this parking area.");
      return;
    }
    if (!initFrameBlobRef.current) {
      setError("No captured frame available. Please re-initialize.");
      return;
    }
    setSaving(true);
    try {
      const boxes = spots.map((s) => s.box);
      const result = await saveParkingSpot(areaName.trim(), initFrameBlobRef.current, boxes);
      setSavedParkingSpotId(result.id);
      setPhase("monitoring");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to save parking spot.");
    } finally {
      setSaving(false);
    }
  }, [spots, areaName]);

  /* ── Phase 4: Continuous frame sending ────────────────────────────── */

  const doSendFrame = useCallback(async () => {
    if (savedParkingSpotId == null) return;
    try {
      const blob = await captureFrame();
      if (!blob) return;
      const result = await sendFrame(blob, savedParkingSpotId);
      setOccupancyData(result);
      setFramesSent((c) => c + 1);
    } catch (err) {
      console.error("Send frame error:", err);
    }
  }, [captureFrame, savedParkingSpotId]);

  useEffect(() => {
    if (phase !== "monitoring") return;
    const delayMs = Math.max(100, Math.round(1000 / fps));
    intervalRef.current = setInterval(() => void doSendFrame(), delayMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase, fps, doSendFrame]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [stopCamera]);

  const handleStop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase("editing");
    setFramesSent(0);
  }, []);

  const handleReset = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase("setup");
    setSpots([]);
    setSelectedId(null);
    setFramesSent(0);
    setInitPreview(null);
    setAreaName("");
    setSavedParkingSpotId(null);
    setOccupancyData(null);
    initFrameBlobRef.current = null;
  }, []);

  /* ── Mouse handlers: crop (setup phase) ───────────────────────────── */

  const onCropDown = useCallback(
    (e: ReactMouseEvent) => {
      if (!cropMode) return;
      e.preventDefault();
      const pt = toVideoCoords(e);
      setCropDragStart(pt);
      setCropDragCur(pt);
    },
    [cropMode, toVideoCoords],
  );

  const onCropMove = useCallback(
    (e: ReactMouseEvent) => {
      if (!cropMode || !cropDragStart) return;
      e.preventDefault();
      setCropDragCur(toVideoCoords(e));
    },
    [cropMode, cropDragStart, toVideoCoords],
  );

  const onCropUp = useCallback(() => {
    if (!cropMode || !cropDragStart || !cropDragCur) return;
    const r = regionFromCorners(cropDragStart, cropDragCur);
    if (r.w > 10 && r.h > 10) setCrop(r);
    setCropDragStart(null);
    setCropDragCur(null);
    setCropMode(false);
  }, [cropMode, cropDragStart, cropDragCur]);

  /* ── Mouse handlers: editing phase ────────────────────────────────── */

  const hitTest = useCallback(
    (
      vx: number,
      vy: number,
    ): { spotId: string; handle?: ResizeHandle } | null => {
      if (selectedId) {
        const sel = spots.find((s) => s.id === selectedId);
        if (sel) {
          const hs = HANDLE_SIZE;
          const corners: [ResizeHandle, number, number][] = [
            ["tl", sel.box.x1, sel.box.y1],
            ["tr", sel.box.x2, sel.box.y1],
            ["bl", sel.box.x1, sel.box.y2],
            ["br", sel.box.x2, sel.box.y2],
          ];
          for (const [h, cx, cy] of corners) {
            if (Math.abs(vx - cx) <= hs && Math.abs(vy - cy) <= hs) {
              return { spotId: selectedId, handle: h };
            }
          }
        }
      }
      for (let i = spots.length - 1; i >= 0; i--) {
        const s = spots[i]!;
        if (
          vx >= s.box.x1 &&
          vx <= s.box.x2 &&
          vy >= s.box.y1 &&
          vy <= s.box.y2
        ) {
          return { spotId: s.id };
        }
      }
      return null;
    },
    [spots, selectedId],
  );

  const onEditDown = useCallback(
    (e: ReactMouseEvent) => {
      if (phase !== "editing") return;
      e.preventDefault();
      const { x, y } = toVideoCoords(e);

      if (drawMode) {
        setEditAction({
          kind: "draw",
          startX: x,
          startY: y,
          curX: x,
          curY: y,
        });
        return;
      }

      const hit = hitTest(x, y);
      if (!hit) {
        setSelectedId(null);
        return;
      }

      setSelectedId(hit.spotId);
      const spot = spots.find((s) => s.id === hit.spotId);
      if (!spot) return;

      if (hit.handle) {
        setEditAction({
          kind: "resize",
          spotId: hit.spotId,
          handle: hit.handle,
          startX: x,
          startY: y,
          origBox: { ...spot.box },
        });
      } else {
        setEditAction({
          kind: "move",
          spotId: hit.spotId,
          startX: x,
          startY: y,
          origBox: { ...spot.box },
        });
      }
    },
    [phase, drawMode, toVideoCoords, hitTest, spots],
  );

  const onEditMove = useCallback(
    (e: ReactMouseEvent) => {
      if (phase !== "editing" || editAction.kind === "none") return;
      e.preventDefault();
      const { x, y } = toVideoCoords(e);

      if (editAction.kind === "draw") {
        setEditAction({ ...editAction, curX: x, curY: y });
        return;
      }

      const dx = x - editAction.startX;
      const dy = y - editAction.startY;
      const ob = editAction.origBox;

      if (editAction.kind === "move") {
        const bw = ob.x2 - ob.x1;
        const bh = ob.y2 - ob.y1;
        const nx1 = clamp(ob.x1 + dx, 0, nativeW - bw);
        const ny1 = clamp(ob.y1 + dy, 0, nativeH - bh);
        updateSpotBox(editAction.spotId, {
          x1: nx1,
          y1: ny1,
          x2: nx1 + bw,
          y2: ny1 + bh,
        });
      }

      if (editAction.kind === "resize") {
        const box = { ...ob };
        const h = editAction.handle;
        if (h === "tl" || h === "bl")
          box.x1 = clamp(ob.x1 + dx, 0, ob.x2 - 20);
        if (h === "tr" || h === "br")
          box.x2 = clamp(ob.x2 + dx, ob.x1 + 20, nativeW);
        if (h === "tl" || h === "tr")
          box.y1 = clamp(ob.y1 + dy, 0, ob.y2 - 20);
        if (h === "bl" || h === "br")
          box.y2 = clamp(ob.y2 + dy, ob.y1 + 20, nativeH);
        updateSpotBox(editAction.spotId, box);
      }
    },
    [phase, editAction, toVideoCoords, nativeW, nativeH, updateSpotBox],
  );

  const onEditUp = useCallback(() => {
    if (editAction.kind === "draw") {
      const r = regionFromCorners(
        { x: editAction.startX, y: editAction.startY },
        { x: editAction.curX, y: editAction.curY },
      );
      if (r.w > 15 && r.h > 15) {
        const id = newSpotId();
        setSpots((prev) => [
          ...prev,
          {
            id,
            box: { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y + r.h },
          },
        ]);
        setSelectedId(id);
      }
      setDrawMode(false);
    }
    setEditAction({ kind: "none" });
  }, [editAction]);

  /* ── Keyboard: delete selected spot ───────────────────────────────── */

  useEffect(() => {
    if (phase !== "editing" || !selectedId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        deleteSpot(selectedId);
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setDrawMode(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, selectedId, deleteSpot]);

  /* ── Shared mouse dispatcher ──────────────────────────────────────── */

  const onMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (phase === "setup" && cropMode) return onCropDown(e);
      if (phase === "editing") return onEditDown(e);
    },
    [phase, cropMode, onCropDown, onEditDown],
  );

  const onMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      if (phase === "setup" && cropMode) return onCropMove(e);
      if (phase === "editing") return onEditMove(e);
    },
    [phase, cropMode, onCropMove, onEditMove],
  );

  const onMouseUp = useCallback(() => {
    if (phase === "setup" && cropMode) return onCropUp();
    if (phase === "editing") return onEditUp();
  }, [phase, cropMode, onCropUp, onEditUp]);

  /* ── Render helper: spot overlay ──────────────────────────────────── */

  function renderSpotOverlay(interactive: boolean) {
    const occupancyMap = new Map(
      occupancyData?.spots.map((s) => [s.id, s.occupied]) ?? [],
    );

    return (
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${nativeW} ${nativeH}`}
        preserveAspectRatio="none"
      >
        {spots.map((spot, idx) => {
          const bw = spot.box.x2 - spot.box.x1;
          const bh = spot.box.y2 - spot.box.y1;
          const isSel = interactive && spot.id === selectedId;
          const isOccupied = occupancyMap.get(idx + 1);

          let fillColor = "rgba(34,197,94,0.2)";
          let strokeColor = "#22c55e";
          if (isSel) {
            fillColor = "rgba(59,130,246,0.25)";
            strokeColor = "#3b82f6";
          } else if (isMonitoring && isOccupied === true) {
            fillColor = "rgba(239,68,68,0.3)";
            strokeColor = "#ef4444";
          } else if (isMonitoring && isOccupied === false) {
            fillColor = "rgba(34,197,94,0.3)";
            strokeColor = "#22c55e";
          }

          return (
            <g key={spot.id}>
              <rect
                x={spot.box.x1}
                y={spot.box.y1}
                width={bw}
                height={bh}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={isSel ? 3 : 2}
                rx={4}
              />
              <text
                x={spot.box.x1 + 6}
                y={spot.box.y1 + 18}
                fill="white"
                fontSize={14}
                fontWeight="bold"
                style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
              >
                #{idx + 1}
                {isMonitoring && isOccupied !== undefined
                  ? isOccupied
                    ? " (taken)"
                    : " (free)"
                  : ""}
              </text>
              {isSel &&
                (
                  [
                    [spot.box.x1, spot.box.y1],
                    [spot.box.x2, spot.box.y1],
                    [spot.box.x1, spot.box.y2],
                    [spot.box.x2, spot.box.y2],
                  ] as const
                ).map(([cx, cy], hi) => (
                  <rect
                    key={hi}
                    x={cx - HANDLE_SIZE / 2}
                    y={cy - HANDLE_SIZE / 2}
                    width={HANDLE_SIZE}
                    height={HANDLE_SIZE}
                    fill="white"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    rx={2}
                  />
                ))}
            </g>
          );
        })}

        {drawPreview && drawPreview.w > 0 && drawPreview.h > 0 && (
          <rect
            x={drawPreview.x}
            y={drawPreview.y}
            width={drawPreview.w}
            height={drawPreview.h}
            fill="rgba(59,130,246,0.15)"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="8 4"
            rx={4}
          />
        )}
      </svg>
    );
  }

  /* ── Render ───────────────────────────────────────────────────────── */

  const isEditing = phase === "editing";
  const isMonitoring = phase === "monitoring";
  const cursorClass = cropMode
    ? "cursor-crosshair border-amber-500"
    : isEditing && drawMode
      ? "cursor-crosshair border-blue-500"
      : isEditing
        ? "cursor-default border-blue-500"
        : "border-gray-800";

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-gray-100">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
            <svg
              className="h-6 w-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            KU Parking Spot Monitor
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              isMonitoring
                ? "animate-pulse bg-green-400"
                : phase === "initializing"
                  ? "animate-pulse bg-yellow-400"
                  : isEditing
                    ? "bg-blue-400"
                    : "bg-gray-500"
            }`}
          />
          <span className="text-sm font-medium text-gray-400">
            {isMonitoring
              ? "Live Streaming"
              : phase === "initializing"
                ? "Initializing..."
                : isEditing
                  ? "Editing Spots"
                  : "Setup"}
          </span>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-6 lg:flex-row">
        {/* ── Left: Video ───────────────────────────────────────────── */}
        <section className="flex flex-1 flex-col gap-4">
          <div
            ref={containerRef}
            className={`relative overflow-hidden rounded-xl border bg-black ${cursorClass}`}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-auto w-full"
              onLoadedMetadata={() => setCameraReady(true)}
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Crop overlay (setup) */}
            {cropDisplay &&
              cropDisplay.w > 0 &&
              cropDisplay.h > 0 &&
              phase === "setup" && (
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${nativeW} ${nativeH}`}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <mask id="crop-mask">
                      <rect width={nativeW} height={nativeH} fill="white" />
                      <rect
                        x={cropDisplay.x}
                        y={cropDisplay.y}
                        width={cropDisplay.w}
                        height={cropDisplay.h}
                        fill="black"
                      />
                    </mask>
                  </defs>
                  <rect
                    width={nativeW}
                    height={nativeH}
                    fill="rgba(0,0,0,0.55)"
                    mask="url(#crop-mask)"
                  />
                  <rect
                    x={cropDisplay.x}
                    y={cropDisplay.y}
                    width={cropDisplay.w}
                    height={cropDisplay.h}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    strokeDasharray="12 6"
                    rx={4}
                  />
                  <text
                    x={cropDisplay.x + cropDisplay.w / 2}
                    y={cropDisplay.y - 10}
                    textAnchor="middle"
                    fill="#f59e0b"
                    fontSize={16}
                    fontWeight="bold"
                  >
                    {cropDisplay.w} x {cropDisplay.h}
                  </text>
                </svg>
              )}

            {/* Banners */}
            {cropMode && (
              <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg bg-amber-500/90 px-4 py-2 text-sm font-semibold text-black shadow-lg">
                Click and drag to select crop area
              </div>
            )}
            {isEditing && drawMode && (
              <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg bg-blue-500/90 px-4 py-2 text-sm font-semibold text-white shadow-lg">
                Click and drag to draw a new parking spot
              </div>
            )}

            {/* Spot overlays */}
            {(isEditing || isMonitoring) &&
              spots.length > 0 &&
              renderSpotOverlay(isEditing)}

            {/* Empty state */}
            {!cameraReady && phase === "setup" && (
              <div className="flex h-80 items-center justify-center text-gray-500">
                <p className="text-lg">Connect a camera to begin</p>
              </div>
            )}
          </div>

          {/* Camera controls (setup only) */}
          {phase === "setup" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
                Camera Source
              </h2>
              <div className="mb-4 flex flex-wrap gap-2">
                {(
                  [
                    ["webcam", "Webcam"],
                    ["screen", "Screen Capture"],
                    ["ip", "IP Camera / URL"],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      cameraSource === v
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                    onClick={() => {
                      setCameraSource(v);
                      stopCamera();
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {cameraSource === "ip" && (
                <input
                  type="text"
                  placeholder="e.g. http://192.168.1.100:8080/video"
                  value={ipUrl}
                  onChange={(e) => setIpUrl(e.target.value)}
                  className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
                  onClick={() => void connectCamera()}
                  disabled={cameraReady}
                >
                  {cameraReady ? "Connected" : "Connect"}
                </button>
                {cameraReady && (
                  <button
                    className="rounded-lg bg-gray-700 px-5 py-2.5 text-sm font-medium text-gray-200 transition hover:bg-gray-600"
                    onClick={stopCamera}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Crop controls (setup only) */}
          {cameraReady && phase === "setup" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
                Crop Area
              </h2>
              <p className="mb-4 text-sm text-gray-400">
                Optionally select a region to send to the backend.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    cropMode
                      ? "bg-amber-500 text-black"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  }`}
                  onClick={() => setCropMode(!cropMode)}
                >
                  {cropMode ? "Drawing..." : "Select Crop Region"}
                </button>
                {crop && (
                  <>
                    <button
                      className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-700"
                      onClick={() => {
                        setCrop(null);
                        setCropMode(false);
                      }}
                    >
                      Clear Crop
                    </button>
                    <span className="flex items-center text-xs text-gray-500">
                      {crop.w} x {crop.h} px
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Right sidebar ─────────────────────────────────────────── */}
        <aside className="flex w-full flex-col gap-4 lg:w-80">
          {/* ── Setup panel ─────────────────────────────────────────── */}
          {phase === "setup" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
                Initialize
              </h2>
              <p className="mb-4 text-sm text-gray-400">
                Point the camera at the parking area, optionally crop, then
                capture a frame to detect parking spots.
              </p>
              <button
                className="w-full rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!cameraReady}
                onClick={() => void handleInit()}
              >
                Capture &amp; Initialize
              </button>
            </div>
          )}

          {/* ── Initializing spinner ────────────────────────────────── */}
          {phase === "initializing" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-blue-400" />
                <p className="text-sm text-gray-400">
                  Detecting parking spots...
                </p>
              </div>
            </div>
          )}

          {/* ── Editing panel ───────────────────────────────────────── */}
          {isEditing && (
            <div className="rounded-xl border border-blue-800 bg-gray-900 p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-blue-400">
                Edit Parking Spots
              </h2>
              <p className="mb-4 text-sm text-gray-400">
                Click a spot to select. Drag to move, drag corners to resize.
                Press{" "}
                <kbd className="rounded bg-gray-700 px-1.5 py-0.5 text-xs">
                  Delete
                </kbd>{" "}
                to remove.
              </p>

              <label className="mb-1 block text-xs font-medium text-gray-500">
                Parking Area Name
              </label>
              <input
                type="text"
                placeholder="e.g. Building A - Level 1"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />

              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    drawMode
                      ? "bg-blue-500 text-white"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  }`}
                  onClick={() => {
                    setDrawMode(!drawMode);
                    setSelectedId(null);
                  }}
                >
                  {drawMode ? "Drawing..." : "+ Add Spot"}
                </button>
                {selectedId && (
                  <button
                    className="rounded-lg bg-red-600/80 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
                    onClick={() => deleteSpot(selectedId)}
                  >
                    Delete Selected
                  </button>
                )}
              </div>

              <label className="mb-1 block text-xs font-medium text-gray-500">
                Stream Rate: {fps} fps
              </label>
              <input
                type="range"
                min={0.5}
                max={5}
                step={0.5}
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="mb-5 w-full accent-blue-500"
              />

              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                  disabled={spots.length === 0 || !areaName.trim() || saving}
                  onClick={() => void handleConfirmSpots()}
                >
                  {saving ? "Saving..." : "Save & Start Monitoring"}
                </button>
                <button
                  className="rounded-lg bg-gray-700 px-4 py-3 text-sm font-medium text-gray-200 transition hover:bg-gray-600"
                  onClick={handleReset}
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {/* ── Monitoring panel ────────────────────────────────────── */}
          {isMonitoring && (
            <div className="rounded-xl border border-green-800 bg-gray-900 p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-green-400">
                Monitoring: {areaName}
              </h2>
              {savedParkingSpotId && (
                <p className="mb-4 text-xs text-gray-500">
                  Parking Area ID: {savedParkingSpotId}
                </p>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-800 p-3 text-center">
                  <p className="text-2xl font-bold text-green-400">
                    {occupancyData?.available ?? spots.length}
                  </p>
                  <p className="text-xs text-gray-400">Available</p>
                </div>
                <div className="rounded-lg bg-gray-800 p-3 text-center">
                  <p className="text-2xl font-bold text-red-400">
                    {occupancyData?.occupied ?? 0}
                  </p>
                  <p className="text-xs text-gray-400">Occupied</p>
                </div>
                <div className="rounded-lg bg-gray-800 p-3 text-center">
                  <p className="text-2xl font-bold text-blue-400">
                    {occupancyData?.total ?? spots.length}
                  </p>
                  <p className="text-xs text-gray-400">Total Spots</p>
                </div>
                <div className="rounded-lg bg-gray-800 p-3 text-center">
                  <p className="text-2xl font-bold text-gray-300">
                    {framesSent}
                  </p>
                  <p className="text-xs text-gray-400">Frames Sent</p>
                </div>
              </div>

              <label className="mb-1 block text-xs font-medium text-gray-500">
                Stream Rate: {fps} fps
              </label>
              <input
                type="range"
                min={0.5}
                max={5}
                step={0.5}
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="mb-5 w-full accent-blue-500"
              />

              {crop && (
                <p className="mb-4 text-xs text-gray-500">
                  Crop: {crop.w}x{crop.h} at ({crop.x}, {crop.y})
                </p>
              )}

              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-lg bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
                  onClick={handleStop}
                >
                  Edit Spots
                </button>
                <button
                  className="rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-red-500"
                  onClick={handleReset}
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {/* Init preview */}
          {initPreview && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
                Init Frame {crop ? "(Cropped)" : ""}
              </h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={initPreview}
                alt="Init frame"
                className="w-full rounded-lg"
              />
            </div>
          )}

          {/* Spot list */}
          {spots.length > 0 && (isEditing || isMonitoring) && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
                Spots ({spots.length})
              </h3>
              <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                {spots.map((spot, idx) => (
                  <li
                    key={spot.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 transition ${
                      spot.id === selectedId
                        ? "bg-blue-600/20 ring-1 ring-blue-500"
                        : "bg-gray-800"
                    }`}
                    onClick={() => isEditing && setSelectedId(spot.id)}
                    role={isEditing ? "button" : undefined}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        Spot #{idx + 1}
                      </span>
                      <span className="text-xs text-gray-500">
                        {Math.round(spot.box.x2 - spot.box.x1)} x{" "}
                        {Math.round(spot.box.y2 - spot.box.y1)} px
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {spot.confidence != null && (
                        <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-400">
                          {(spot.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                      {isEditing && (
                        <button
                          className="rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSpot(spot.id);
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="rounded-xl border border-red-800 bg-red-950/50 p-4">
              <p className="text-sm text-red-300">{error}</p>
              <button
                className="mt-2 text-xs text-red-400 underline"
                onClick={() => setError(null)}
              >
                Dismiss
              </button>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
