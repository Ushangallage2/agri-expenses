import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import { invalidate } from "./utils/memoryCache";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { username } = JSON.parse(event.body || "{}");
  if (!username || !String(username).trim()) {
    return { statusCode: 400, body: "Username required" };
  }

  try {
    const name = String(username).trim();
    const res = await pool.query("DELETE FROM users WHERE username = $1", [name]);

    if (!res.rowCount) {
      return { statusCode: 404, body: "User not found" };
    }

    invalidate("users:");
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, username: name }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAdmin(baseHandler);
