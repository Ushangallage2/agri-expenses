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
  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "id required" }),
    };
  }

  try {
    await ensureFertilizerTables();

    const current = await pool.query(
      `SELECT id, name, unit, stock_qty, unit_price, notes, created_at
       FROM fertilizers WHERE id = $1`,
      [id]
    );
    if (!current.rows[0]) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Fertilizer not found" }),
      };
    }

    const cur = mapFertilizer(current.rows[0] as Record<string, unknown>);
    const name =
      body.name != null ? String(body.name).trim() : cur.name;
    const unit =
      body.unit != null
        ? String(body.unit).trim() || cur.unit
        : cur.unit;
    const notes =
      body.notes !== undefined
        ? body.notes != null && String(body.notes).trim()
          ? String(body.notes).trim()
          : null
        : cur.notes;

    if (!name) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "name required" }),
      };
    }

    let stockQty = cur.stock_qty;
    if (body.stockQty != null || body.stock_qty != null) {
      stockQty = toNum(body.stockQty ?? body.stock_qty);
    } else if (body.stockDelta != null || body.stock_delta != null) {
      stockQty = cur.stock_qty + toNum(body.stockDelta ?? body.stock_delta);
    }

    if (stockQty < 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Stock cannot be negative" }),
      };
    }

    let unitPrice = cur.unit_price;
    let priceChanged = false;
    if (body.unitPrice != null || body.unit_price != null) {
      unitPrice = toNum(body.unitPrice ?? body.unit_price);
      if (unitPrice < 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Price must be ≥ 0" }),
        };
      }
      priceChanged = unitPrice !== cur.unit_price;
    }

    await pool.query(
      `UPDATE fertilizers
       SET name = $1, unit = $2, stock_qty = $3, unit_price = $4, notes = $5
       WHERE id = $6`,
      [name, unit, stockQty, unitPrice, notes, id]
    );

    if (priceChanged) {
      await recordPriceHistory(id, unitPrice);
    }

    const updated = await pool.query(
      `SELECT id, name, unit, stock_qty, unit_price, notes, created_at
       FROM fertilizers WHERE id = $1`,
      [id]
    );

    invalidate("fertilizers:");
    invalidate("fertilizer:");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mapFertilizer(updated.rows[0] as Record<string, unknown>)
      ),
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
