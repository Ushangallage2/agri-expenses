import type { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { reason } = JSON.parse(event.body || "{}");
  if (!reason || !String(reason).trim()) {
    return { statusCode: 400, body: "Reason required" };
  }

  try {
    const value = String(reason).trim();
    const res = await pool.query("DELETE FROM reasons WHERE reason = $1", [value]);

    if (!res.rowCount) {
      return { statusCode: 404, body: "Reason not found" };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, reason: value }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAdmin(baseHandler);
