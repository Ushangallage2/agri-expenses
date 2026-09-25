import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import { upsertPlantPositions } from "./utils/cropFieldMapDb";
import { getCropPlantMeta } from "./utils/plantMapDb";
import { invalidate } from "./utils/memoryCache";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const crop = String(body.crop || "").trim();
  const positions = Array.isArray(body.positions) ? body.positions : [];
  if (!crop) return { statusCode: 400, body: "crop required" };
  if (!positions.length) {
    return { statusCode: 400, body: "positions required" };
  }
  if (positions.length > 2000) {
    return { statusCode: 400, body: "Too many positions" };
  }

  try {
    const meta = await getCropPlantMeta(crop);
    if (!meta) return { statusCode: 404, body: "Crop not found" };

    await upsertPlantPositions(
      crop,
      positions.map((p: any) => ({
        number: Number(p.number),
        lat: p.lat == null ? null : Number(p.lat),
        lng: p.lng == null ? null : Number(p.lng),
        photoX: p.photoX == null ? null : Number(p.photoX),
        photoY: p.photoY == null ? null : Number(p.photoY),
      }))
    );
    invalidate("fieldMap:");
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAdmin(baseHandler);
