import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import { upsertCropFertilizerNote } from "./utils/cropFertilizerNotesDb";
import { invalidate } from "./utils/memoryCache";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const cropName = String(body.cropName || body.crop || "").trim();
    const fertilizerName = String(
      body.fertilizerName || body.fertilizer || ""
    ).trim();
    const note = String(body.note ?? "");

    if (!cropName || !fertilizerName) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "cropName and fertilizerName are required",
        }),
      };
    }

    const saved = await upsertCropFertilizerNote(
      cropName,
      fertilizerName,
      note
    );
    invalidate("fertilizer:");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saved),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" }),
    };
  }
};

export const handler = requireAdmin(baseHandler);
