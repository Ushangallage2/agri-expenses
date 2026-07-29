import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAuth } from "../../src/utils/requireAuth";
import {
  ensureCropNotesTable,
  normalizeEntryType,
} from "./utils/cropNotesDb";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { crop, note, entryType } = JSON.parse(event.body || "{}");
  if (!crop?.trim() || !note?.trim()) {
    return { statusCode: 400, body: "crop and note required" };
  }

  const type = normalizeEntryType(entryType);

  try {
    await ensureCropNotesTable();

    const res = await pool.query(
      `INSERT INTO crop_notes (crop_name, note, entry_type, completed)
       VALUES ($1, $2, $3, 0)
       RETURNING id, crop_name, note, entry_type, completed, created_at`,
      [crop.trim(), note.trim(), type]
    );

    const row = res.rows[0];
    return {
      statusCode: 200,
      body: JSON.stringify({
        ...row,
        completed: Number(row.completed) ? 1 : 0,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAuth(baseHandler);
