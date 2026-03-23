type SpotInput = { x1: number; y1: number; x2: number; y2: number };

export function parseSpots(spotsRaw: string): SpotInput[] | null {
  try {
    const parsed: unknown = JSON.parse(spotsRaw);
    if (!Array.isArray(parsed)) return null;

    const spots: SpotInput[] = [];
    for (const spot of parsed) {
      if (
        typeof spot !== "object" ||
        spot === null ||
        !("x1" in spot) ||
        !("y1" in spot) ||
        !("x2" in spot) ||
        !("y2" in spot)
      ) {
        return null;
      }

      const x1 = Number((spot as Record<string, unknown>).x1);
      const y1 = Number((spot as Record<string, unknown>).y1);
      const x2 = Number((spot as Record<string, unknown>).x2);
      const y2 = Number((spot as Record<string, unknown>).y2);
      if ([x1, y1, x2, y2].some((value) => Number.isNaN(value))) return null;

      spots.push({ x1, y1, x2, y2 });
    }

    return spots;
  } catch {
    return null;
  }
}
