import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  ensureFertilizerTables,
  mapFertilizer,
  seedStarterInventory,
} from "./utils/fertilizerDb";
import pool from "./db";
import { invalidate } from "./utils/memoryCache";

type SyncMode = "add" | "set" | "add_if_zero";

function parseMode(raw: unknown): SyncMode {
  if (raw === "set" || raw === "add_if_zero" || raw === "add") return raw;
  return "add";
}

const HINTS: Record<SyncMode, string> = {
  add: "Purchase quantities were added to current stock; unit prices updated from the pack.",
  set: "Stock quantities and unit prices were set from your purchase pack.",
  add_if_zero: "Created missing products; filled stock only where it was zero.",
};

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const mode = parseMode(body.mode);

  try {
    await ensureFertilizerTables();
    const seeded = await seedStarterInventory({ mode });
    const all = await pool.query(
      `SELECT id, name, unit, stock_qty, unit_price, notes, created_at
       FROM fertilizers ORDER BY name ASC`
    );

    invalidate("fertilizers:");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seeded,
        fertilizers: all.rows.map((r) =>
          mapFertilizer(r as Record<string, unknown>)
        ),
        hint: HINTS[mode],
      }),
    };
  } catch (err: any) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err?.message || "Server error" }),
    };
  }
};

export const handler = requireAdmin(baseHandler);
