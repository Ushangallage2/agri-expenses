import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import { upsertCropFieldPhoto } from "./utils/cropFieldMapDb";
import { getCropPlantMeta } from "./utils/plantMapDb";
import { invalidate } from "./utils/memoryCache";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const crop = String(body.crop || "").trim();
  if (!crop) return { statusCode: 400, body: "crop required" };

  try {
    const meta = await getCropPlantMeta(crop);
    if (!meta) return { statusCode: 404, body: "Crop not found" };

    if (body.clear) {
      await upsertCropFieldPhoto(crop, null);
      invalidate("fieldMap:");
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    const imageData = String(body.imageData || "");
    if (!imageData.startsWith("data:image/")) {
      return { statusCode: 400, body: "imageData required" };
    }
    if (imageData.length > 1_600_000) {
      return { statusCode: 400, body: "Photo too large (max ~1MB)" };
    }

    await upsertCropFieldPhoto(crop, {
      imageData,
      width: Number(body.width) || 1600,
      height: Number(body.height) || 900,
    });
    invalidate("fieldMap:");
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAdmin(baseHandler);
