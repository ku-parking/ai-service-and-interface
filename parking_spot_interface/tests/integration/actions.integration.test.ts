import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockDelete = vi.fn();
const mockUpdate = vi.fn();
const mockUploadImage = vi.fn();
const mockDownloadImage = vi.fn();
const mockDeleteImage = vi.fn();

vi.mock("~/db/drizzle", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    delete: mockDelete,
    update: mockUpdate,
  },
}));

vi.mock("~/lib/s3", () => ({
  uploadImage: mockUploadImage,
  downloadImage: mockDownloadImage,
  deleteImage: mockDeleteImage,
}));

describe("actions integration seams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses spot payload and persists parking spot + coordinates", async () => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      BACKEND_URL: "http://localhost:8000",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres",
      S3_ENDPOINT: "http://localhost:4566",
      S3_BUCKET: "parking-spot-images",
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
    });
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const insertReturning = vi.fn().mockResolvedValue([{ id: 77, name: "A lot" }]);
    mockInsert
      .mockReturnValueOnce({ values: vi.fn().mockReturnValue({ returning: insertReturning }) })
      .mockReturnValueOnce({ values: insertValues });
    mockUploadImage.mockResolvedValue("http://localhost:4566/parking-spot-images/img.jpg");

    const { parseSpots } = await import("~/lib/spot-parser");
    const { saveParkingSpotAction } = await import("~/lib/actions");

    expect(parseSpots('[{"x1":1,"y1":2,"x2":3,"y2":4}]')).toEqual([
      { x1: 1, y1: 2, x2: 3, y2: 4 },
    ]);

    const form = new FormData();
    form.set("name", "A lot");
    form.set("lat", "13.7");
    form.set("lng", "100.5");
    form.set("spots", '[{"x1":1,"y1":2,"x2":3,"y2":4}]');
    form.set("image", new File([Buffer.from("abc")], "test.jpg", { type: "image/jpeg" }));

    const result = await saveParkingSpotAction(form);

    expect(result).toEqual({ id: 77, name: "A lot" });
    expect(mockUploadImage).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(insertValues).toHaveBeenCalledOnce();
  });

  it("downloads image payload when URL is valid", async () => {
    mockDownloadImage.mockResolvedValue(Buffer.from("hello"));
    const { getParkingSpotImageAction } = await import("~/lib/actions");

    const result = await getParkingSpotImageAction(
      "http://localhost:4566/parking-spot-images/path/to-file.jpg",
    );

    expect(mockDownloadImage).toHaveBeenCalledWith("path/to-file.jpg");
    expect(result).toEqual({ base64: Buffer.from("hello").toString("base64") });
  });
});
