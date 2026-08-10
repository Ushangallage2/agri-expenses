import type { Handler } from "@netlify/functions";
import { requireAuth } from "../../src/utils/requireAuth";
import { getFertilizerRateConfig } from "./utils/fertilizerRateConfigDb";
import { cached } from "./utils/memoryCache";

const TTL_MS = 60_000;

const baseHandler: Handler = async () => {
  try {
    const body = await cached("fertilizerRates:config", TTL_MS, async () => {
      const config = await getFertilizerRateConfig();
      return JSON.stringify(config);
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body,
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" }),
    };
  }
};

export const handler = requireAuth(baseHandler);
