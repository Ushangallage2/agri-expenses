import pool from "../db";

/**
 * Multi-tenant foundation for the "seller production" product.
 *
 * A `farm` is a tenant: one farmer's (or estate's) private workspace. Every
 * user belongs to exactly one farm via `users.farm_id`. Private, per-farm data
 * (ledger, inventory amounts, crops, photos …) is scoped by this id in a later
 * phase; shared agronomic knowledge (the `kb_*` tables) is global and NOT
 * scoped by farm. See docs/SELLER_PRODUCTION.md.
 */

export const DEFAULT_FARM_ID = 1;
export const DEFAULT_FARM_NAME = "Default Farm";

let schemaReady: Promise<void> | null = null;

export function ensureFarmsSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS farms (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Seed a stable default farm so pre-existing single-tenant data has a home.
      await pool.query(
        `INSERT IGNORE INTO farms (id, name) VALUES (?, ?)`,
        [DEFAULT_FARM_ID, DEFAULT_FARM_NAME]
      );

      // Add farm_id to users if missing, then backfill legacy rows.
      const cols = await pool.query(
        `SELECT COLUMN_NAME AS name
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'users'
            AND COLUMN_NAME = 'farm_id'`
      );
      if ((cols.rowCount ?? 0) === 0) {
        await pool.query(
          `ALTER TABLE users ADD COLUMN farm_id INT NOT NULL DEFAULT ${DEFAULT_FARM_ID}`
        );
        await pool.query(
          `UPDATE users SET farm_id = ? WHERE farm_id IS NULL OR farm_id = 0`,
          [DEFAULT_FARM_ID]
        );
      }
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

/** Create a new tenant and return its id. */
export async function createFarm(name: string): Promise<number> {
  await ensureFarmsSchema();
  const clean = String(name || "").trim() || "My Farm";
  const res = await pool.query(
    `INSERT INTO farms (name) VALUES (?) RETURNING id`,
    [clean]
  );
  const row = res.rows[0] as { id: number } | undefined;
  if (!row) throw new Error("Failed to create farm");
  return Number(row.id);
}

export async function getFarm(
  farmId: number
): Promise<{ id: number; name: string } | null> {
  await ensureFarmsSchema();
  const res = await pool.query(
    `SELECT id, name FROM farms WHERE id = ? LIMIT 1`,
    [farmId]
  );
  if ((res.rowCount ?? 0) === 0) return null;
  const row = res.rows[0] as { id: number; name: string };
  return { id: Number(row.id), name: row.name };
}
