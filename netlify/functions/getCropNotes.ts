import type { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

async function ensureNotesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crop_notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      crop_name VARCHAR(255) NOT NULL,
      note TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_crop_notes_crop (crop_name)
    )
  `);
}

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    jwt.verify(token, JWT_SECRET);

    const crop = event.queryStringParameters?.crop;
    if (!crop) return { statusCode: 400, body: "crop query required" };

    await ensureNotesTable();

    const res = await pool.query(
      `SELECT id, crop_name, note, created_at
       FROM crop_notes
       WHERE crop_name = $1
       ORDER BY created_at DESC`,
      [crop]
    );

    return { statusCode: 200, body: JSON.stringify(res.rows) };
  } catch (err) {
    console.error(err);
    return { statusCode: 401, body: "Unauthorized" };
  }
};
