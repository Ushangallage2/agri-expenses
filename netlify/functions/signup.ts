import type { Handler, HandlerResponse } from "@netlify/functions";
import pool from "./db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ensureUsersRoleColumn } from "./utils/usersDb";
import { ensureFarmsSchema, createFarm } from "./utils/farmsDb";

const JWT_SECRET = process.env.JWT_SECRET!;

function response(
  statusCode: number,
  body: string,
  headers: Record<string, string> = {}
): HandlerResponse {
  return { statusCode, body, headers };
}

/**
 * Self-service account creation for the seller-production product.
 *
 * Creates a brand-new farm (tenant) plus its first admin user, then logs that
 * user in by setting the same auth cookie as `login`. Anyone can call this; it
 * is how a new farmer onboards without an existing admin.
 */
export const handler: Handler = async (event) => {
  const origin = event.headers.origin || "http://localhost:5173";
  const isDev = process.env.NODE_ENV !== "production";

  const baseHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return response(204, "", {
      ...baseHeaders,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    });
  }

  if (event.httpMethod !== "POST") {
    return response(405, "Method Not Allowed", baseHeaders);
  }

  if (!JWT_SECRET?.trim()) {
    console.error("SIGNUP ERROR: JWT_SECRET is not set");
    return response(500, "Server misconfigured (JWT)", baseHeaders);
  }

  let farmName = "";
  let username = "";
  let password = "";
  try {
    let raw = event.body || "{}";
    if (event.isBase64Encoded && event.body) {
      raw = Buffer.from(event.body, "base64").toString("utf8");
    }
    const parsed =
      typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown>);
    farmName = String(parsed?.farmName || "").trim();
    username = String(parsed?.username || "").trim();
    password = String(parsed?.password || "");
  } catch {
    return response(400, "Invalid request body", baseHeaders);
  }

  if (!username || !password) {
    return response(400, "Username and password are required", baseHeaders);
  }
  if (String(password).length < 6) {
    return response(400, "Password must be at least 6 characters", baseHeaders);
  }

  try {
    await ensureUsersRoleColumn();
    await ensureFarmsSchema();

    // Usernames are globally unique in the current schema — reject early with a
    // clear message instead of a raw duplicate-key error.
    const existing = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    if ((existing.rowCount ?? 0) > 0) {
      return response(409, "That username is already taken", baseHeaders);
    }

    const farmId = await createFarm(farmName || `${username}'s Farm`);
    const hash = await bcrypt.hash(password, 10);

    const inserted = await pool.query(
      `INSERT INTO users (username, password, role, farm_id)
       VALUES ($1, $2, 'admin', $3)`,
      [username, hash, farmId]
    );
    const userId = Number(inserted.insertId);
    const fetched = await pool.query(
      `SELECT id, username, role, farm_id FROM users WHERE id = $1`,
      [userId]
    );
    const user = fetched.rows[0] as {
      id: number;
      username: string;
      role: string;
      farm_id: number;
    };
    if (!user) throw new Error("Failed to load created user");

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: "admin",
        farmId: Number(user.farm_id),
      },
      JWT_SECRET,
      { expiresIn: "120m" }
    );

    const cookie = [
      `token=${token}`,
      "HttpOnly",
      "SameSite=Strict",
      "Path=/",
      "Max-Age=604800",
      !isDev && "Secure",
    ]
      .filter(Boolean)
      .join("; ");

    return response(
      200,
      JSON.stringify({
        success: true,
        username: user.username,
        role: "admin",
        farmId: Number(user.farm_id),
        farmName: farmName || `${username}'s Farm`,
      }),
      { ...baseHeaders, "Set-Cookie": cookie }
    );
  } catch (err: any) {
    if (
      err.code === "23505" ||
      err.code === "ER_DUP_ENTRY" ||
      err.errno === 1062
    ) {
      return response(409, "That username is already taken", baseHeaders);
    }
    console.error("SIGNUP ERROR:", err?.code || err?.errno || err?.message || err);
    const code = err?.code || err?.errno;
    return response(
      500,
      code ? `Server error (${code})` : "Server error",
      baseHeaders
    );
  }
};
