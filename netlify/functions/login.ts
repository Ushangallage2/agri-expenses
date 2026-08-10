import type { Handler, HandlerResponse } from "@netlify/functions";
import pool from "./db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ensureUsersRoleColumn } from "./utils/usersDb";
import { normalizeRole } from "../../src/utils/roles";

const JWT_SECRET = process.env.JWT_SECRET!;

function response(
  statusCode: number,
  body: string,
  headers: Record<string, string> = {}
): HandlerResponse {
  return { statusCode, body, headers };
}

export const handler: Handler = async (event) => {
  const origin = event.headers.origin || "http://localhost:5173";
  const isDev = process.env.NODE_ENV !== "production";

  const baseHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };

  // ✅ CORS preflight
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

  const { username, password } = JSON.parse(event.body || "{}");

  if (!username || !password) {
    return response(400, "Username and password required", baseHeaders);
  }

  try {
    if (!JWT_SECRET?.trim()) {
      console.error("LOGIN ERROR: JWT_SECRET is not set");
      return response(500, "Server misconfigured (JWT)", baseHeaders);
    }

    const dbUrl = (process.env.DATABASE_URL || "").trim();
    if (!dbUrl) {
      console.error("LOGIN ERROR: DATABASE_URL is not set");
      return response(500, "Server misconfigured (database)", baseHeaders);
    }
    if (/^postgres(ql)?:\/\//i.test(dbUrl)) {
      console.error("LOGIN ERROR: DATABASE_URL is postgres but app expects mysql");
      return response(500, "Server misconfigured (database type)", baseHeaders);
    }

    await ensureUsersRoleColumn();

    const res = await pool.query(
      "SELECT id, username, password, role FROM users WHERE username = $1",
      [username]
    );

    if (res.rowCount === 0) {
      return response(401, "Invalid credentials", baseHeaders);
    }

    const user = res.rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return response(401, "Invalid credentials", baseHeaders);
    }

    const role = normalizeRole(user.role);

    const token = jwt.sign(
      { id: user.id, username: user.username, role },
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
        role,
      }),
      {
        ...baseHeaders,
        "Set-Cookie": cookie,
      }
    );
  } catch (err: any) {
    console.error("LOGIN ERROR:", err?.code || err?.message || err);
    return response(500, "Server error", baseHeaders);
  }
};
