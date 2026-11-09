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

function isDupEntry(err: any): boolean {
  return (
    err?.code === "23505" ||
    err?.code === "ER_DUP_ENTRY" ||
    err?.errno === 1062
  );
}

function isDupColumn(err: any): boolean {
  return (
    err?.code === "42701" ||
    err?.code === "ER_DUP_FIELDNAME" ||
    err?.errno === 1060 ||
    /already exists/i.test(String(err?.message || ""))
  );
}

export function ensureFarmsSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS farms (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      try {
        await pool.query(`INSERT INTO farms (id, name) VALUES ($1, $2)`, [
          DEFAULT_FARM_ID,
          DEFAULT_FARM_NAME,
        ]);
      } catch (err) {
        if (!isDupEntry(err)) throw err;
      }
      await pool.query(
        `SELECT setval(
           pg_get_serial_sequence('farms', 'id'),
           GREATEST((SELECT COALESCE(MAX(id), 1) FROM farms), 1)
         )`
      );

      try {
        await pool.query(
          `ALTER TABLE users ADD COLUMN farm_id INTEGER NOT NULL DEFAULT ${DEFAULT_FARM_ID}`
        );
      } catch (err) {
        if (!isDupColumn(err)) throw err;
      }
      await pool.query(
        `UPDATE users SET farm_id = $1 WHERE farm_id IS NULL OR farm_id = 0`,
        [DEFAULT_FARM_ID]
      );
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
    `INSERT INTO farms (name) VALUES ($1) RETURNING id`,
    [clean]
  );
  const id = Number(res.rows[0]?.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Failed to create farm");
  return id;
}

export async function getFarm(
  farmId: number
): Promise<{ id: number; name: string } | null> {
  await ensureFarmsSchema();
  const res = await pool.query(
    `SELECT id, name FROM farms WHERE id = $1 LIMIT 1`,
    [farmId]
  );
  if ((res.rowCount ?? 0) === 0) return null;
  const row = res.rows[0] as { id: number; name: string };
  return { id: Number(row.id), name: row.name };
}
