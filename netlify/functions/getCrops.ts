import { Handler } from "@netlify/functions";
import pool from "../../src/offline/db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };

    jwt.verify(token, JWT_SECRET);

    const res = await pool.query(
      "SELECT id, name FROM crops ORDER BY name ASC"
    );

    return {
      statusCode: 200,
      body: JSON.stringify(res.rows),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 401, body: "Unauthorized" };
  }
};
