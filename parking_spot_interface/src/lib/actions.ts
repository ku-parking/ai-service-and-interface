"use server";

import { db } from "~/db/drizzle";
import { parkingSpot, coorAbility, issueReport } from "~/db/schema";
import { desc, eq } from "drizzle-orm";
import { uploadImage, downloadImage, deleteImage } from "~/lib/s3";
import { parseSpots } from "~/lib/spot-parser";

export async function saveParkingSpotAction(formData: FormData) {
  const name = formData.get("name") as string | null;
  const imageFile = formData.get("image") as File | null;
  const spotsRaw = formData.get("spots") as string | null;
  const latRaw = formData.get("lat") as string | null;
  const lngRaw = formData.get("lng") as string | null;

  if (!name || !imageFile || !spotsRaw || !latRaw || !lngRaw) {
    return { error: "name, image, spots, lat, and lng are required" };
  }

  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { error: "Invalid latitude or longitude" };
  }

  const spots = parseSpots(spotsRaw);
  if (!spots) {
    return { error: "Invalid spots payload" };
  }

  const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
  const key = `parking-spots/${Date.now()}-${name.replace(/\s+/g, "_")}.jpg`;
  const imageUrl = await uploadImage(key, imageBuffer);

  const [inserted] = await db
    .insert(parkingSpot)
    .values({
      name,
      totalAbility: spots.length,
      imageUrl,
      lat,
      long: lng,
    })
    .returning();

  if (!inserted) {
    return { error: "Failed to insert parking spot" };
  }

  const coordRows = spots.map((s) => ({
    parkingSpotId: inserted.id,
    x1: s.x1,
    y1: s.y1,
    x2: s.x2,
    y2: s.y2,
  }));

  if (coordRows.length > 0) {
    await db.insert(coorAbility).values(coordRows);
  }

  return { id: inserted.id, name: inserted.name };
}

export async function updateParkingSpotAction(formData: FormData) {
  const idRaw = formData.get("id") as string | null;
  const name = formData.get("name") as string | null;
  const imageFile = formData.get("image") as File | null;
  const spotsRaw = formData.get("spots") as string | null;
  const latRaw = formData.get("lat") as string | null;
  const lngRaw = formData.get("lng") as string | null;

  if (!idRaw || !name || !spotsRaw || !latRaw || !lngRaw) {
    return { error: "id, name, spots, lat, and lng are required" };
  }

  const id = Number(idRaw);
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { error: "Invalid latitude or longitude" };
  }

  const spots = parseSpots(spotsRaw);
  if (!spots) {
    return { error: "Invalid spots payload" };
  }

  const [existing] = await db
    .select()
    .from(parkingSpot)
    .where(eq(parkingSpot.id, id));

  if (!existing) return { error: "Parking spot not found" };

  let imageUrl = existing.imageUrl;

  if (imageFile && imageFile.size > 0) {
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const key = `parking-spots/${Date.now()}-${name.replace(/\s+/g, "_")}.jpg`;
    imageUrl = await uploadImage(key, imageBuffer);

    if (existing.imageUrl) {
      const bucket = process.env.S3_BUCKET ?? "parking-spot-images";
      const bucketIdx = existing.imageUrl.indexOf(`/${bucket}/`);
      if (bucketIdx !== -1) {
        const oldKey = existing.imageUrl.substring(bucketIdx + `/${bucket}/`.length);
        await deleteImage(oldKey).catch((cleanupErr: unknown) => {
          console.warn("Failed to delete old image", cleanupErr);
        });
      }
    }
  }

  await db
    .update(parkingSpot)
    .set({ name, totalAbility: spots.length, imageUrl, lat, long: lng })
    .where(eq(parkingSpot.id, id));

  await db.delete(coorAbility).where(eq(coorAbility.parkingSpotId, id));

  if (spots.length > 0) {
    await db.insert(coorAbility).values(
      spots.map((s) => ({ parkingSpotId: id, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 })),
    );
  }

  return { id, name };
}

