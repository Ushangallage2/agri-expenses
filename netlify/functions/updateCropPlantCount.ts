import type { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";
import { ensureCropPlantCountColumn } from "./utils/cropPlantCountDb";
import { recordPlantCountHistory } from "./utils/cropPlantCountHistoryDb";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) {
      return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
    }
    jwt.verify(token, JWT_SECRET);

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const { crop, plantCount } = JSON.parse(event.body || "{}");
    const name = typeof crop === "string" ? crop.trim() : "";
    const count = Number(plantCount);

    if (!name) {
      return { statusCode: 400, body: JSON.stringify({ error: "Crop required" }) };
    }
    if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Plant count must be a whole number ≥ 0" }),
      };
    }

    await ensureCropPlantCountColumn();

    const res = await pool.query(
      `UPDATE crops SET plant_count = $1 WHERE name = $2`,
      [count, name]
    );

    if (!res.rowCount) {
      return { statusCode: 404, body: JSON.stringify({ error: "Crop not found" }) };
    }

    await recordPlantCountHistory(name, count);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, crop: name, plant_count: count }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
