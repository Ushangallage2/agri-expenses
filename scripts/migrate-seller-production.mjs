/**
 * Upgrade a main-branch Agri Ledger MySQL database to sellerProduction.
 *
 * Usage (uses DATABASE_URL from .env or the environment):
 *   node scripts/migrate-seller-production.mjs
 *
 * Idempotent: safe to run against a DB that is already migrated.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

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

function parseDatabaseUrl(url) {
  const cleaned = url
    .replace(/[?&]ssl-mode=[^&]*/gi, "")
    .replace(/\?$/, "")
    .trim();
  const u = new URL(cleaned);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    ssl: { rejectUnauthorized: false },
  };
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME AS name
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function main() {
  loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is missing. Set it in .env (same as the Netlify site).");
    process.exit(1);
  }

  const conn = await mysql.createConnection(parseDatabaseUrl(databaseUrl));
  try {
    console.log("==> Creating farms table");
    await conn.query(`
      CREATE TABLE IF NOT EXISTS farms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`INSERT IGNORE INTO farms (id, name) VALUES (?, ?)`, [
      DEFAULT_FARM_ID,
      DEFAULT_FARM_NAME,
    ]);
    console.log(`    Default Farm id=${DEFAULT_FARM_ID}`);

    console.log("==> Adding users.farm_id (main-branch DBs lack this column)");
    if (!(await columnExists(conn, "users", "farm_id"))) {
      await conn.query(
        `ALTER TABLE users ADD COLUMN farm_id INT NOT NULL DEFAULT ${DEFAULT_FARM_ID}`
      );
      console.log("    added users.farm_id");
    } else {
      console.log("    users.farm_id already present");
    }
    const [backfill] = await conn.query(
      `UPDATE users SET farm_id = ? WHERE farm_id IS NULL OR farm_id = 0`,
      [DEFAULT_FARM_ID]
    );
    console.log(`    backfilled ${backfill.affectedRows ?? 0} user(s) onto Default Farm`);

    console.log("==> Creating shared knowledge-base tables (empty; seeded on first API call)");
    await conn.query(`
      CREATE TABLE IF NOT EXISTS kb_fertilizers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(128) NOT NULL DEFAULT '',
        composition VARCHAR(255) NOT NULL DEFAULT '',
        what_it_does TEXT NULL,
        how_to_use TEXT NULL,
        default_unit VARCHAR(32) NOT NULL DEFAULT 'kg',
        UNIQUE KEY uq_kb_fertilizers_name (name)
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS kb_pesticides (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        target VARCHAR(255) NOT NULL DEFAULT '',
        what_it_does TEXT NULL,
        advice TEXT NULL,
        cycle_notes TEXT NULL,
        UNIQUE KEY uq_kb_pesticides_name (name)
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS kb_schedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        source_key VARCHAR(64) NOT NULL,
        crop_type VARCHAR(128) NOT NULL DEFAULT '',
        name VARCHAR(255) NOT NULL,
        summary TEXT NULL,
        UNIQUE KEY uq_kb_schedules_source (source_key)
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS kb_schedule_steps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        schedule_id INT NOT NULL,
        step_order INT NOT NULL DEFAULT 0,
        title VARCHAR(255) NOT NULL,
        summary TEXT NULL,
        details TEXT NULL,
        INDEX idx_kb_steps_schedule (schedule_id)
      )
    `);

    const [[{ farms }]] = await conn.query(`SELECT COUNT(*) AS farms FROM farms`);
    const [[{ users }]] = await conn.query(`SELECT COUNT(*) AS users FROM users`);
    console.log("");
    console.log("Migration complete.");
    console.log(`  farms: ${farms}`);
    console.log(`  users: ${users} (all with farm_id)`);
    console.log("");
    console.log("Existing ledger/inventory rows are unchanged.");
    console.log("You can now Create account / Sign in on the sellerProduction deploy.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.code || err.message);
  process.exit(1);
});
