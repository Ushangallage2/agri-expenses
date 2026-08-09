import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAuth } from "../../src/utils/requireAuth";
import { ensureFertilizerTables, toNum } from "./utils/fertilizerDb";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { id } = JSON.parse(event.body || "{}");
  const appId = Number(id);
  if (!Number.isFinite(appId) || appId <= 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "id required" }),
    };
  }

  try {
    await ensureFertilizerTables();

    const existing = await pool.query(
      `SELECT id, fertilizer_id, amount FROM fertilizer_applications WHERE id = $1`,
      [appId]
    );
    if (!existing.rows[0]) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Application not found" }),
      };
    }

    const fertilizerId = Number(existing.rows[0].fertilizer_id);
    const amount = toNum(existing.rows[0].amount);

    await pool.query(
      `UPDATE fertilizers SET stock_qty = stock_qty + $1 WHERE id = $2`,
      [amount, fertilizerId]
    );
    await pool.query(`DELETE FROM fertilizer_applications WHERE id = $1`, [
      appId,
    ]);

    const stock = await pool.query(
      `SELECT stock_qty FROM fertilizers WHERE id = $1`,
      [fertilizerId]
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        fertilizer_id: fertilizerId,
        stock_qty: toNum(stock.rows[0]?.stock_qty),
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
