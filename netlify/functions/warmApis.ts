import type { Handler } from "@netlify/functions";
import pool from "./db";

/**
 * Dedicated scheduled warmer. Do NOT attach schedules to user-facing
 * bootstrap handlers — Netlify often returns 403 for public HTTP on
 * functions that also have a cron schedule.
 */
export const handler: Handler = async () => {
  try {
    await pool.query("SELECT 1");
    return { statusCode: 204, body: "" };
  } catch (err) {
    console.error("warmApis:", err);
    return { statusCode: 500, body: "Warm failed" };
  }
};
