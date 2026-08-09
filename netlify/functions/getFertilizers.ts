import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAuth } from "../../src/utils/requireAuth";
import {
  ensureFertilizerTables,
  mapFertilizer,
} from "./utils/fertilizerDb";

const baseHandler: Handler = async () => {
  try {
    await ensureFertilizerTables();

    const res = await pool.query(
      `SELECT id, name, unit, stock_qty, unit_price, notes, created_at
       FROM fertilizers
       ORDER BY name ASC`
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        res.rows.map((r) => mapFertilizer(r as Record<string, unknown>))
      ),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAuth(baseHandler);
