import type { HandlerEvent, HandlerResponse } from "@netlify/functions";
import jwt from "jsonwebtoken";
import {
  authUserFromJwt,
  ensureUsersRoleColumn,
  type AuthUser,
} from "./usersDb";
import pool from "../db";
import { normalizeRole } from "../../../src/utils/roles";

const JWT_SECRET = process.env.JWT_SECRET!;

export function readToken(event: HandlerEvent): string | null {
  const cookie = event.headers.cookie || event.headers.Cookie || "";
  const match = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("token="));
  if (!match) return null;
  return match.slice("token=".length) || null;
}

/** JWT payload only (fast). Prefer resolveAuthUser when role may be stale. */
export function readAuthUser(event: HandlerEvent): AuthUser | null {
  const token = readToken(event);
  if (!token || !JWT_SECRET) return null;
  try {
    return authUserFromJwt(jwt.verify(token, JWT_SECRET));
  } catch {
    return null;
  }
}

/** Loads role from DB so role changes apply without re-login. */
export async function resolveAuthUser(
  event: HandlerEvent
): Promise<AuthUser | null> {
  const fromJwt = readAuthUser(event);
  if (!fromJwt) return null;
  try {
    await ensureUsersRoleColumn();
    const res = await pool.query(
      "SELECT id, username, role FROM users WHERE id = $1",
      [fromJwt.id]
    );
    if ((res.rowCount ?? 0) === 0) return null;
    const row = res.rows[0] as {
      id: number;
      username: string;
      role: string;
    };
    return {
      id: Number(row.id),
      username: row.username,
      role: normalizeRole(row.role),
    };
  } catch {
    return fromJwt;
  }
}

export function forbiddenObserve(): HandlerResponse {
  return {
    statusCode: 403,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      error: "Observe mode is view-only. Money and edits stay with admin.",
    }),
  };
}

export async function requireAdminUser(
  event: HandlerEvent
): Promise<AuthUser | HandlerResponse> {
  const user = await resolveAuthUser(event);
  if (!user) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }
  if (user.role !== "admin") return forbiddenObserve();
  return user;
}

export function isErrorResponse(
  value: AuthUser | HandlerResponse
): value is HandlerResponse {
  return typeof (value as HandlerResponse).statusCode === "number";
}
