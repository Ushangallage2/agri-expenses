import type { Handler, HandlerContext } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  ensurePesticideTables,
  listPesticideSets,
  mapSet,
  mapSetItem,
} from "./utils/pesticideDb";
import { toNum } from "./utils/fertilizerDb";
import { invalidate } from "./utils/memoryCache";

type ItemIn = {
  fertilizerId?: number;
  fertilizer_id?: number;
  amount?: number;
  unit?: string;
};

const baseHandler: Handler = async (event, context: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const idRaw = body.id != null ? Number(body.id) : null;
  const name = String(body.name || "").trim();
  const description =
    body.description != null && String(body.description).trim()
      ? String(body.description).trim()
      : null;
  const itemsIn = (Array.isArray(body.items) ? body.items : []) as ItemIn[];

  if (!name) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Set name is required" }),
    };
  }

  const items = itemsIn
    .map((it, idx) => {
      const fertilizerId = Number(it.fertilizerId ?? it.fertilizer_id);
      const amount = toNum(it.amount);
      const unit = String(it.unit || "ml").trim() || "ml";
      return { fertilizerId, amount, unit, sort_order: idx };
    })
    .filter((it) => Number.isFinite(it.fertilizerId) && it.fertilizerId > 0);

  if (!items.length) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Add at least one inventory item to the set",
      }),
    };
  }

  const user = (context as { user?: { username?: string } }).user;
  const createdBy = user?.username || null;

  try {
    await ensurePesticideTables();

    for (const it of items) {
      const f = await pool.query(`SELECT id FROM fertilizers WHERE id = $1`, [
        it.fertilizerId,
      ]);
      if (!f.rows[0]) {
        return {
          statusCode: 404,
          body: JSON.stringify({
            error: `Inventory item #${it.fertilizerId} not found`,
          }),
        };
      }
    }

    let setId = idRaw != null && Number.isFinite(idRaw) && idRaw > 0 ? idRaw : 0;

    if (setId > 0) {
      const exists = await pool.query(
        `SELECT id FROM pesticide_sets WHERE id = $1`,
        [setId]
      );
      if (!exists.rows[0]) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Set not found" }),
        };
      }
      await pool.query(
        `UPDATE pesticide_sets SET name = $1, description = $2 WHERE id = $3`,
        [name, description, setId]
      );
      await pool.query(`DELETE FROM pesticide_set_items WHERE set_id = $1`, [
        setId,
      ]);
    } else {
      const inserted = await pool.query(
        `INSERT INTO pesticide_sets (name, description, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, name, description, created_by, created_at`,
        [name, description, createdBy]
      );
      setId = Number(inserted.rows[0].id);
    }

    for (const it of items) {
      await pool.query(
        `INSERT INTO pesticide_set_items
          (set_id, fertilizer_id, amount, unit, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [setId, it.fertilizerId, it.amount, it.unit, it.sort_order]
      );
    }

    const row = await pool.query(
      `SELECT id, name, description, created_by, created_at
       FROM pesticide_sets WHERE id = $1`,
      [setId]
    );
    const itemRows = await pool.query(
      `SELECT i.id, i.fertilizer_id, i.amount, i.unit, i.sort_order,
              f.name AS fertilizer_name, f.stock_qty, f.unit_price, f.unit AS stock_unit
       FROM pesticide_set_items i
       LEFT JOIN fertilizers f ON f.id = i.fertilizer_id
       WHERE i.set_id = $1
       ORDER BY i.sort_order ASC, i.id ASC`,
      [setId]
    );

    invalidate("pesticide:");
    invalidate("fertilizer:");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        set: mapSet(
          row.rows[0] as Record<string, unknown>,
          itemRows.rows.map((r) => mapSetItem(r as Record<string, unknown>))
        ),
        sets: await listPesticideSets(),
      }),
    };
  } catch (err: any) {
    console.error(err);
    const msg = String(err?.message || err);
    if (/Duplicate|ER_DUP_ENTRY/i.test(msg)) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "A set with that name already exists" }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" }),
    };
  }
};

export const handler = requireAdmin(baseHandler);
