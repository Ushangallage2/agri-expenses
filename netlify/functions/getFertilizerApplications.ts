import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAuth } from "../../src/utils/requireAuth";
import {
  ensureFertilizerTables,
  mapApplication,
} from "./utils/fertilizerDb";

const baseHandler: Handler = async (event) => {
  const crop = event.queryStringParameters?.crop?.trim();

  try {
    await ensureFertilizerTables();

    const res = crop
      ? await pool.query(
          `SELECT a.id, a.crop_name, a.fertilizer_id, f.name AS fertilizer_name,
                  a.amount, a.unit, a.applied_at, a.notes, a.schedule_step_id,
                  a.created_by, a.created_at
           FROM fertilizer_applications a
           LEFT JOIN fertilizers f ON f.id = a.fertilizer_id
           WHERE a.crop_name = $1
           ORDER BY a.applied_at DESC, a.id DESC
           LIMIT 200`,
          [crop]
        )
      : await pool.query(
          `SELECT a.id, a.crop_name, a.fertilizer_id, f.name AS fertilizer_name,
                  a.amount, a.unit, a.applied_at, a.notes, a.schedule_step_id,
                  a.created_by, a.created_at
           FROM fertilizer_applications a
           LEFT JOIN fertilizers f ON f.id = a.fertilizer_id
           ORDER BY a.applied_at DESC, a.id DESC
           LIMIT 200`
        );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        res.rows.map((r) => mapApplication(r as Record<string, unknown>))
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
