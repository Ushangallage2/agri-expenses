import { Handler } from "@netlify/functions";
import pool from "../../src/offline/db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
    jwt.verify(token, JWT_SECRET);

    const { id } = JSON.parse(event.body || "{}");
    if (!id) return { statusCode: 400, body: JSON.stringify({ error: "Missing id" }) };

    console.log("Deleted record:", id);
    await pool.query("DELETE FROM expenses WHERE id=$1", [id]);

    return { statusCode: 200, body: JSON.stringify({ success: true, message: "Deleted" }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};

