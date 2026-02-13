import { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body:  JSON.stringify("Unauthorized") };
    jwt.verify(token, JWT_SECRET);

    const res = await pool.query("SELECT username FROM users ORDER BY username ASC");
    const users = res.rows.map(r => r.username);

    return { statusCode: 200, body: JSON.stringify(users) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body:  JSON.stringify ("Server error") };
  }
};
