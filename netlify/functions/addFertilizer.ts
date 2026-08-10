import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  ensureFertilizerTables,
  mapFertilizer,
  recordPriceHistory,
  toNum,
} from "./utils/fertilizerDb";
import { invalidate } from "./utils/memoryCache";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const name = String(body.name || "").trim();
  const unit = String(body.unit || "kg").trim() || "kg";
  const stockQty = toNum(body.stockQty ?? body.stock_qty ?? 0);
  const unitPrice = toNum(body.unitPrice ?? body.unit_price ?? 0);
  const notes =
    body.notes != null && String(body.notes).trim()
      ? String(body.notes).trim()
      : null;

  if (!name) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "name required" }),
    };
  }
  if (stockQty < 0 || unitPrice < 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "stock and price must be ≥ 0" }),
    };
  }

  try {
    await ensureFertilizerTables();

    const res = await pool.query(
      `INSERT INTO fertilizers (name, unit, stock_qty, unit_price, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, unit, stock_qty, unit_price, notes, created_at`,
      [name, unit, stockQty, unitPrice, notes]
    );

    const row = mapFertilizer(res.rows[0] as Record<string, unknown>);
    if (unitPrice > 0) {
      await recordPriceHistory(row.id, unitPrice);
    }

    invalidate("fertilizers:");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    };
  } catch (err: any) {
    console.error(err);
    const msg = String(err?.message || err);
    if (/Duplicate|ER_DUP_ENTRY/i.test(msg)) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "A fertilizer with that name already exists" }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" }),
    };
  }
};

export const handler = requireAdmin(baseHandler);
