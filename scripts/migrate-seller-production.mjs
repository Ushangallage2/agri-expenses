/**
 * Upgrade a main-branch Agri Ledger PostgreSQL database to sellerProduction.
 *
 * Usage (uses DATABASE_URL from .env or the environment):
 *   node scripts/migrate-seller-production.mjs
 *
 * Idempotent: safe to run against a DB that is already migrated.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makePgClient } from "./pg-url.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const DEFAULT_FARM_ID = 1;
const DEFAULT_FARM_NAME = "Default Farm";

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function columnExists(conn, table, column) {
  const res = await conn.query(
    `SELECT column_name AS name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2`,
    [table, column]
  );
  return res.rows.length > 0;
}

async function main() {
  loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is missing. Set it in .env (same as the Netlify site).");
    process.exit(1);
  }
  if (/^mysql(\+[^:]+)?:\/\//i.test(databaseUrl)) {
    console.error("DATABASE_URL is mysql://… — this app now uses postgres://");
    process.exit(1);
  }

  const conn = makePgClient(databaseUrl);
  await conn.connect();
  try {
    console.log("==> Creating farms table");
    await conn.query(`
      CREATE TABLE IF NOT EXISTS farms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(
      `INSERT INTO farms (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [DEFAULT_FARM_ID, DEFAULT_FARM_NAME]
    );
    await conn.query(
      `SELECT setval(
         pg_get_serial_sequence('farms', 'id'),
         GREATEST((SELECT COALESCE(MAX(id), 1) FROM farms), 1)
       )`
    );
    console.log(`    Default Farm id=${DEFAULT_FARM_ID}`);

    console.log("==> Adding users.farm_id if missing");
    if (!(await columnExists(conn, "users", "farm_id"))) {
      await conn.query(
        `ALTER TABLE users ADD COLUMN farm_id INTEGER NOT NULL DEFAULT ${DEFAULT_FARM_ID}`
      );
      console.log("    added users.farm_id");
    } else {
      console.log("    users.farm_id already present");
    }
    const backfill = await conn.query(
      `UPDATE users SET farm_id = $1 WHERE farm_id IS NULL OR farm_id = 0`,
      [DEFAULT_FARM_ID]
    );
    console.log(`    backfilled ${backfill.rowCount ?? 0} user(s) onto Default Farm`);

    console.log("==> Creating shared knowledge-base tables");
    await conn.query(`
      CREATE TABLE IF NOT EXISTS kb_fertilizers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        category VARCHAR(128) NOT NULL DEFAULT '',
        composition VARCHAR(255) NOT NULL DEFAULT '',
        what_it_does TEXT NULL,
        how_to_use TEXT NULL,
        default_unit VARCHAR(32) NOT NULL DEFAULT 'kg'
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS kb_pesticides (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        target VARCHAR(255) NOT NULL DEFAULT '',
        what_it_does TEXT NULL,
        advice TEXT NULL,
        cycle_notes TEXT NULL
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS kb_schedules (
        id SERIAL PRIMARY KEY,
        source_key VARCHAR(64) NOT NULL UNIQUE,
        crop_type VARCHAR(128) NOT NULL DEFAULT '',
        name VARCHAR(255) NOT NULL,
        summary TEXT NULL
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS kb_schedule_steps (
        id SERIAL PRIMARY KEY,
        schedule_id INT NOT NULL,
        step_order INT NOT NULL DEFAULT 0,
        title VARCHAR(255) NOT NULL,
        summary TEXT NULL,
        details TEXT NULL
      )
    `);
    await conn.query(
      `CREATE INDEX IF NOT EXISTS idx_kb_steps_schedule ON kb_schedule_steps (schedule_id)`
    );

    const farms = await conn.query(`SELECT COUNT(*)::int AS farms FROM farms`);
    const users = await conn.query(`SELECT COUNT(*)::int AS users FROM users`);
    console.log("");
    console.log("Migration complete.");
    console.log(`  farms: ${farms.rows[0].farms}`);
    console.log(`  users: ${users.rows[0].users} (all with farm_id)`);
    console.log("");
    console.log("Existing ledger/inventory rows are unchanged.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.code || err.message);
  process.exit(1);
});
