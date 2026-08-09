import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAuth } from "../../src/utils/requireAuth";
import { ensureFertilizerTables } from "./utils/fertilizerDb";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { id } = JSON.parse(event.body || "{}");
  const scheduleId = Number(id);
  if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "id required" }),
    };
  }

  try {
    await ensureFertilizerTables();

    const steps = await pool.query(
      `SELECT id FROM fertilizer_schedule_steps WHERE schedule_id = $1`,
      [scheduleId]
    );
    for (const step of steps.rows) {
      await pool.query(
        `UPDATE fertilizer_applications SET schedule_step_id = NULL
         WHERE schedule_step_id = $1`,
        [step.id]
      );
    }

    await pool.query(
      `DELETE FROM fertilizer_schedule_steps WHERE schedule_id = $1`,
      [scheduleId]
    );
    const res = await pool.query(
      `DELETE FROM fertilizer_schedules WHERE id = $1`,
      [scheduleId]
    );

    if (!res.rowCount) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Schedule not found" }),
      };
    }

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

export const handler = requireAuth(baseHandler);
