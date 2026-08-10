import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import { invalidate } from "./utils/memoryCache";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { id } = JSON.parse(event.body || "{}");
  if (!id) return { statusCode: 400, body: "id required" };

  try {
    await pool.query("DELETE FROM crop_notes WHERE id = $1", [id]);
    try {
      await pool.query("DELETE FROM crop_images WHERE note_id = $1", [id]);
    } catch {
      /* table may not exist yet */
    }
    invalidate("cropNotes:");
    invalidate("cropTodos:");
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAdmin(baseHandler);
