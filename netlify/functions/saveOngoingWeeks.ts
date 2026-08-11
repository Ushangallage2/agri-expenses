import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  getFertilizerRateConfig,
  saveFertilizerRateConfig,
} from "./utils/fertilizerRateConfigDb";
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

    const rawWeeks = Array.isArray(body.ongoingWeeks)
      ? body.ongoingWeeks
      : Array.isArray(body.weeks)
        ? body.weeks
        : [];
    const ongoingWeeks = rawWeeks
      .map((n: unknown) => Math.floor(Number(n)))
      .filter((n: number) => Number.isFinite(n));

    const current = await getFertilizerRateConfig(cropName);
    const saved = await saveFertilizerRateConfig(cropName, {
      ...current,
      ongoingWeeks,
    });

    invalidate(`fertilizerRates:${cropName.toLowerCase()}`);
    invalidate("fertilizerRates:");
    invalidate("fertilizer:");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ongoingWeeks: saved.ongoingWeeks || [],
        config: saved,
      }),
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
