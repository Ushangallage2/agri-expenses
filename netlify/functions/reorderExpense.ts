import type { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

function toMysqlDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * List is newest-first. beforeId = row above (newer), afterId = row below (older).
 * We set created_at to sit strictly between those timestamps so sort + charts follow.
 */
function computeStamp(beforeAt: Date | null, afterAt: Date | null): Date {
  if (beforeAt && afterAt) {
    const bt = beforeAt.getTime();
    const at = afterAt.getTime();
    if (bt <= at) {
      // Neighbors out of order — place just after the newer of the two
      return new Date(Math.max(bt, at) + 1000);
    }
    const mid = Math.floor((bt + at) / 2);
    if (mid > at && mid < bt) return new Date(mid);
    // Same second / no room — nudge 1s below the newer neighbor
    return new Date(bt - 1000);
  }
  if (beforeAt && !afterAt) {
    // Dropped at bottom → older than last row
    return new Date(beforeAt.getTime() - 60_000);
  }
  if (!beforeAt && afterAt) {
    // Dropped at top → newer than first row
    return new Date(Math.max(Date.now(), afterAt.getTime() + 60_000));
  }
  return new Date();
}

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) {
      return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
    }
    jwt.verify(token, JWT_SECRET);

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const { id, beforeId, afterId } = JSON.parse(event.body || "{}");
    if (!id) {
      return { statusCode: 400, body: JSON.stringify({ error: "id required" }) };
    }

    let beforeAt: Date | null = null;
    let afterAt: Date | null = null;

    if (beforeId) {
      const r = await pool.query(
        `SELECT created_at FROM expenses WHERE id = $1`,
        [beforeId]
      );
      if (r.rowCount) beforeAt = new Date(r.rows[0].created_at);
    }
    if (afterId) {
      const r = await pool.query(
        `SELECT created_at FROM expenses WHERE id = $1`,
        [afterId]
      );
      if (r.rowCount) afterAt = new Date(r.rows[0].created_at);
    }

    const stamp = computeStamp(beforeAt, afterAt);
    const mysql = toMysqlDateTime(stamp);

    await pool.query(`UPDATE expenses SET created_at = $1 WHERE id = $2`, [
      mysql,
      id,
    ]);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        id,
        created_at: stamp.toISOString(),
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
