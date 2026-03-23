import { describe, expect, it, vi } from "vitest";

const REQUIRED_ENV = {
  NODE_ENV: "test",
  BACKEND_URL: "http://localhost:8000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres",
  S3_ENDPOINT: "http://localhost:4566",
  S3_BUCKET: "parking-spot-images",
  AWS_ACCESS_KEY_ID: "test",
  AWS_SECRET_ACCESS_KEY: "test",
};

describe("env validation", () => {
  it("accepts valid required environment variables", async () => {
    vi.resetModules();
    Object.assign(process.env, REQUIRED_ENV);
    const envModule = await import("~/env");

    expect(envModule.env.BACKEND_URL).toBe(REQUIRED_ENV.BACKEND_URL);
    expect(envModule.env.S3_BUCKET).toBe(REQUIRED_ENV.S3_BUCKET);
  });

  it("throws when required environment is missing", async () => {
    vi.resetModules();
    Object.assign(process.env, REQUIRED_ENV);
    delete process.env.BACKEND_URL;

    await expect(import("~/env")).rejects.toThrow();
  });
});
