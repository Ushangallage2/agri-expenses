import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { verifyToken } from "./auth";
import {
  authUserFromJwt,
  ensureUsersRoleColumn,
} from "../../netlify/functions/utils/usersDb";
import pool from "../../netlify/functions/db";
import { normalizeRole } from "./roles";
import { forbiddenObserve } from "../../netlify/functions/utils/session";

type AuthOptions = {
  /** Observe role may read; only admin may call. */
  adminOnly?: boolean;
};

export function requireAuth(handler: Handler, opts: AuthOptions = {}): Handler {
  return async (event: HandlerEvent, context: HandlerContext) => {
    const cookie = event.headers.cookie;
    if (!cookie) {
      return { statusCode: 401, body: "Unauthorized: No cookie" };
    }

    const token = cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("token="))
      ?.split("=")[1];

    if (!token) {
      return { statusCode: 401, body: "Unauthorized: No token" };
    }

    try {
      const decoded = verifyToken(token);
      let user = authUserFromJwt(decoded);
      if (!user) {
        return { statusCode: 401, body: "Invalid token" };
      }

      try {
        await ensureUsersRoleColumn();
        const res = await pool.query(
          "SELECT id, username, role FROM users WHERE id = $1",
          [user.id]
        );
        if ((res.rowCount ?? 0) > 0) {
          const row = res.rows[0] as {
            id: number;
            username: string;
            role: string;
          };
          user = {
            id: Number(row.id),
            username: row.username,
            role: normalizeRole(row.role),
          };
        }
      } catch {
        /* keep JWT role */
      }

      if (opts.adminOnly && user.role !== "admin") {
        return forbiddenObserve();
      }

      (context as any).user = user;
      return (await handler(event, context)) ?? { statusCode: 204, body: "" };
    } catch {
      return { statusCode: 401, body: "Invalid token" };
    }
  };
}

export function requireAdmin(handler: Handler): Handler {
  return requireAuth(handler, { adminOnly: true });
}
