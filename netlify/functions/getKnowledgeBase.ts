import type { Handler } from "@netlify/functions";
import { requireAuth } from "../../src/utils/requireAuth";
import { loadKnowledgeBase } from "./utils/knowledgeBaseDb";

/**
 * Returns the SHARED knowledge base (fertilizers, pesticides, application
 * cycles). Available to any signed-in user; identical for every farm. Contains
 * no private inventory, amounts or prices.
 */
const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const kb = await loadKnowledgeBase();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kb),
    };
  } catch (err: any) {
    console.error("getKnowledgeBase error:", err?.message || err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAuth(baseHandler);
