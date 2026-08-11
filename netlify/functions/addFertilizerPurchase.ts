import type { Handler, HandlerContext } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  ensureFertilizerTables,
  mapFertilizer,
  recordPriceHistory,
  toNum,
} from "./utils/fertilizerDb";
import { recordStockMutation } from "./utils/fertilizerStockMutationsDb";
import { invalidate } from "./utils/memoryCache";

/**
 * Add a purchase onto an existing fertilizer (dropdown target).
 * Increases stock; optionally updates unit price / notes.
 */
const baseHandler: Handler = async (event, context: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const fertilizerId = Number(body.fertilizerId ?? body.fertilizer_id);
  const amount = toNum(body.amount ?? body.qty ?? body.stockDelta);
  const unitPriceRaw = body.unitPrice ?? body.unit_price;
  const notes =
    body.notes != null && String(body.notes).trim()
      ? String(body.notes).trim()
      : null;

  if (!Number.isFinite(fertilizerId) || fertilizerId <= 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Select an existing fertilizer" }),
    };
  }
  if (!(amount > 0)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Purchase amount must be greater than 0" }),
    };
  }

  const user = (context as { user?: { username?: string } }).user;
  const createdBy = user?.username || null;

  try {
    await ensureFertilizerTables();

    const current = await pool.query(
      `SELECT id, name, unit, stock_qty, unit_price, notes, created_at
       FROM fertilizers WHERE id = $1`,
      [fertilizerId]
    );
    if (!current.rows[0]) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Fertilizer not found" }),
      };
    }

    const cur = mapFertilizer(current.rows[0] as Record<string, unknown>);
    const prevQty = cur.stock_qty;
    const nextQty = Number((prevQty + amount).toFixed(3));
    const prevPrice = cur.unit_price;
    let nextPrice = prevPrice;
    let priceChanged = false;

    if (unitPriceRaw != null && String(unitPriceRaw).trim() !== "") {
      nextPrice = toNum(unitPriceRaw);
      if (nextPrice < 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Price must be ≥ 0" }),
        };
      }
      priceChanged = nextPrice !== prevPrice;
    }

    const nextNotes = notes != null ? notes : cur.notes;

    await pool.query(
      `UPDATE fertilizers
       SET stock_qty = $1, unit_price = $2, notes = $3
       WHERE id = $4`,
      [nextQty, nextPrice, nextNotes, fertilizerId]
    );

    if (priceChanged) {
      await recordPriceHistory(fertilizerId, nextPrice);
    }

    await recordStockMutation({
      fertilizerId,
      reason: "purchase",
      deltaQty: amount,
      prevQty,
      nextQty,
      prevPrice,
      nextPrice,
      notes:
        notes ||
        `Purchase +${amount} ${cur.unit}${
          priceChanged ? ` @ ${nextPrice}` : ""
        }`,
      createdBy,
    });

    const updated = await pool.query(
      `SELECT id, name, unit, stock_qty, unit_price, notes, created_at
       FROM fertilizers WHERE id = $1`,
      [fertilizerId]
    );

    invalidate("fertilizers:");
    invalidate("fertilizer:");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fertilizer: mapFertilizer(
          updated.rows[0] as Record<string, unknown>
        ),
        added: amount,
        unit: cur.unit,
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
