import { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";
import { ensureCropPlantCountColumn } from "./utils/cropPlantCountDb";
import { ensureCropStatusColumns } from "./utils/cropStatusDb";
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
      await ensureCropStatusColumns();

      const res = await pool.query(
        `SELECT id, name, plant_count, status, closed_at,
                closed_plant_count, closed_income, closed_expense, closed_profit
         FROM crops
         ORDER BY CASE WHEN status = 'closed' THEN 1 ELSE 0 END, name ASC`
      );

      return JSON.stringify(
        res.rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          plant_count: Number(r.plant_count) || 0,
          status: String(r.status || "active").toLowerCase() === "closed"
            ? "closed"
            : "active",
          closed_at: r.closed_at || null,
          closed_plant_count:
            r.closed_plant_count == null
              ? null
              : Number(r.closed_plant_count) || 0,
          closed_income:
            r.closed_income == null ? null : Number(r.closed_income) || 0,
          closed_expense:
            r.closed_expense == null ? null : Number(r.closed_expense) || 0,
          closed_profit:
            r.closed_profit == null ? null : Number(r.closed_profit) || 0,
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
