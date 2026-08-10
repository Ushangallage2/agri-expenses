import pool from "../db";
import type { UserRole } from "../../../src/utils/roles";
import { normalizeRole } from "../../../src/utils/roles";

let roleColumnReady: Promise<void> | null = null;

export async function ensureUsersRoleColumn(): Promise<void> {
  if (!roleColumnReady) {
    roleColumnReady = (async () => {
      const cols = await pool.query(
        `SELECT COLUMN_NAME AS name
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'users'
           AND COLUMN_NAME = 'role'`
      );
      if ((cols.rowCount ?? 0) === 0) {
        await pool.query(
          `ALTER TABLE users
           ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'admin'`
        );
      }
      await pool.query(
        `UPDATE users SET role = 'admin'
         WHERE role IS NULL OR role = '' OR role NOT IN ('admin', 'observe')`
      );
    })().catch((err) => {
      roleColumnReady = null;
      throw err;
    });
  }
  await roleColumnReady;
}

export type AuthUser = {
  id: number;
  username: string;
  role: UserRole;
};

export function authUserFromJwt(decoded: unknown): AuthUser | null {
  if (!decoded || typeof decoded !== "object") return null;
  const d = decoded as Record<string, unknown>;
  const id = Number(d.id);
  const username = typeof d.username === "string" ? d.username : "";
  if (!Number.isFinite(id) || !username) return null;
  return { id, username, role: normalizeRole(d.role) };
}
