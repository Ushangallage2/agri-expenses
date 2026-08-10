import type { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";
import { ensureCropNotesTable } from "./utils/cropNotesDb";
import { syncFertilizerDueTodos } from "./utils/fertilizerDueTodos";
import { ensureTurmericPlanNotes } from "./utils/turmericPlanNotes";
import { cached } from "./utils/memoryCache";

const JWT_SECRET = process.env.JWT_SECRET!;
const TTL_MS = 30_000;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    jwt.verify(token, JWT_SECRET);

    const crop = event.queryStringParameters?.crop;
    if (!crop) return { statusCode: 400, body: "crop query required" };

    const body = await cached(`cropNotes:${crop}`, TTL_MS, async () => {
      await ensureCropNotesTable();

      try {
        await ensureTurmericPlanNotes(crop);
      } catch (seedErr) {
        console.error("turmeric plan notes:", seedErr);
      }

      try {
        await syncFertilizerDueTodos();
      } catch (syncErr) {
        console.error("fertilizer due sync:", syncErr);
      }

      const res = await pool.query(
        `SELECT id, crop_name, note, entry_type, completed, source, created_at
         FROM crop_notes
         WHERE crop_name = $1
         ORDER BY
           CASE WHEN entry_type = 'todo' AND completed = 0 THEN 0 ELSE 1 END,
           created_at DESC`,
        [crop]
      );

      return JSON.stringify(
        res.rows.map((r) => ({
          ...r,
          entry_type: r.entry_type === "todo" ? "todo" : "note",
          completed: Number(r.completed) ? 1 : 0,
          source: r.source || null,
        }))
      );
    });

    return {
      statusCode: 200,
      body,
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 401, body: "Unauthorized" };
  }
};
