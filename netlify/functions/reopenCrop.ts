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
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const cropName = String(body.crop || body.name || "").trim();
    if (!cropName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Crop required" }),
      };
    }

    await ensureCropPlantCountColumn();
    await ensureCropStatusColumns();

    const existing = await pool.query(
      `SELECT name, plant_count, status, closed_plant_count
       FROM crops WHERE name = $1`,
      [cropName]
    );
    if (!existing.rowCount) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Crop not found" }),
      };
    }

    const row = existing.rows[0] as {
      name: string;
      plant_count: number;
      status: string;
      closed_plant_count: number | null;
    };

    if (!isCropClosed(row.status)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Crop is already active" }),
      };
    }

    const snapshot = Number(row.closed_plant_count);
    const restored =
      Number.isFinite(snapshot) && snapshot >= 0 ? Math.floor(snapshot) : 0;

    await pool.query(
      `UPDATE crops
       SET status = 'active',
           closed_at = NULL,
           plant_count = $1
       WHERE name = $2`,
      [restored, cropName]
    );

    // Keep closed_plant_count / money snapshot as last-close history
    await recordPlantCountHistory(cropName, restored);

    invalidate("crops:");
    invalidate("cropTodos:");
    invalidate("cropNotes:");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        crop: cropName,
        status: "active",
        plant_count: restored,
        closed_plant_count: Number.isFinite(snapshot) ? snapshot : null,
        closed_at: null,
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
