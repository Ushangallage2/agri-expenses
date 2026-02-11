import { Handler } from "@netlify/functions";
import pool from "../../src/offline/db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    jwt.verify(token, JWT_SECRET);

    const { id, crop } = JSON.parse(event.body || "{}");
    if (!id || !crop) return { statusCode: 400, body: "Missing fields" };

    await pool.query("UPDATE expenses SET crop=$1 WHERE id=$2", [crop, id]);
    return { statusCode: 200, body: "Updated" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};
