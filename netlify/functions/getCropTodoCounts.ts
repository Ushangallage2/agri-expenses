import type { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";
import { ensureCropNotesTable } from "./utils/cropNotesDb";
import { syncFertilizerDueTodos } from "./utils/fertilizerDueTodos";
import { cached } from "./utils/memoryCache";

const JWT_SECRET = process.env.JWT_SECRET!;
const TTL_MS = 30_000;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    jwt.verify(token, JWT_SECRET);

    const body = await cached("cropTodos:counts", TTL_MS, async () => {
      await ensureCropNotesTable();

      try {
        await syncFertilizerDueTodos();
      } catch (syncErr) {
        console.error("fertilizer due sync:", syncErr);
      }

      const res = await pool.query(
        `SELECT crop_name, COUNT(*) AS open_todos
         FROM crop_notes
         WHERE entry_type = 'todo' AND completed = 0
         GROUP BY crop_name`
      );

      return JSON.stringify(
        res.rows.map((r: any) => ({
          crop_name: r.crop_name as string,
          open_todos: Number(r.open_todos) || 0,
        }))
      );
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body,
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 401, body: "Unauthorized" };
  }
};
