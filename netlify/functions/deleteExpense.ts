import { Handler } from "@netlify/functions";
import pool from "./db";
import { isErrorResponse, requireAdminUser } from "./utils/session";
import { invalidate } from "./utils/memoryCache";

export const handler: Handler = async (event) => {
  try {
    const auth = await requireAdminUser(event);
    if (isErrorResponse(auth)) return auth;

    const { id } = JSON.parse(event.body || "{}");
    if (!id) return { statusCode: 400, body: JSON.stringify({ error: "Missing id" }) };

    console.log("Deleted record:", id);
    await pool.query("DELETE FROM expenses WHERE id=$1", [id]);

    invalidate("expenses:");
    invalidate("dashboard:");
    return { statusCode: 200, body: JSON.stringify({ success: true, message: "Deleted" }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};

