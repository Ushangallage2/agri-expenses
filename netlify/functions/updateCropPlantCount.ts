import type { Handler } from "@netlify/functions";
import pool from "./db";
import { ensureCropPlantCountColumn } from "./utils/cropPlantCountDb";
import { recordPlantCountHistory } from "./utils/cropPlantCountHistoryDb";
import {
  ensureCropStatusColumns,
  isCropClosed,
} from "./utils/cropStatusDb";
import { isErrorResponse, requireAdminUser } from "./utils/session";
import { invalidate } from "./utils/memoryCache";

export const handler: Handler = async (event) => {
  try {
    const auth = await requireAdminUser(event);
    if (isErrorResponse(auth)) return auth;

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const { crop, plantCount } = JSON.parse(event.body || "{}");
    const name = typeof crop === "string" ? crop.trim() : "";
    const count = Number(plantCount);

    if (!name) {
      return { statusCode: 400, body: JSON.stringify({ error: "Crop required" }) };
    }
    if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Plant count must be a whole number ≥ 0" }),
      };
    }

    await ensureCropPlantCountColumn();
    await ensureCropStatusColumns();

    const existing = await pool.query(
      `SELECT status FROM crops WHERE name = $1`,
      [name]
    );
    if (!existing.rowCount) {
      return { statusCode: 404, body: JSON.stringify({ error: "Crop not found" }) };
    }
    if (isCropClosed(existing.rows[0].status)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Crop is closed — reopen before changing plant count",
        }),
      };
    }

    const res = await pool.query(
      `UPDATE crops SET plant_count = $1 WHERE name = $2`,
      [count, name]
    );

    if (!res.rowCount) {
      return { statusCode: 404, body: JSON.stringify({ error: "Crop not found" }) };
    }

    await recordPlantCountHistory(name, count);

    invalidate("crops:");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, crop: name, plant_count: count }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
