import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import { invalidate } from "./utils/memoryCache";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { name } = JSON.parse(event.body || "{}");
  if (!name || !String(name).trim()) {
    return { statusCode: 400, body: "Crop name required" };
  }

  try {
    const cropName = String(name).trim();
    const res = await pool.query("DELETE FROM crops WHERE name = $1", [cropName]);

    if (!res.rowCount) {
      return { statusCode: 404, body: "Crop not found" };
    }

    // Clean up notes for this crop (ledger rows keep the crop name string)
    try {
      await pool.query("DELETE FROM crop_notes WHERE crop_name = $1", [cropName]);
    } catch {
      /* table may not exist yet */
    }

    try {
      await pool.query("DELETE FROM crop_images WHERE crop_name = $1", [cropName]);
    } catch {
      /* table may not exist yet */
    }

    try {
      await pool.query(
        "DELETE FROM crop_plant_count_history WHERE crop_name = $1",
        [cropName]
      );
    } catch {
      /* table may not exist yet */
    }

    invalidate("crops:");
    invalidate("cropNotes:");
    invalidate("cropTodos:");
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, name: cropName }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAdmin(baseHandler);
