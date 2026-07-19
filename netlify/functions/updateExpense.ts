import type { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

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

    const { id, user, reason, amount, crop, date } = JSON.parse(event.body || "{}");

    if (!id || !user || !reason || typeof amount !== "number" || !crop) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing or invalid fields" }),
      };
    }

    const userRes = await pool.query("SELECT id FROM users WHERE username=$1", [
      user,
    ]);
    if (userRes.rowCount === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "User not found" }),
      };
    }

    const dateOk =
      typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);

    if (dateOk) {
      await pool.query(
        `UPDATE expenses
         SET expender = $1, reason = $2, amount = $3, crop = $4, created_at = $5
         WHERE id = $6`,
        [user, reason, amount, crop, `${date} 12:00:00`, id]
      );
    } else {
      await pool.query(
        `UPDATE expenses
         SET expender = $1, reason = $2, amount = $3, crop = $4
         WHERE id = $5`,
        [user, reason, amount, crop, id]
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: "Updated" }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
