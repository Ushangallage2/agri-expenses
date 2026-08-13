import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import { ensurePesticideTables, listPesticideSets } from "./utils/pesticideDb";
import { invalidate } from "./utils/memoryCache";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "id required" }),
    };
  }

  try {
    await ensurePesticideTables();
    await pool.query(`DELETE FROM pesticide_set_items WHERE set_id = $1`, [id]);
    await pool.query(`DELETE FROM pesticide_sets WHERE id = $1`, [id]);
    invalidate("pesticide:");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, sets: await listPesticideSets() }),
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
