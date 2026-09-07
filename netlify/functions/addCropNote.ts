import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  ensureCropNotesTable,
  normalizeEntryType,
  parsePlantNumber,
} from "./utils/cropNotesDb";
import { assertWritablePlant } from "./utils/plantMapDb";
import { invalidate } from "./utils/memoryCache";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { crop, note, entryType, plantNumber } = JSON.parse(event.body || "{}");
  if (!crop?.trim() || !note?.trim()) {
    return { statusCode: 400, body: "crop and note required" };
  }

  const type = normalizeEntryType(entryType);
  const plant = parsePlantNumber(plantNumber);

  try {
    await ensureCropNotesTable();

    if (plant != null) {
      const check = await assertWritablePlant(crop.trim(), plant);
      if (!check.ok) {
        return { statusCode: check.status, body: check.body };
      }
    }

    const res = await pool.query(
      `INSERT INTO crop_notes (crop_name, note, entry_type, completed, plant_number)
       VALUES ($1, $2, $3, 0, $4)
       RETURNING id, crop_name, note, entry_type, completed, plant_number, created_at`,
      [crop.trim(), note.trim(), type, plant]
    );

    const row = res.rows[0];
    invalidate("cropNotes:");
    invalidate("cropTodos:");
    invalidate("plantMap:");
    return {
      statusCode: 200,
      body: JSON.stringify({
        ...row,
        completed: Number(row.completed) ? 1 : 0,
        plant_number:
          row.plant_number == null ? null : Number(row.plant_number) || null,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAdmin(baseHandler);
