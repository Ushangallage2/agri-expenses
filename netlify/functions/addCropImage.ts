import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import { insertCropImage } from "./utils/cropImagesDb";
import { parsePlantNumber } from "./utils/cropNotesDb";
import { assertWritablePlant } from "./utils/plantMapDb";
import { invalidate } from "./utils/memoryCache";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { crop, imageData, mimeType, noteId, plantNumber } = JSON.parse(
    event.body || "{}"
  );

  if (!crop?.trim() || !imageData || typeof imageData !== "string") {
    return { statusCode: 400, body: "crop and imageData required" };
  }

  if (!imageData.startsWith("data:image/")) {
    return { statusCode: 400, body: "imageData must be a data URL" };
  }

  if (imageData.length > 1_500_000) {
    return { statusCode: 400, body: "Image too large (max ~1MB)" };
  }

  const plant = parsePlantNumber(plantNumber);

  try {
    if (plant != null) {
      const check = await assertWritablePlant(crop.trim(), plant);
      if (!check.ok) {
        return { statusCode: check.status, body: check.body };
      }
    }

    const row = await insertCropImage({
      crop: crop.trim(),
      imageData,
      mimeType: mimeType || "image/jpeg",
      noteId: typeof noteId === "number" ? noteId : null,
      plantNumber: plant,
    });
    invalidate("plantMap:");
    return { statusCode: 200, body: JSON.stringify(row) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAdmin(baseHandler);
