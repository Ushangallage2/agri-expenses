/**
 * Create (or reset) a user in PostgreSQL.
 *
 * Usage:
 *   node scripts/create-admin.mjs
 *   node scripts/create-admin.mjs --username admin --password Secret123!
 *   node scripts/create-admin.mjs --username observe --password demo --role observe
 *
 * Reads DATABASE_URL from .env (or process env).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { makePgClient } from "./pg-url.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

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

function parseArgs(argv) {
  const out = { username: "admin", password: null, role: "admin" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--username" && argv[i + 1]) out.username = argv[++i];
    else if (argv[i] === "--password" && argv[i + 1]) out.password = argv[++i];
    else if (argv[i] === "--role" && argv[i + 1]) out.role = argv[++i];
  }
  out.role = out.role === "observe" ? "observe" : "admin";
  return out;
}

async function ensureSchema(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL
    )
  `);

  const cols = await conn.query(
    `SELECT column_name AS name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'users'
        AND column_name = 'role'`
  );
  if (!cols.rows.length) {
    await conn.query(
      `ALTER TABLE users
       ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'admin'`
    );
  }

  await conn.query(`
    CREATE TABLE IF NOT EXISTS farms (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await conn.query(
    `INSERT INTO farms (id, name) VALUES (1, 'Default Farm')
     ON CONFLICT (id) DO NOTHING`
  );
  const farmCol = await conn.query(
    `SELECT column_name AS name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'users'
        AND column_name = 'farm_id'`
  );
  if (!farmCol.rows.length) {
    await conn.query(
      `ALTER TABLE users ADD COLUMN farm_id INTEGER NOT NULL DEFAULT 1`
    );
  }

  await conn.query(`
    CREATE TABLE IF NOT EXISTS crops (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS reasons (
      id SERIAL PRIMARY KEY,
      reason VARCHAR(255) NOT NULL UNIQUE
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS saved_amounts (
      id SERIAL PRIMARY KEY,
      amount DECIMAL(12, 2) NOT NULL UNIQUE
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      expender VARCHAR(255) NOT NULL,
      reason VARCHAR(255) NOT NULL,
      amount DECIMAL(12, 2) NOT NULL,
      crop VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS crop_notes (
      id SERIAL PRIMARY KEY,
      crop_name VARCHAR(255) NOT NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await conn.query(
    `CREATE INDEX IF NOT EXISTS idx_crop_notes_crop ON crop_notes (crop_name)`
  );
}

async function main() {
  loadEnvFile();

  const args = parseArgs(process.argv.slice(2));
  const username = args.username;
  const role = args.role;
  const password =
    args.password || crypto.randomBytes(9).toString("base64url");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is missing. Set it in .env first.");
    process.exit(1);
  }
  if (/^mysql(\+[^:]+)?:\/\//i.test(databaseUrl)) {
    console.error("DATABASE_URL is mysql://… — this app now uses postgres://");
    process.exit(1);
  }

  const conn = makePgClient(databaseUrl);
  await conn.connect();

  try {
    await ensureSchema(conn);
    const hash = await bcrypt.hash(password, 10);

    const existing = await conn.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (existing.rows.length > 0) {
      await conn.query(
        "UPDATE users SET password = $1, role = $2 WHERE username = $3",
        [hash, role, username]
      );
      console.log(`Updated existing user: ${username} (role=${role})`);
    } else {
      const result = await conn.query(
        "INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id",
        [username, hash, role]
      );
      console.log(`Created user id=${result.rows[0].id} role=${role}`);
    }

    console.log("");
    console.log(role === "observe" ? "Observe credentials" : "Admin credentials");
    console.log("-----------------");
    console.log(`username: ${username}`);
    console.log(`password: ${password}`);
    console.log(`role:     ${role}`);
    console.log("");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Failed to create user:", err.message);
  process.exit(1);
});
