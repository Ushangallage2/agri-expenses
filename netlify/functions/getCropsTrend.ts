import { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };

    jwt.verify(token, JWT_SECRET);

    const res = await pool.query(`
      SELECT
        crop,
        DATE(created_at) as date,
        SUM(amount) as total
      FROM expenses
      GROUP BY crop, DATE(created_at)
      ORDER BY date ASC;
    `);

    return {
      statusCode: 200,
      body: JSON.stringify(res.rows),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 401, body: "Unauthorized" };
  }
};
