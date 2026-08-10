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
    const config = await saveFertilizerRateConfig(body.config ?? body);
    invalidate("fertilizerRates:");
    invalidate("fertilizers:");
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
