import { Handler } from "@netlify/functions";
import pool from "../../src/offline/db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    jwt.verify(token, JWT_SECRET);

    const { user, reason, amount, crop } = JSON.parse(event.body || "{}");

    if (!user || !reason || typeof amount !== "number" || !crop)
      return { statusCode: 400, body: "Missing or invalid fields" };

    // get user id
    const userRes = await pool.query("SELECT id FROM users WHERE username=$1", [user]);
    if (userRes.rowCount === 0) return { statusCode: 400, body: "User not found" };
    const user_id = userRes.rows[0].id;

    await pool.query(
      `INSERT INTO expenses (expender, reason, amount, crop, created_at) VALUES ($1,$2,$3,$4,NOW())`,
      [user, reason, amount, crop]
    );

    return { statusCode: 200, body: "Added" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};
