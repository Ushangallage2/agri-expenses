import { Handler } from "@netlify/functions";
import pool from "./db";
import {
  ensureExpenseReceiptColumns,
  normalizeReceipt,
} from "./utils/expenseReceiptsDb";
import { isErrorResponse, requireAdminUser } from "./utils/session";
import { invalidate } from "./utils/memoryCache";

export const handler: Handler = async (event) => {
  try {
    const auth = await requireAdminUser(event);
    if (isErrorResponse(auth)) return auth;

    const { user, reason, amount, crop, date, receiptData, receiptMime } =
      JSON.parse(event.body || "{}");

    if (!user || !reason || typeof amount !== "number" || !crop)
      return { statusCode: 400, body: JSON.stringify({ error: "Missing or invalid fields" }) };

    const userRes = await pool.query(
      "SELECT id, role FROM users WHERE username=$1",
      [user]
    );
    if (userRes.rowCount === 0)
      return { statusCode: 400, body: JSON.stringify({ error: "User not found" }) };
    if (String(userRes.rows[0]?.role || "") === "observe") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Observe logins are not ledger people — pick an admin user",
        }),
      };
    }

    await ensureExpenseReceiptColumns();

    let receipt: { data: string; mime: string } | null = null;
    try {
      receipt = normalizeReceipt(receiptData, receiptMime);
    } catch (e: any) {
      return { statusCode: 400, body: JSON.stringify({ error: e.message }) };
    }

    const dateOk =
      typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
    const createdAt = dateOk ? `${date} 12:00:00` : null;

    if (receipt) {
      if (createdAt) {
        await pool.query(
          `INSERT INTO expenses (expender, reason, amount, crop, created_at, receipt_data, receipt_mime)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [user, reason, amount, crop, createdAt, receipt.data, receipt.mime]
        );
      } else {
        await pool.query(
          `INSERT INTO expenses (expender, reason, amount, crop, created_at, receipt_data, receipt_mime)
           VALUES ($1, $2, $3, $4, NOW(), $5, $6)`,
          [user, reason, amount, crop, receipt.data, receipt.mime]
        );
      }
    } else if (createdAt) {
      await pool.query(
        `INSERT INTO expenses (expender, reason, amount, crop, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [user, reason, amount, crop, createdAt]
      );
    } else {
      await pool.query(
        `INSERT INTO expenses (expender, reason, amount, crop, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [user, reason, amount, crop]
      );
    }

    invalidate("expenses:");
    return { statusCode: 200, body: JSON.stringify({ message: "Added" }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
