import { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";
import { ensureCropPlantCountColumn } from "./utils/cropPlantCountDb";
import { cached } from "./utils/memoryCache";

const JWT_SECRET = process.env.JWT_SECRET!;
const TTL_MS = 30_000;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };

    jwt.verify(token, JWT_SECRET);

    const body = await cached("crops:list", TTL_MS, async () => {
      await ensureCropPlantCountColumn();

      const res = await pool.query(
        `SELECT id, name, plant_count FROM crops ORDER BY name ASC`
      );

      return JSON.stringify(
        res.rows.map((r: any) => ({
          ...r,
          plant_count: Number(r.plant_count) || 0,
        }))
      );
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body,
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 401, body: "Unauthorized" };
  }
};
