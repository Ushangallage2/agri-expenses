import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  parsePlantLayout,
  savePlantLayout,
} from "./utils/cropFieldMapDb";
import { getCropPlantMeta } from "./utils/plantMapDb";
import { invalidate } from "./utils/memoryCache";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const crop = String(body.crop || "").trim();
  if (!crop) return { statusCode: 400, body: "crop required" };

  const layout = parsePlantLayout(body.layout);
  if (!layout) {
    return { statusCode: 400, body: "A land outline needs at least 3 corners" };
  }
  if (layout.tiles.length > 2000) {
    return { statusCode: 400, body: "Too many plant positions" };
  }

  try {
    const meta = await getCropPlantMeta(crop);
    if (!meta) return { statusCode: 404, body: "Crop not found" };

    await savePlantLayout(crop, layout);
    invalidate("plantMap:");
    invalidate("fieldMap:");
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAdmin(baseHandler);
