import type { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";
import { ensureExpenseReceiptColumns } from "./utils/expenseReceiptsDb";
import { ensureCropPlantCountColumn } from "./utils/cropPlantCountDb";
import { ensureCropStatusColumns } from "./utils/cropStatusDb";
import { ensureUsersRoleColumn } from "./utils/usersDb";
import { ensureCropNotesTable } from "./utils/cropNotesDb";
import { syncFertilizerDueTodos } from "./utils/fertilizerDueTodos";
import { cached } from "./utils/memoryCache";

const JWT_SECRET = process.env.JWT_SECRET!;
const TTL_MS = 30_000;

function isScheduledWarm(event: {
  body?: string | null;
  headers?: Record<string, string | undefined>;
}) {
  const h = event.headers || {};
  if (
    String(h["x-netlify-event"] || h["X-Netlify-Event"] || "").toLowerCase() ===
    "schedule"
  ) {
    return true;
  }
  try {
    const body = JSON.parse(event.body || "{}");
    return Boolean(body?.next_run);
  } catch {
    return false;
  }
}

/**
 * Single round-trip for Dashboard: users, reasons, crops, expenses,
 * amounts, open todo counts. Also used on a free schedule to reduce cold starts.
 */
export const handler: Handler = async (event) => {
  try {
    if (isScheduledWarm(event)) {
      await pool.query("SELECT 1");
      return { statusCode: 204, body: "" };
    }

    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    jwt.verify(token, JWT_SECRET);

    const body = await cached("dashboard:bootstrap", TTL_MS, async () => {
      await Promise.all([
        ensureUsersRoleColumn(),
        ensureCropPlantCountColumn(),
        ensureCropStatusColumns(),
        ensureExpenseReceiptColumns(),
        ensureCropNotesTable(),
      ]);

      try {
        await syncFertilizerDueTodos();
      } catch (syncErr) {
        console.error("fertilizer due sync:", syncErr);
      }

      const [usersRes, reasonsRes, cropsRes, expensesRes, amountsRes, todosRes] =
        await Promise.all([
          pool.query(
            `SELECT username FROM users
             WHERE COALESCE(role, 'admin') <> 'observe'
             ORDER BY username ASC`
          ),
          pool.query(
            `SELECT DISTINCT reason FROM reasons ORDER BY reason ASC`
          ),
          pool.query(
            `SELECT id, name, plant_count, status, closed_at,
                    closed_plant_count, closed_income, closed_expense, closed_profit
             FROM crops
             ORDER BY CASE WHEN status = 'closed' THEN 1 ELSE 0 END, name ASC`
          ),
          pool.query(`
            SELECT
              e.id,
              e.amount,
              e.reason,
              e.expender,
              e.crop,
              e.created_at,
              CASE
                WHEN e.receipt_data IS NOT NULL AND e.receipt_data != '' THEN 1
                ELSE 0
              END AS has_receipt
            FROM expenses e
            ORDER BY e.created_at DESC, e.id DESC
          `),
          pool.query(
            `SELECT DISTINCT amount FROM saved_amounts ORDER BY amount ASC`
          ),
          pool.query(
            `SELECT crop_name, COUNT(*) AS open_todos
             FROM crop_notes
             WHERE entry_type = 'todo' AND completed = 0
             GROUP BY crop_name`
          ),
        ]);

      const payload = {
        users: usersRes.rows.map((r: any) => r.username as string),
        reasons: reasonsRes.rows.map((r: any) => r.reason as string),
        crops: cropsRes.rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          plant_count: Number(r.plant_count) || 0,
          status:
            String(r.status || "active").toLowerCase() === "closed"
              ? "closed"
              : "active",
          closed_at: r.closed_at || null,
          closed_plant_count:
            r.closed_plant_count == null
              ? null
              : Number(r.closed_plant_count) || 0,
          closed_income:
            r.closed_income == null ? null : Number(r.closed_income) || 0,
          closed_expense:
            r.closed_expense == null ? null : Number(r.closed_expense) || 0,
          closed_profit:
            r.closed_profit == null ? null : Number(r.closed_profit) || 0,
        })),
        expenses: expensesRes.rows.map((r: any) => ({
          ...r,
          has_receipt: Boolean(Number(r.has_receipt)),
        })),
        amounts: amountsRes.rows.map((r: any) => Number(r.amount)),
        todoCounts: todosRes.rows.map((r: any) => ({
          crop_name: r.crop_name as string,
          open_todos: Number(r.open_todos) || 0,
        })),
      };

      return JSON.stringify(payload);
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // Hint only — real SWR is client sessionStorage (auth cookies).
        "Cache-Control": "private, max-age=15",
      },
      body,
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 401, body: "Unauthorized" };
  }
};
