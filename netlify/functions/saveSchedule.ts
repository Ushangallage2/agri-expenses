import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  ensureFertilizerTables,
  getScheduleWithSteps,
  insertScheduleSteps,
  setWorkingSchedule,
  toNum,
  type ScheduleStepInput,
} from "./utils/fertilizerDb";

function parseSteps(raw: unknown): ScheduleStepInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const steps: ScheduleStepInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i] || {};
    const title = String(s.title || "").trim();
    if (!title) return null;
    steps.push({
      stepOrder: Number(s.stepOrder ?? s.step_order) || i + 1,
      weekNumber:
        s.weekNumber != null || s.week_number != null
          ? Number(s.weekNumber ?? s.week_number)
          : null,
      title,
      instructions:
        s.instructions != null && String(s.instructions).trim()
          ? String(s.instructions).trim()
          : null,
      suggestedFertilizerId:
        s.suggestedFertilizerId != null || s.suggested_fertilizer_id != null
          ? Number(s.suggestedFertilizerId ?? s.suggested_fertilizer_id)
          : null,
      suggestedAmount:
        s.suggestedAmount != null || s.suggested_amount != null
          ? toNum(s.suggestedAmount ?? s.suggested_amount)
          : null,
      unit:
        s.unit != null && String(s.unit).trim()
          ? String(s.unit).trim()
          : null,
      intervalDays:
        s.intervalDays != null || s.interval_days != null
          ? Number(s.intervalDays ?? s.interval_days)
          : null,
    });
  }
  return steps;
}

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const id = body.id != null ? Number(body.id) : null;
  const name = String(body.name || "").trim();
  const description =
    body.description != null && String(body.description).trim()
      ? String(body.description).trim()
      : null;
  const cropName =
    body.cropName !== undefined || body.crop_name !== undefined
      ? body.cropName ?? body.crop_name
      : undefined;
  const steps = parseSteps(body.steps);
  const applyWorking =
    body.applyWorking === true ||
    body.setWorking === true ||
    body.apply === true;

  if (!name) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "name required" }),
    };
  }
  if (!steps) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "steps required (at least one with title)" }),
    };
  }

  try {
    await ensureFertilizerTables();

    let scheduleId = id && Number.isFinite(id) && id > 0 ? id : null;

    if (scheduleId) {
      const existing = await pool.query(
        `SELECT id, crop_name FROM fertilizer_schedules WHERE id = $1`,
        [scheduleId]
      );
      if (!existing.rows[0]) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Schedule not found" }),
        };
      }

      const nextCrop =
        cropName === undefined
          ? existing.rows[0].crop_name
          : cropName == null || String(cropName).trim() === ""
            ? null
            : String(cropName).trim();

      await pool.query(
        `UPDATE fertilizer_schedules
         SET crop_name = $1, name = $2, description = $3
         WHERE id = $4`,
        [nextCrop, name, description, scheduleId]
      );
      await pool.query(
        `DELETE FROM fertilizer_schedule_steps WHERE schedule_id = $1`,
        [scheduleId]
      );
    } else {
      const nextCrop =
        cropName == null || String(cropName).trim() === ""
          ? null
          : String(cropName).trim();

      const created = await pool.query(
        `INSERT INTO fertilizer_schedules (crop_name, name, description, is_working)
         VALUES ($1, $2, $3, 0)
         RETURNING id`,
        [nextCrop, name, description]
      );
      scheduleId = Number(created.rows[0].id);
    }

    await insertScheduleSteps(scheduleId!, steps);

    let full = await getScheduleWithSteps(scheduleId!);
    if (applyWorking && full?.crop_name) {
      full = await setWorkingSchedule(scheduleId!);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(full),
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
