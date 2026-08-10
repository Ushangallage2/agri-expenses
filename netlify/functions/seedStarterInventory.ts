import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  ensureFertilizerTables,
  mapFertilizer,
  seedStarterInventory,
} from "./utils/fertilizerDb";
import pool from "./db";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const mode =
    body.mode === "set" ? "set" : ("add_if_zero" as "set" | "add_if_zero");

  try {
    await ensureFertilizerTables();
    const seeded = await seedStarterInventory({ mode });
    const all = await pool.query(
      `SELECT id, name, unit, stock_qty, unit_price, notes, created_at
       FROM fertilizers ORDER BY name ASC`
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seeded,
        fertilizers: all.rows.map((r) =>
          mapFertilizer(r as Record<string, unknown>)
        ),
        hint:
          mode === "set"
            ? "Stock quantities were set to your purchase pack amounts."
            : "Created missing products; filled stock only where it was zero.",
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
