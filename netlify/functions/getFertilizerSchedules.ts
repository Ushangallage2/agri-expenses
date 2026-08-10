import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAuth } from "../../src/utils/requireAuth";
import {
  ensureFertilizerTables,
  mapSchedule,
  mapStep,
} from "./utils/fertilizerDb";

const baseHandler: Handler = async (event) => {
  const crop = event.queryStringParameters?.crop?.trim();
  const templatesOnly =
    event.queryStringParameters?.templates === "1" ||
    event.queryStringParameters?.templates === "true";

  try {
    await ensureFertilizerTables();

    let schedules;
    if (templatesOnly) {
      schedules = await pool.query(
        `SELECT id, crop_name, name, description, created_at
         FROM fertilizer_schedules
         WHERE crop_name IS NULL
         ORDER BY name ASC, id ASC`
      );
    } else if (crop) {
      // Selected crop only — do not mix in global templates.
      schedules = await pool.query(
        `SELECT id, crop_name, name, description, created_at
         FROM fertilizer_schedules
         WHERE crop_name = $1
         ORDER BY name ASC, id ASC`,
        [crop]
      );
    } else {
      schedules = await pool.query(
        `SELECT id, crop_name, name, description, created_at
         FROM fertilizer_schedules
         ORDER BY (crop_name IS NULL) DESC, crop_name ASC, name ASC, id ASC`
      );
    }

    const result = [];
    for (const row of schedules.rows) {
      const steps = await pool.query(
        `SELECT id, schedule_id, step_order, week_number, title, instructions,
                suggested_fertilizer_id, suggested_amount, unit, interval_days
         FROM fertilizer_schedule_steps
         WHERE schedule_id = $1
         ORDER BY step_order ASC, id ASC`,
        [row.id]
      );
      result.push(
        mapSchedule(
          row as Record<string, unknown>,
          steps.rows.map((s) => mapStep(s as Record<string, unknown>))
        )
      );
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
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
