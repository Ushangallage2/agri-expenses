import { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie
      ?.split(";")
      .map(c => c.trim())
      .find(c => c.startsWith("token="))
      ?.split("=")[1];

    if (!token) {
      return { statusCode: 401, body: "Unauthorized" };
    }

    jwt.verify(token, JWT_SECRET);

    const res = await pool.query(
      `SELECT DISTINCT amount FROM saved_amounts ORDER BY amount ASC`
    );

    // ✅ map the correct column
    const amounts = res.rows.map(r => Number(r.amount));
   
    return {
      statusCode: 200,
      body: JSON.stringify(amounts),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};
