import { Handler } from "@netlify/functions";
import pool from "./db";
import bcrypt from "bcryptjs";
import { requireAdmin } from "../../src/utils/requireAuth";
import { ensureUsersRoleColumn } from "./utils/usersDb";
import { normalizeRole } from "../../src/utils/roles";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { username, password, role } = JSON.parse(event.body || "{}");

  if (!username || !password) {
    return { statusCode: 400, body: "Username and password required" };
  }

  const userRole = normalizeRole(role);

  try {
    await ensureUsersRoleColumn();
    const hash = await bcrypt.hash(password, 10);

    const res = await pool.query(
      `
      INSERT INTO users (username, password, role)
      VALUES ($1, $2, $3)
      RETURNING id, username, role
      `,
      [username, hash, userRole]
    );

    return {
      statusCode: 200,
      body: JSON.stringify(res.rows[0]),
    };
  } catch (err: any) {
    if (err.code === "23505" || err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
      return { statusCode: 400, body: "Username already exists" };
    }
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

export const handler = requireAdmin(baseHandler);
