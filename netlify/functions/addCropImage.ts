import type { Handler } from "@netlify/functions";
import { requireAuth } from "../../src/utils/requireAuth";
import { insertCropImage } from "./utils/cropImagesDb";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { crop, imageData, mimeType, noteId } = JSON.parse(event.body || "{}");

  if (!crop?.trim() || !imageData || typeof imageData !== "string") {
    return { statusCode: 400, body: "crop and imageData required" };
  }

  if (!imageData.startsWith("data:image/")) {
    return { statusCode: 400, body: "imageData must be a data URL" };
  }

  if (imageData.length > 1_500_000) {
    return { statusCode: 400, body: "Image too large (max ~1MB)" };
  }

  try {
    const row = await insertCropImage({
      crop: crop.trim(),
      imageData,
      mimeType: mimeType || "image/jpeg",
      noteId: typeof noteId === "number" ? noteId : null,
    });
    return { statusCode: 200, body: JSON.stringify(row) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAuth(baseHandler);
