import { Handler } from "@netlify/functions";
import pool from "./db";
import { requireAdmin } from "../../src/utils/requireAuth";
import { invalidate } from "./utils/memoryCache";
import { ensureCropStatusColumns } from "./utils/cropStatusDb";
import { ensureCropPlantCountColumn } from "./utils/cropPlantCountDb";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { name } = JSON.parse(event.body || "{}");

  if (!name || !name.trim()) {
    return { statusCode: 400, body: "Crop name required" };
  }

  try {
    await ensureCropPlantCountColumn();
    await ensureCropStatusColumns();

    const res = await pool.query(
      `
      INSERT INTO crops (name)
      VALUES ($1)
      RETURNING id, name
      `,
      [name.trim()]
    );

    invalidate("crops:");
    return {
      statusCode: 200,
      body: JSON.stringify({
        ...res.rows[0],
        plant_count: 0,
        status: "active",
      }),
    };
  } catch (err: any) {
    if (err.code === "23505" || err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
      return { statusCode: 400, body: "Crop already exists" };
    }
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAdmin(baseHandler);
