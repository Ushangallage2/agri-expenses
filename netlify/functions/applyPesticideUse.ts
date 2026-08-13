import type { Handler, HandlerContext } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  ensurePesticideTables,
  listPesticideUseLogs,
} from "./utils/pesticideDb";
import {
  ensureFertilizerTables,
  mapFertilizer,
  toNum,
} from "./utils/fertilizerDb";
import { toStockAmount } from "./utils/fertilizerRecipes";
import { recordStockMutation } from "./utils/fertilizerStockMutationsDb";
import { invalidate } from "./utils/memoryCache";

type LineIn = {
  fertilizerId?: number;
  fertilizer_id?: number;
  amount?: number;
  unit?: string;
};

/**
 * Apply a pesticide set or ad-hoc mix: deduct inventory and write
 * immutable price snapshots on each line.
 */
const baseHandler: Handler = async (event, context: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const setIdRaw = body.setId ?? body.set_id;
  const setId =
    setIdRaw != null && Number.isFinite(Number(setIdRaw))
      ? Math.floor(Number(setIdRaw))
      : null;
  const cropName =
    body.cropName != null && String(body.cropName).trim()
      ? String(body.cropName).trim()
      : null;
  const note =
    body.note != null && String(body.note).trim()
      ? String(body.note).trim()
      : null;
  const description =
    body.description != null && String(body.description).trim()
      ? String(body.description).trim()
      : null;
  const linesIn = (Array.isArray(body.lines) ? body.lines : []) as LineIn[];

  const appliedRaw = String(body.appliedAt ?? body.applied_at ?? "").trim();
  let appliedAt: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(appliedRaw)) {
    appliedAt = `${appliedRaw} 12:00:00`;
  } else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(appliedRaw)) {
    appliedAt = appliedRaw.replace("T", " ").slice(0, 19);
  } else {
    const d = new Date();
    appliedAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} 12:00:00`;
  }

  const user = (context as { user?: { username?: string } }).user;
  const createdBy = user?.username || null;

  try {
    await ensureFertilizerTables();
    await ensurePesticideTables();

    let setName: string | null = null;
    let setDescription: string | null = description;
    let workingLines = linesIn;

    if (setId != null && setId > 0) {
      const setRow = await pool.query(
        `SELECT id, name, description FROM pesticide_sets WHERE id = $1`,
        [setId]
      );
      if (!setRow.rows[0]) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Pesticide set not found" }),
        };
      }
      setName = String(setRow.rows[0].name);
      if (!setDescription && setRow.rows[0].description) {
        setDescription = String(setRow.rows[0].description);
      }
      if (!workingLines.length) {
        const items = await pool.query(
          `SELECT fertilizer_id, amount, unit FROM pesticide_set_items
           WHERE set_id = $1 ORDER BY sort_order ASC, id ASC`,
          [setId]
        );
        workingLines = items.rows.map((r: any) => ({
          fertilizer_id: Number(r.fertilizer_id),
          amount: toNum(r.amount),
          unit: String(r.unit || "ml"),
        }));
      }
    }

    const resolved: {
      fertilizerId: number;
      name: string;
      stockUnit: string;
      usageAmount: number;
      usageUnit: string;
      deduct: number;
      unitPrice: number;
      lineCost: number;
      prevQty: number;
      nextQty: number;
    }[] = [];

    for (const line of workingLines) {
      const amount = toNum(line.amount);
      if (!(amount > 0)) continue;
      const fid = Number(line.fertilizerId ?? line.fertilizer_id);
      if (!Number.isFinite(fid) || fid <= 0) continue;

      const fert = await pool.query(
        `SELECT id, name, unit, stock_qty, unit_price FROM fertilizers WHERE id = $1`,
        [fid]
      );
      if (!fert.rows[0]) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: `Inventory item #${fid} not found` }),
        };
      }
      const row = fert.rows[0];
      const stockUnit = String(row.unit || "kg");
      const usageUnit = String(line.unit || stockUnit).trim() || stockUnit;
      const deduct = toStockAmount(amount, usageUnit, stockUnit);
      const stock = toNum(row.stock_qty);
      if (deduct > stock + 1e-9) {
        return {
          statusCode: 409,
          body: JSON.stringify({
            error: `Insufficient stock for ${row.name}: have ${stock} ${stockUnit}, need ${deduct.toFixed(3)} ${stockUnit}`,
          }),
        };
      }
      const unitPrice = toNum(row.unit_price);
      const lineCost =
        unitPrice > 0 ? Number((deduct * unitPrice).toFixed(2)) : 0;

      resolved.push({
        fertilizerId: Number(row.id),
        name: String(row.name),
        stockUnit,
        usageAmount: amount,
        usageUnit,
        deduct,
        unitPrice,
        lineCost,
        prevQty: stock,
        nextQty: Number((stock - deduct).toFixed(3)),
      });
    }

    if (!resolved.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No positive volumes to apply" }),
      };
    }

    const batchId = `${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    for (const item of resolved) {
      const dec = await pool.query(
        `UPDATE fertilizers
         SET stock_qty = stock_qty - $1
         WHERE id = $2 AND stock_qty >= $3`,
        [item.deduct, item.fertilizerId, item.deduct]
      );
      if (!dec.rowCount) {
        return {
          statusCode: 409,
          body: JSON.stringify({
            error: `Insufficient stock for ${item.name} (concurrent update)`,
          }),
        };
      }

      await recordStockMutation({
        fertilizerId: item.fertilizerId,
        reason: "pesticide",
        deltaQty: -item.deduct,
        prevQty: item.prevQty,
        nextQty: item.nextQty,
        prevPrice: item.unitPrice,
        nextPrice: item.unitPrice,
        notes: `Pesticide use ${setName || "ad-hoc"} −${item.deduct} ${item.stockUnit}`,
        createdBy,
      });

      await pool.query(
        `INSERT INTO pesticide_use_lines
          (batch_id, fertilizer_id, fertilizer_name, amount, unit,
           stock_deducted, stock_unit, unit_price, line_cost)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          batchId,
          item.fertilizerId,
          item.name,
          item.usageAmount,
          item.usageUnit,
          item.deduct,
          item.stockUnit,
          item.unitPrice,
          item.lineCost,
        ]
      );
    }

    await pool.query(
      `INSERT INTO pesticide_use_logs
        (batch_id, set_id, set_name, description, note, crop_name, applied_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        batchId,
        setId != null && setId > 0 ? setId : null,
        setName,
        setDescription,
        note,
        cropName,
        appliedAt,
        createdBy,
      ]
    );

    const stockRows = await pool.query(
      `SELECT id, name, unit, stock_qty, unit_price, notes, created_at
       FROM fertilizers ORDER BY name ASC`
    );

    invalidate("pesticide:");
    invalidate("fertilizers:");
    invalidate("fertilizer:");

    const totalCost = Number(
      resolved.reduce((s, r) => s + r.lineCost, 0).toFixed(2)
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchId,
        totalCost,
        fertilizers: stockRows.rows.map((r) =>
          mapFertilizer(r as Record<string, unknown>)
        ),
        logs: await listPesticideUseLogs(60),
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
