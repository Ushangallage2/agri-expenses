import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAuth } from "../../src/utils/requireAuth";

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

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { crop, note } = JSON.parse(event.body || "{}");
  if (!crop?.trim() || !note?.trim()) {
    return { statusCode: 400, body: "crop and note required" };
  }

  try {
    await ensureNotesTable();

    const res = await pool.query(
      `INSERT INTO crop_notes (crop_name, note)
       VALUES ($1, $2)
       RETURNING id, crop_name, note, created_at`,
      [crop.trim(), note.trim()]
    );

    return { statusCode: 200, body: JSON.stringify(res.rows[0]) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAuth(baseHandler);
