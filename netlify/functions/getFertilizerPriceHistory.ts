import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAuth } from "../../src/utils/requireAuth";
import { ensureFertilizerTables, toNum } from "./utils/fertilizerDb";

const baseHandler: Handler = async (event) => {
  const fertilizerId = Number(
    event.queryStringParameters?.fertilizerId ||
      event.queryStringParameters?.id
  );
  if (!Number.isFinite(fertilizerId) || fertilizerId <= 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "fertilizerId query required" }),
    };
  }

  try {
    await ensureFertilizerTables();

    const res = await pool.query(
      `SELECT id, fertilizer_id, price, recorded_at
       FROM fertilizer_price_history
       WHERE fertilizer_id = $1
       ORDER BY recorded_at DESC, id DESC
       LIMIT 50`,
      [fertilizerId]
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        res.rows.map((r) => ({
          id: Number(r.id),
          fertilizer_id: Number(r.fertilizer_id),
          price: toNum(r.price),
          recorded_at: r.recorded_at,
        }))
      ),
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
