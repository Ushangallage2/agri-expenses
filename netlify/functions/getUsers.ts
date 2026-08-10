import { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";
import { ensureUsersRoleColumn } from "./utils/usersDb";
import { normalizeRole } from "../../src/utils/roles";
import { cached } from "./utils/memoryCache";

const JWT_SECRET = process.env.JWT_SECRET!;
const TTL_MS = 30_000;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: JSON.stringify("Unauthorized") };
    jwt.verify(token, JWT_SECRET);

    // ?all=1 → login accounts for admin user management (includes observe)
    // default → ledger people only (excludes observe showcase logins)
    const includeAll =
      event.queryStringParameters?.all === "1" ||
      event.queryStringParameters?.all === "true";

    const cacheKey = includeAll ? "users:all" : "users:ledger";

    const body = await cached(cacheKey, TTL_MS, async () => {
      await ensureUsersRoleColumn();

      if (includeAll) {
        const res = await pool.query(
          "SELECT username, role FROM users ORDER BY username ASC"
        );
        const accounts = res.rows.map((r: any) => ({
          username: r.username as string,
          role: normalizeRole(r.role),
        }));
        return JSON.stringify(accounts);
      }

      const res = await pool.query(
        `SELECT username FROM users
         WHERE COALESCE(role, 'admin') <> 'observe'
         ORDER BY username ASC`
      );
      const users = res.rows.map((r: any) => r.username as string);
      return JSON.stringify(users);
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body,
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify("Server error") };
  }
};