export async function getParkingSpotsAction() {
  const spots = await db.select().from(parkingSpot);

  const results = await Promise.all(
    spots.map(async (spot) => {
      const coords = await db
        .select()
        .from(coorAbility)
        .where(eq(coorAbility.parkingSpotId, spot.id));
      return { ...spot, coordinates: coords };
    }),
  );

  return { parkingSpots: results };
}

export async function deleteParkingSpotAction(id: number) {
  try {
    const [spot] = await db
      .select()
      .from(parkingSpot)
      .where(eq(parkingSpot.id, id));

    if (!spot) return { error: "Parking spot not found" };

    await db.delete(coorAbility).where(eq(coorAbility.parkingSpotId, id));
    await db.delete(parkingSpot).where(eq(parkingSpot.id, id));

    if (spot.imageUrl) {
      const bucket = process.env.S3_BUCKET ?? "parking-spot-images";
      const bucketIdx = spot.imageUrl.indexOf(`/${bucket}/`);
      if (bucketIdx !== -1) {
        const key = spot.imageUrl.substring(bucketIdx + `/${bucket}/`.length);
        await deleteImage(key).catch((cleanupErr: unknown) => {
          console.warn("Failed to delete image", cleanupErr);
        });
      }
    }

    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to delete parking spot",
    };
  }
}

export async function getParkingSpotImageAction(imageUrl: string) {
  try {
    const bucket = process.env.S3_BUCKET ?? "parking-spot-images";
    const bucketIdx = imageUrl.indexOf(`/${bucket}/`);
    if (bucketIdx === -1) return { error: "Invalid image URL" };
    const key = imageUrl.substring(bucketIdx + `/${bucket}/`.length);
    const buffer = await downloadImage(key);
    return { base64: buffer.toString("base64") };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to download image",
    };
  }
}

type IssueReportRow = {
  id: number;
  parkingSpotId: number;
  parkingSpotName: string;
  reason: string | null;
  notes: string | null;
  status: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

export async function getIssueReportsAction() {
  const rows = await db
    .select({
      id: issueReport.id,
      parkingSpotId: issueReport.parkingSpotId,
      parkingSpotName: parkingSpot.name,
      reason: issueReport.reason,
      notes: issueReport.notes,
      status: issueReport.status,
      source: issueReport.source,
      createdAt: issueReport.createdAt,
      updatedAt: issueReport.updatedAt,
    })
    .from(issueReport)
    .innerJoin(parkingSpot, eq(issueReport.parkingSpotId, parkingSpot.id))
    .orderBy(desc(issueReport.createdAt));

  return { issueReports: rows as IssueReportRow[] };
}

export async function getRecentIssueReportsAction(limit = 5) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 5;
  const rows = await db
    .select({
      id: issueReport.id,
      parkingSpotId: issueReport.parkingSpotId,
      parkingSpotName: parkingSpot.name,
      reason: issueReport.reason,
      notes: issueReport.notes,
      status: issueReport.status,
      source: issueReport.source,
      createdAt: issueReport.createdAt,
      updatedAt: issueReport.updatedAt,
    })
    .from(issueReport)
    .innerJoin(parkingSpot, eq(issueReport.parkingSpotId, parkingSpot.id))
    .orderBy(desc(issueReport.createdAt))
    .limit(safeLimit);

  return { issueReports: rows as IssueReportRow[] };
}

export async function updateIssueReportStatusAction(id: number, status: "open" | "closed") {
  if (!Number.isInteger(id) || id <= 0) {
    return { error: "Invalid issue report id" };
  }

  const [updated] = await db
    .update(issueReport)
    .set({ status, updatedAt: new Date() })
    .where(eq(issueReport.id, id))
    .returning({ id: issueReport.id, status: issueReport.status });

  if (!updated) {
    return { error: "Issue report not found" };
  }

  return { success: true, issueReport: updated };
}
