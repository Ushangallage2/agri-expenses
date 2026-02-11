import { Handler } from "@netlify/functions";
import pool from "../../src/offline/db";
import { requireAuth } from "../../src/utils/requireAuth";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { name } = JSON.parse(event.body || "{}");

  if (!name || !name.trim()) {
    return { statusCode: 400, body: "Crop name required" };
  }

  try {
    const res = await pool.query(
      `
      INSERT INTO crops (name)
      VALUES ($1)
      RETURNING id, name
      `,
      [name.trim()]
    );

    return {
      statusCode: 200,
      body: JSON.stringify(res.rows[0]),
    };
  } catch (err: any) {
    if (err.code === "23505") {
      return { statusCode: 400, body: "Crop already exists" };
    }
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAuth(baseHandler);
