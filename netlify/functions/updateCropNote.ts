import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import { ensureCropNotesTable } from "./utils/cropNotesDb";
import { invalidate } from "./utils/memoryCache";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { id, completed } = JSON.parse(event.body || "{}");
  const noteId = Number(id);
  if (!Number.isFinite(noteId) || noteId <= 0) {
    return { statusCode: 400, body: "id required" };
  }

  const done = completed === true || completed === 1 || completed === "1" ? 1 : 0;

  try {
    await ensureCropNotesTable();

    const res = await pool.query(
      `UPDATE crop_notes SET completed = $1 WHERE id = $2 AND entry_type = 'todo'`,
      [done, noteId]
    );

    if (!res.rowCount) {
      return { statusCode: 404, body: "Todo not found" };
    }

    invalidate("cropNotes:");
    invalidate("cropTodos:");
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: noteId, completed: done }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAdmin(baseHandler);
