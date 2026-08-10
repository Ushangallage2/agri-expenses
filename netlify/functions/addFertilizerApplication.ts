import type { Handler, HandlerContext } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  ensureFertilizerTables,
  mapApplication,
  toNum,
} from "./utils/fertilizerDb";
import { invalidate } from "./utils/memoryCache";
import { toStockAmount } from "./utils/fertilizerRecipes";

const baseHandler: Handler = async (event, context: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const cropName = String(body.cropName ?? body.crop_name ?? "").trim();
  const fertilizerId = Number(body.fertilizerId ?? body.fertilizer_id);
  const amount = toNum(body.amount);
  const unit = String(body.unit || "").trim();
  const notes =
    body.notes != null && String(body.notes).trim()
      ? String(body.notes).trim()
      : null;
  const scheduleStepId =
    body.scheduleStepId != null || body.schedule_step_id != null
      ? Number(body.scheduleStepId ?? body.schedule_step_id)
      : null;

  const appliedRaw = String(body.appliedAt ?? body.applied_at ?? "").trim();
  let appliedAt: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(appliedRaw)) {
    appliedAt = `${appliedRaw} 12:00:00`;
  } else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(appliedRaw)) {
    appliedAt = appliedRaw.replace("T", " ").slice(0, 19);
  }

  if (!cropName) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "cropName required" }),
    };
  }
  if (!Number.isFinite(fertilizerId) || fertilizerId <= 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "fertilizerId required" }),
    };
  }
  if (!(amount > 0)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "amount must be greater than 0" }),
    };
  }
  if (!appliedAt) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "appliedAt required (YYYY-MM-DD)" }),
    };
  }

  const user = (context as { user?: { username?: string } }).user;
  const createdBy = user?.username || null;

  try {
    await ensureFertilizerTables();

    const fert = await pool.query(
      `SELECT id, name, unit, stock_qty FROM fertilizers WHERE id = $1`,
      [fertilizerId]
    );
    if (!fert.rows[0]) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Fertilizer not found" }),
      };
    }

    const stock = toNum(fert.rows[0].stock_qty);
    const fertUnit = String(fert.rows[0].unit || "kg");
    const useUnit = unit || fertUnit;
    const deduct = toStockAmount(amount, useUnit, fertUnit);

    if (deduct > stock + 1e-9) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: `Insufficient stock: have ${stock} ${fertUnit}, need ${deduct.toFixed(3)} ${fertUnit} (${amount} ${useUnit})`,
          stock,
          unit: fertUnit,
        }),
      };
    }

    // mysql shim maps each $n → ?; pass amount twice (cannot reuse $1)
    const dec = await pool.query(
      `UPDATE fertilizers
       SET stock_qty = stock_qty - $1
       WHERE id = $2 AND stock_qty >= $3`,
      [deduct, fertilizerId, deduct]
    );

    if (!dec.rowCount) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: `Insufficient stock: have ${stock} ${fertUnit}, need ${deduct.toFixed(3)} ${fertUnit} (${amount} ${useUnit})`,
          stock,
          unit: fertUnit,
        }),
      };
    }

    const stepId =
      scheduleStepId != null &&
      Number.isFinite(scheduleStepId) &&
      scheduleStepId > 0
        ? scheduleStepId
        : null;

    const inserted = await pool.query(
      `INSERT INTO fertilizer_applications
        (crop_name, fertilizer_id, amount, unit, applied_at, notes, schedule_step_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, crop_name, fertilizer_id, amount, unit, applied_at, notes,
                 schedule_step_id, created_by, created_at`,
      [
        cropName,
        fertilizerId,
        amount,
        useUnit,
        appliedAt,
        notes,
        stepId,
        createdBy,
      ]
    );

    const row = inserted.rows[0] as Record<string, unknown>;
    const mapped = mapApplication({
      ...row,
      fertilizer_name: fert.rows[0].name,
    });

    const newStock = await pool.query(
      `SELECT stock_qty FROM fertilizers WHERE id = $1`,
      [fertilizerId]
    );

    invalidate("fertilizers:");
    invalidate("fertilizer:");
    invalidate("cropTodos:");
    invalidate("cropNotes:");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        application: mapped,
        stock_qty: toNum(newStock.rows[0]?.stock_qty),
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
