import { Handler } from "@netlify/functions";
import pool from "./db";
import { isErrorResponse, requireAdminUser } from "./utils/session";
import { invalidate } from "./utils/memoryCache";

export const handler: Handler = async (event) => {
  try {
    const auth = await requireAdminUser(event);
    if (isErrorResponse(auth)) return auth;

    const { id, crop } = JSON.parse(event.body || "{}");
    if (!id || !crop) return { statusCode: 400, body: "Missing fields" };

    await pool.query("UPDATE expenses SET crop=$1 WHERE id=$2", [crop, id]);
    invalidate("expenses:");
    return { statusCode: 200, body: "Updated" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};
