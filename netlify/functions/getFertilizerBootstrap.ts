import type { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";
import {
  ensureFertilizerTables,
  getPurchasePackItems,
  mapFertilizer,
  mapSchedule,
  mapStep,
  mapApplication,
} from "./utils/fertilizerDb";
import { ensureCropPlantCountColumn } from "./utils/cropPlantCountDb";
import { ensureCropStatusColumns } from "./utils/cropStatusDb";
import { getFertilizerRateConfig } from "./utils/fertilizerRateConfigDb";
import { listCropFertilizerNotes } from "./utils/cropFertilizerNotesDb";
import { cached } from "./utils/memoryCache";
import { readToken } from "./utils/session";

const JWT_SECRET = process.env.JWT_SECRET!;
const TTL_MS = 30_000;

/**
 * Single round-trip for Fertilizer page: crops, inventory, purchase pack,
 * and optional crop-scoped schedules / applications / rates.
 */
export const handler: Handler = async (event) => {
  try {
    const token = readToken(event);
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    try {
      jwt.verify(token, JWT_SECRET);
    } catch {
      return { statusCode: 401, body: "Unauthorized" };
    }

    const crop = String(event.queryStringParameters?.crop || "").trim();
    const cacheKey = crop
      ? `fertilizer:bootstrap:${crop.toLowerCase()}`
      : "fertilizer:bootstrap";

    const body = await cached(cacheKey, TTL_MS, async () => {
      await ensureFertilizerTables();
      await ensureCropPlantCountColumn();
      await ensureCropStatusColumns();

      const [cropsRes, fertRes, pack] = await Promise.all([
        pool.query(
          `SELECT id, name, plant_count, status
           FROM crops
           ORDER BY CASE WHEN status = 'closed' THEN 1 ELSE 0 END, name ASC`
        ),
        pool.query(
          `SELECT id, name, unit, stock_qty, unit_price, notes, created_at
           FROM fertilizers
           ORDER BY name ASC`
        ),
        getPurchasePackItems(),
      ]);

      const crops = cropsRes.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        plant_count: Number(r.plant_count) || 0,
        status:
          String(r.status || "active").toLowerCase() === "closed"
            ? "closed"
            : "active",
      }));

      const fertilizers = fertRes.rows.map((r) =>
        mapFertilizer(r as Record<string, unknown>)
      );

      let schedules: ReturnType<typeof mapSchedule>[] = [];
      let applications: ReturnType<typeof mapApplication>[] = [];
      let rates: unknown = null;
      let cropFertilizerNotes: Awaited<
        ReturnType<typeof listCropFertilizerNotes>
      > = [];

      if (crop) {
        const [schedRows, appRows, rateConfig, notes] = await Promise.all([
          pool.query(
            `SELECT id, crop_name, name, description, is_working, created_at
             FROM fertilizer_schedules
             WHERE crop_name = $1
             ORDER BY is_working DESC, name ASC, id ASC`,
            [crop]
          ),
          pool.query(
            `SELECT a.id, a.crop_name, a.fertilizer_id, f.name AS fertilizer_name,
                    a.amount, a.unit, a.applied_at, a.notes, a.schedule_step_id,
                    a.created_by, a.created_at
             FROM fertilizer_applications a
             LEFT JOIN fertilizers f ON f.id = a.fertilizer_id
             WHERE a.crop_name = $1
             ORDER BY a.applied_at DESC, a.id DESC
             LIMIT 200`,
            [crop]
          ),
          getFertilizerRateConfig(crop),
          listCropFertilizerNotes(crop),
        ]);

        for (const row of schedRows.rows) {
          const steps = await pool.query(
            `SELECT id, schedule_id, step_order, week_number, title, instructions,
                    suggested_fertilizer_id, suggested_amount, unit, interval_days
             FROM fertilizer_schedule_steps
             WHERE schedule_id = $1
             ORDER BY step_order ASC, id ASC`,
            [row.id]
          );
          schedules.push(
            mapSchedule(
              row as Record<string, unknown>,
              steps.rows.map((s) => mapStep(s as Record<string, unknown>))
            )
          );
        }

        applications = appRows.rows.map((r) =>
          mapApplication(r as Record<string, unknown>)
        );
        rates = rateConfig;
        cropFertilizerNotes = notes;
      }

      return JSON.stringify({
        crops,
        fertilizers,
        purchasePack: { items: pack },
        schedules,
        applications,
        rates,
        cropFertilizerNotes,
        crop: crop || null,
      });
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=15",
      },
      body,
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};
