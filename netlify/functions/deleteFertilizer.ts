import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import { ensureFertilizerTables } from "./utils/fertilizerDb";
import { invalidate } from "./utils/memoryCache";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { id } = JSON.parse(event.body || "{}");
  const fertId = Number(id);
  if (!Number.isFinite(fertId) || fertId <= 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "id required" }),
    };
  }

  try {
    await ensureFertilizerTables();

    const apps = await pool.query(
      `SELECT COUNT(*) AS cnt FROM fertilizer_applications WHERE fertilizer_id = $1`,
      [fertId]
    );
    const count = Number(apps.rows[0]?.cnt || 0);
    if (count > 0) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: `Cannot delete: ${count} usage log(s) reference this fertilizer. Delete those first.`,
        }),
      };
    }

    await pool.query(
      `DELETE FROM fertilizer_price_history WHERE fertilizer_id = $1`,
      [fertId]
    );
    await pool.query(
      `UPDATE fertilizer_schedule_steps SET suggested_fertilizer_id = NULL
       WHERE suggested_fertilizer_id = $1`,
      [fertId]
    );

    const res = await pool.query(`DELETE FROM fertilizers WHERE id = $1`, [
      fertId,
    ]);
    if (!res.rowCount) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Fertilizer not found" }),
      };
    }

    invalidate("fertilizers:");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
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
