import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAuth } from "../../src/utils/requireAuth";
import {
  ensureFertilizerTables,
  mapFertilizer,
} from "./utils/fertilizerDb";
import { cached } from "./utils/memoryCache";

const TTL_MS = 30_000;

const baseHandler: Handler = async () => {
  try {
    const body = await cached("fertilizers:list", TTL_MS, async () => {
      await ensureFertilizerTables();

      const res = await pool.query(
        `SELECT id, name, unit, stock_qty, unit_price, notes, created_at
         FROM fertilizers
         ORDER BY name ASC`
      );

      return JSON.stringify(
        res.rows.map((r) => mapFertilizer(r as Record<string, unknown>))
      );
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body,
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAuth(baseHandler);
