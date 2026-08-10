import { Handler } from "@netlify/functions";
import pool from "./db";
import jwt from "jsonwebtoken";
import { ensureUsersRoleColumn } from "./utils/usersDb";
import { normalizeRole } from "../../src/utils/roles";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: JSON.stringify("Unauthorized") };
    jwt.verify(token, JWT_SECRET);

    await ensureUsersRoleColumn();

    // ?all=1 → login accounts for admin user management (includes observe)
    // default → ledger people only (excludes observe showcase logins)
    const includeAll =
      event.queryStringParameters?.all === "1" ||
      event.queryStringParameters?.all === "true";

    if (includeAll) {
      const res = await pool.query(
        "SELECT username, role FROM users ORDER BY username ASC"
      );
      const accounts = res.rows.map((r: { username: string; role: string }) => ({
        username: r.username,
        role: normalizeRole(r.role),
      }));
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accounts),
      };
    }

    const res = await pool.query(
      `SELECT username FROM users
       WHERE COALESCE(role, 'admin') <> 'observe'
       ORDER BY username ASC`
    );
    const users = res.rows.map((r: { username: string }) => r.username);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(users),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify("Server error") };
  }
};
