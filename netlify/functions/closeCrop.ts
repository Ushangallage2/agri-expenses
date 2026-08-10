import type { Handler } from "@netlify/functions";
import pool from "./db";
import { ensureCropPlantCountColumn } from "./utils/cropPlantCountDb";
import { recordPlantCountHistory } from "./utils/cropPlantCountHistoryDb";
import {
  cropMoneySnapshot,
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

    const { crop, name } = JSON.parse(event.body || "{}");
    const cropName = String(crop || name || "").trim();
    if (!cropName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Crop required" }),
      };
    }

    await ensureCropPlantCountColumn();
    await ensureCropStatusColumns();

    const existing = await pool.query(
      `SELECT name, plant_count, status FROM crops WHERE name = $1`,
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
    };
    if (isCropClosed(row.status)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Crop is already closed" }),
      };
    }

    const plantCount = Number(row.plant_count) || 0;
    const money = await cropMoneySnapshot(cropName);
    const closedAt = new Date().toISOString().slice(0, 19).replace("T", " ");

    await pool.query(
      `UPDATE crops
       SET status = 'closed',
           closed_at = $1,
           closed_plant_count = $2,
           plant_count = 0,
           closed_income = $3,
           closed_expense = $4,
           closed_profit = $5
       WHERE name = $6`,
      [
        closedAt,
        plantCount,
        money.income,
        money.expense,
        money.profit,
        cropName,
      ]
    );

    await recordPlantCountHistory(cropName, 0);

    // Stop fertilizer due nagging for this plantation
    try {
      await pool.query(
        `UPDATE crop_notes
         SET completed = 1
         WHERE crop_name = $1
           AND entry_type = 'todo'
           AND completed = 0
           AND source LIKE 'fert_due:%'`,
        [cropName]
      );
    } catch {
      /* notes table may not exist */
    }

    invalidate("crops:");
    invalidate("cropTodos:");
    invalidate("cropNotes:");
    invalidate("dashboard:");
    invalidate("fertilizer:");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        crop: cropName,
        status: "closed",
        closed_at: closedAt,
        closed_plant_count: plantCount,
        plant_count: 0,
        closed_income: money.income,
        closed_expense: money.expense,
        closed_profit: money.profit,
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
