import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  countUndoableStockMutations,
  undoLastStockMutation,
} from "./utils/fertilizerStockMutationsDb";
import { ensureFertilizerTables } from "./utils/fertilizerDb";
import { invalidate } from "./utils/memoryCache";

/**
 * One click = one inventory step back (LIFO purchase / stock mutations).
 */
const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    await ensureFertilizerTables();
    const undone = await undoLastStockMutation();
    if (!undone) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Nothing to undo — no prior purchase/stock steps left",
          remaining: 0,
        }),
      };
    }

    const remaining = await countUndoableStockMutations();
    invalidate("fertilizers:");
    invalidate("fertilizer:");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        undone,
        remaining,
        hint: `Reverted ${undone.fertilizer_name} to stock ${undone.restored_qty}${
          remaining > 0
            ? ` · ${remaining} more step(s) can be undone`
            : " · undo history empty"
        }`,
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
