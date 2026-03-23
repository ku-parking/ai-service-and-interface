import { describe, expect, it, vi } from "vitest";

describe("next rewrite integration contract", () => {
  it("rewrites /api/backend/* to BACKEND_URL", async () => {
    vi.resetModules();
    Object.assign(process.env, {
      NODE_ENV: "test",
      BACKEND_URL: "http://ai-service:8000",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres",
      S3_ENDPOINT: "http://localhost:4566",
      S3_BUCKET: "parking-spot-images",
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
    });

    const nextConfigModule = await import("../../next.config.js");
    const rewrites = await nextConfigModule.default.rewrites();

    expect(rewrites).toEqual([
      {
        source: "/api/backend/:path*",
        destination: "http://ai-service:8000/:path*",
      },
    ]);
  });
});
