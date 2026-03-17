"use server";

import { db } from "~/db/drizzle";
import { parkingSpot, coorAbility } from "~/db/schema";
import { eq } from "drizzle-orm";
import { uploadImage, downloadImage, deleteImage } from "~/lib/s3";

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

  const spots: { x1: number; y1: number; x2: number; y2: number }[] =
    JSON.parse(spotsRaw);

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

  const spots: { x1: number; y1: number; x2: number; y2: number }[] =
    JSON.parse(spotsRaw);

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
        await deleteImage(oldKey).catch(() => {});
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
        await deleteImage(key).catch(() => {});
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
