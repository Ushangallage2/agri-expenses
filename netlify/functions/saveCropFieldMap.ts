import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  getCropMapView,
  normalizeLayer,
  parseCoord,
  upsertCropMapView,
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

  const lat = parseCoord(body.lat, -90, 90);
  const lng = parseCoord(body.lng, -180, 180);
  const zoomRaw = Number(body.zoom);
  const zoom =
    Number.isFinite(zoomRaw) && zoomRaw >= 2 && zoomRaw <= 22 ? zoomRaw : 17;

  if (lat == null || lng == null) {
    return { statusCode: 400, body: "lat and lng required" };
  }

  try {
    const meta = await getCropPlantMeta(crop);
    if (!meta) return { statusCode: 404, body: "Crop not found" };

    const prev = await getCropMapView(crop);
    const label =
      body.label === undefined
        ? prev?.label ?? null
        : String(body.label || "").trim() || null;

    await upsertCropMapView(crop, {
      lat,
      lng,
      zoom,
      layer: normalizeLayer(body.layer),
      label,
    });
    invalidate("fieldMap:");
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAdmin(baseHandler);
