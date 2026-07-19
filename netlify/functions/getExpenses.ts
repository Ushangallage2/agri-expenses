import { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";
import { ensureExpenseReceiptColumns } from "./utils/expenseReceiptsDb";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };

    jwt.verify(token, JWT_SECRET);

    await ensureExpenseReceiptColumns();

    const res = await pool.query(`
      SELECT
        e.id,
        e.amount,
        e.reason,
        e.expender,
        e.crop,
        e.created_at,
        CASE
          WHEN e.receipt_data IS NOT NULL AND e.receipt_data != '' THEN 1
          ELSE 0
        END AS has_receipt
      FROM expenses e
      ORDER BY e.created_at DESC, e.id DESC;
    `);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        res.rows.map((r: any) => ({
          ...r,
          has_receipt: Boolean(Number(r.has_receipt)),
        }))
      ),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 401, body: "Unauthorized" };
  }
};
