import type { Handler, HandlerContext } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  ensureFertilizerTables,
  mapApplication,
} from "./utils/fertilizerDb";
import { completeFertilizerDueTodo } from "./utils/fertilizerDueTodos";
import { invalidate } from "./utils/memoryCache";

type SkipLine = {
  fertilizerId?: number;
  fertilizer_id?: number;
  fertilizerName?: string;
  fertilizer_name?: string;
  remaining?: number;
  total?: number;
};

/**
 * Close an incomplete apply round without putting fertilizer on the
 * remaining plants (growth / skip decision). Writes zero-stock usage
 * rows that complete [treated:N/M] progress and clears FINISH REST todos.
 */
const baseHandler: Handler = async (event, context: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const cropName = String(body.cropName ?? body.crop_name ?? "").trim();
  const weekNumberRaw = body.weekNumber ?? body.week_number;
  const weekNumber =
    weekNumberRaw != null && Number.isFinite(Number(weekNumberRaw))
      ? Math.floor(Number(weekNumberRaw))
      : null;
  const weekLabel = body.weekLabel != null ? String(body.weekLabel) : "";
  const lines = (Array.isArray(body.lines) ? body.lines : []) as SkipLine[];
  const appliedRaw = String(body.appliedAt ?? body.applied_at ?? "").trim();

  let appliedAt: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(appliedRaw)) {
    appliedAt = `${appliedRaw} 12:00:00`;
  } else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(appliedRaw)) {
    appliedAt = appliedRaw.replace("T", " ").slice(0, 19);
  } else {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    appliedAt = `${y}-${m}-${day} 12:00:00`;
  }

  if (!cropName) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "cropName required" }),
    };
  }
  if (weekNumber == null) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "weekNumber required" }),
    };
  }
  if (!lines.length) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "lines required" }),
    };
  }

  const user = (context as { user?: { username?: string } }).user;
  const createdBy = user?.username || null;

  try {
    await ensureFertilizerTables();

    const batchId = `${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const applications = [];

    for (const line of lines) {
      const remaining = Math.max(0, Math.floor(Number(line.remaining) || 0));
      const total = Math.max(0, Math.floor(Number(line.total) || 0));
      if (!(remaining > 0) || !(total > 0)) continue;

      let fertRow: { id: number; name: string } | null = null;
      const fid = Number(line.fertilizerId ?? line.fertilizer_id);
      const fname = String(
        line.fertilizerName ?? line.fertilizer_name ?? ""
      ).trim();

      if (Number.isFinite(fid) && fid > 0) {
        const r = await pool.query(
          `SELECT id, name FROM fertilizers WHERE id = $1`,
          [fid]
        );
        if (r.rows[0]) {
          fertRow = {
            id: Number(r.rows[0].id),
            name: String(r.rows[0].name),
          };
        }
      } else if (fname) {
        const r = await pool.query(
          `SELECT id, name FROM fertilizers WHERE name = $1`,
          [fname]
        );
        if (r.rows[0]) {
          fertRow = {
            id: Number(r.rows[0].id),
            name: String(r.rows[0].name),
          };
        }
      }

      if (!fertRow) {
        return {
          statusCode: 404,
          body: JSON.stringify({
            error: `Fertilizer not found: ${fname || fid}`,
          }),
        };
      }

      const weekTag = `[week:${weekNumber}]`;
      const coverage = `[treated:${remaining}/${total}]`;
      const notes = [
        weekTag,
        `[batch:${batchId}-skip-${fertRow.id}]`,
        coverage,
        `[finish_anyway]`,
        `Finish anyway — skipped ${remaining} plant(s)`,
        weekLabel || null,
        cropName,
      ]
        .filter(Boolean)
        .join(" ");

      const inserted = await pool.query(
        `INSERT INTO fertilizer_applications
          (crop_name, fertilizer_id, amount, unit, applied_at, notes, schedule_step_id, created_by,
           unit_price, line_cost, stock_deducted)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, $10)
         RETURNING id, crop_name, fertilizer_id, amount, unit, applied_at, notes,
                   schedule_step_id, created_by, created_at,
                   unit_price, line_cost, stock_deducted`,
        [
          cropName,
          fertRow.id,
          0,
          "skip",
          appliedAt,
          notes,
          createdBy,
          0,
          0,
          0,
        ]
      );

      applications.push(
        mapApplication({
          ...(inserted.rows[0] as Record<string, unknown>),
          fertilizer_name: fertRow.name,
        })
      );
    }

    if (!applications.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Nothing to finish — no remaining plants on those lines",
        }),
      };
    }

    try {
      await completeFertilizerDueTodo(cropName, weekNumber);
    } catch (e) {
      console.error("finish anyway due todo:", e);
    }

    invalidate("fertilizers:");
    invalidate("fertilizer:");
    invalidate("dashboard:");
    invalidate("cropTodos:");
    invalidate("cropNotes:");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applications,
        skipped: applications.length,
        weekNumber,
      }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" }),
    };
  }
};

export const handler = requireAdmin(baseHandler);
