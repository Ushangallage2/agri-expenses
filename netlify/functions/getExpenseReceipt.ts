import type { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";
import { ensureExpenseReceiptColumns } from "./utils/expenseReceiptsDb";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    jwt.verify(token, JWT_SECRET);

    const id = event.queryStringParameters?.id;
    if (!id) {
      return { statusCode: 400, body: JSON.stringify({ error: "id required" }) };
    }

    await ensureExpenseReceiptColumns();
    const res = await pool.query(
      `SELECT id, receipt_data, receipt_mime
       FROM expenses
       WHERE id = $1`,
      [id]
    );

    if (!res.rowCount || !res.rows[0].receipt_data) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "No receipt for this record" }),
      };
    }

    const row = res.rows[0];
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        receipt_data: row.receipt_data,
        receipt_mime: row.receipt_mime || "image/jpeg",
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
