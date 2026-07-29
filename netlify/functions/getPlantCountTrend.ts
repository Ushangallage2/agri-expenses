import type { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";
import { ensureCropPlantCountColumn } from "./utils/cropPlantCountDb";
import { ensureCropPlantCountHistoryTable } from "./utils/cropPlantCountHistoryDb";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    jwt.verify(token, JWT_SECRET);

    await ensureCropPlantCountColumn();
    await ensureCropPlantCountHistoryTable();

    // Seed history for crops that already have a plant count but no history rows yet
    const crops = await pool.query(
      `SELECT name, plant_count FROM crops WHERE plant_count IS NOT NULL`
    );
    for (const row of crops.rows) {
      const name = String(row.name);
      const count = Number(row.plant_count) || 0;
      const existing = await pool.query(
        `SELECT id FROM crop_plant_count_history WHERE crop_name = $1 LIMIT 1`,
        [name]
      );
      if (!existing.rowCount) {
        await pool.query(
          `INSERT INTO crop_plant_count_history (crop_name, plant_count)
           VALUES ($1, $2)`,
          [name, count]
        );
      }
    }

    const res = await pool.query(`
      SELECT
        crop_name AS crop,
        plant_count,
        recorded_at AS date
      FROM crop_plant_count_history
      ORDER BY recorded_at ASC
    `);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        res.rows.map((r) => ({
          crop: r.crop,
          plant_count: Number(r.plant_count) || 0,
          date: r.date,
        }))
      ),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 401, body: "Unauthorized" };
  }
};
