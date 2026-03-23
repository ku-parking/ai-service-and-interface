import { beforeEach, describe, expect, it, vi } from "vitest";

import { initParkingSpots, sendFrame } from "~/lib/api";

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends init frame and returns JSON payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          spots: [{ name: "parking_spot", class: 0, confidence: 0.88, box: { x1: 1, y1: 1, x2: 2, y2: 2 } }],
        }),
        { status: 200 },
      ),
    );

    const result = await initParkingSpots(new Blob(["image"]));

    expect(result.spots).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/init",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on failed init response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 500, statusText: "Server Error" }));

    await expect(initParkingSpots(new Blob(["image"]))).rejects.toThrow(
      "Init failed: 500 Server Error",
    );
  });

  it("throws on failed frame response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 400, statusText: "Bad Request" }));

    await expect(sendFrame(new Blob(["image"]), 1)).rejects.toThrow(
      "Send frame failed: 400 Bad Request",
    );
  });
});
