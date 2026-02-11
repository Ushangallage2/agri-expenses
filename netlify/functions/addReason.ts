import { Handler } from "@netlify/functions";
import pool from "../../src/offline/db";
import { requireAuth } from "../../src/utils/requireAuth";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { reason } = JSON.parse(event.body || "{}");

  if (!reason || !reason.trim()) {
    return { statusCode: 400, body: "Reason required" };
  }

  try {
    const res = await pool.query(
      `
      INSERT INTO reasons (reason)
      VALUES ($1)
      RETURNING id, reason
      `,
      [reason.trim()]
    );

    return {
      statusCode: 200,
      body: JSON.stringify(res.rows[0]),
    };
  } catch (err: any) {
    if (err.code === "23505") {
      return { statusCode: 400, body: "Reason already exists" };
    }
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAuth(baseHandler);
