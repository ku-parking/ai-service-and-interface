import { NextRequest, NextResponse } from "next/server";
import { db } from "~/db/drizzle";
import { parkingSpot, coorAbility } from "~/db/schema";
import { eq } from "drizzle-orm";
import { uploadImage } from "~/lib/s3";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const name = formData.get("name") as string | null;
    const imageFile = formData.get("image") as File | null;
    const spotsRaw = formData.get("spots") as string | null;

    if (!name || !imageFile || !spotsRaw) {
      return NextResponse.json(
        { error: "name, image, and spots are required" },
        { status: 400 },
      );
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
      })
      .returning();

    if (!inserted) {
      return NextResponse.json(
        { error: "Failed to insert parking spot" },
        { status: 500 },
      );
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

    return NextResponse.json({ id: inserted.id, name: inserted.name });
  } catch (err) {
    console.error("POST /api/parking-spots error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
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

    return NextResponse.json({ parkingSpots: results });
  } catch (err) {
    console.error("GET /api/parking-spots error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
