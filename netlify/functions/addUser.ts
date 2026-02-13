import { Handler } from "@netlify/functions";
import pool from "./db";
import bcrypt from "bcryptjs";
import { requireAuth } from "../../src/utils/requireAuth";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { username, password } = JSON.parse(event.body || "{}");

  if (!username || !password) {
    return { statusCode: 400, body: "Username and password required" };
  }

  try {
    const hash = await bcrypt.hash(password, 10);

    const res = await pool.query(
      `
      INSERT INTO users (username, password)
      VALUES ($1, $2)
      RETURNING id, username
      `,
      [username, hash]
    );

    return {
      statusCode: 200,
      body: JSON.stringify(res.rows[0]),
    };
  } catch (err: any) {
    if (err.code === "23505") {
      return { statusCode: 400, body: "Username already exists" };
    }
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAuth(baseHandler);
