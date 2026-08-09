import type { Handler, HandlerContext } from "@netlify/functions";
import pool from "./db";
import { requireAuth } from "../../src/utils/requireAuth";
import {
  ensureFertilizerTables,
  mapApplication,
  toNum,
} from "./utils/fertilizerDb";
import { toStockAmount } from "./utils/fertilizerRecipes";

type LineIn = {
  fertilizerId?: number;
  fertilizer_id?: number;
  fertilizerName?: string;
  fertilizer_name?: string;
  amount: number;
  unit?: string;
  notes?: string;
};

const baseHandler: Handler = async (event, context: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const cropName = String(body.cropName ?? body.crop_name ?? "").trim();
  const lines = (Array.isArray(body.lines) ? body.lines : []) as LineIn[];
  const weekLabel = body.weekLabel != null ? String(body.weekLabel) : "";
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
  if (!appliedAt) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "appliedAt required (YYYY-MM-DD)" }),
    };
  }
  if (!lines.length) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "lines required" }),
    };
  }

  const user = (context as { user?: { username?: string } }).user;
  const createdBy = user?.username || null;

  try {
    await ensureFertilizerTables();

    // Resolve + validate all lines first
    const resolved: {
      fertilizerId: number;
      name: string;
      stockUnit: string;
      stock: number;
      usageAmount: number;
      usageUnit: string;
      deduct: number;
      notes: string | null;
    }[] = [];

    for (const line of lines) {
      const amount = toNum(line.amount);
      if (!(amount > 0)) continue;

      let fertRow: any = null;
      const fid = Number(line.fertilizerId ?? line.fertilizer_id);
      const fname = String(
        line.fertilizerName ?? line.fertilizer_name ?? ""
      ).trim();

      if (Number.isFinite(fid) && fid > 0) {
        const r = await pool.query(
          `SELECT id, name, unit, stock_qty FROM fertilizers WHERE id = $1`,
          [fid]
        );
        fertRow = r.rows[0];
      } else if (fname) {
        const r = await pool.query(
          `SELECT id, name, unit, stock_qty FROM fertilizers WHERE name = $1`,
          [fname]
        );
        fertRow = r.rows[0];
      }

      if (!fertRow) {
        return {
          statusCode: 404,
          body: JSON.stringify({
            error: `Fertilizer not found: ${fname || fid}. Import purchase pack first.`,
          }),
        };
      }

      const stockUnit = String(fertRow.unit || "kg");
      const usageUnit = String(line.unit || "g").trim() || "g";
      const deduct = toStockAmount(amount, usageUnit, stockUnit);
      const stock = toNum(fertRow.stock_qty);

      if (deduct > stock + 1e-9) {
        return {
          statusCode: 409,
          body: JSON.stringify({
            error: `Insufficient stock for ${fertRow.name}: have ${stock} ${stockUnit}, need ${deduct.toFixed(3)} ${stockUnit} (${amount} ${usageUnit})`,
            fertilizer: fertRow.name,
            stock,
            unit: stockUnit,
          }),
        };
      }

      resolved.push({
        fertilizerId: Number(fertRow.id),
        name: String(fertRow.name),
        stockUnit,
        stock,
        usageAmount: amount,
        usageUnit,
        deduct,
        notes:
          line.notes != null && String(line.notes).trim()
            ? String(line.notes).trim()
            : weekLabel
              ? weekLabel
              : null,
      });
    }

    if (!resolved.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No positive amounts to apply" }),
      };
    }

    const applications = [];
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

      const inserted = await pool.query(
        `INSERT INTO fertilizer_applications
          (crop_name, fertilizer_id, amount, unit, applied_at, notes, schedule_step_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)
         RETURNING id, crop_name, fertilizer_id, amount, unit, applied_at, notes,
                   schedule_step_id, created_by, created_at`,
        [
          cropName,
          item.fertilizerId,
          item.usageAmount,
          item.usageUnit,
          appliedAt,
          item.notes,
          createdBy,
        ]
      );

      applications.push(
        mapApplication({
          ...(inserted.rows[0] as Record<string, unknown>),
          fertilizer_name: item.name,
        })
      );
    }

    const stockRows = await pool.query(
      `SELECT id, name, unit, stock_qty, unit_price, notes, created_at
       FROM fertilizers ORDER BY name ASC`
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applications,
        fertilizers: stockRows.rows.map((r) => ({
          id: Number(r.id),
          name: String(r.name),
          unit: String(r.unit),
          stock_qty: toNum(r.stock_qty),
          unit_price: toNum(r.unit_price),
          notes: r.notes,
          created_at: r.created_at,
        })),
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

export const handler = requireAuth(baseHandler);
