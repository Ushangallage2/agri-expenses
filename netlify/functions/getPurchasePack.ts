import type { Handler } from "@netlify/functions";
import { requireAuth } from "../../src/utils/requireAuth";
import { getPurchasePackItems } from "./utils/fertilizerDb";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const items = await getPurchasePackItems();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    };
  } catch (err: any) {
    console.error("getPurchasePack:", err?.message || err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err?.message || "Server error" }),
    };
  }
};

export const handler = requireAuth(baseHandler);
