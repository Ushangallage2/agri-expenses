import type { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";
import { ensureCropNotesTable } from "./utils/cropNotesDb";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    jwt.verify(token, JWT_SECRET);

    const crop = event.queryStringParameters?.crop;
    if (!crop) return { statusCode: 400, body: "crop query required" };

    await ensureCropNotesTable();

    const res = await pool.query(
      `SELECT id, crop_name, note, entry_type, completed, created_at
       FROM crop_notes
       WHERE crop_name = $1
       ORDER BY created_at DESC`,
      [crop]
    );

    return {
      statusCode: 200,
      body: JSON.stringify(
        res.rows.map((r) => ({
          ...r,
          entry_type: r.entry_type === "todo" ? "todo" : "note",
          completed: Number(r.completed) ? 1 : 0,
        }))
      ),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 401, body: "Unauthorized" };
  }
};
