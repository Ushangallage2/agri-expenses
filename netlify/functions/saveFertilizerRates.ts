import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import { saveFertilizerRateConfig } from "./utils/fertilizerRateConfigDb";
import { invalidate } from "./utils/memoryCache";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const cropName = String(body.cropName || body.crop || "").trim();
    if (!cropName) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "cropName is required" }),
      };
    }

    const config = await saveFertilizerRateConfig(
      cropName,
      body.config ?? body
    );
    invalidate(`fertilizerRates:${cropName.toLowerCase()}`);
    invalidate("fertilizerRates:");
    invalidate("fertilizers:");
    invalidate("fertilizer:");
    invalidate("cropTodos:");
    invalidate("cropNotes:");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
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
