/**
 * Create (or reset) an admin user in MySQL.
 *
 * Usage:
 *   node scripts/create-admin.mjs
 *   node scripts/create-admin.mjs --username admin --password Secret123!
 *
 * Reads DATABASE_URL from .env (or process env).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

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
  const out = { username: "admin", password: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--username" && argv[i + 1]) out.username = argv[++i];
    else if (argv[i] === "--password" && argv[i + 1]) out.password = argv[++i];
  }
  return out;
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

async function ensureSchema(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS crops (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS reasons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reason VARCHAR(255) NOT NULL UNIQUE
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS saved_amounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      amount DECIMAL(12, 2) NOT NULL UNIQUE
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      expender VARCHAR(255) NOT NULL,
      reason VARCHAR(255) NOT NULL,
      amount DECIMAL(12, 2) NOT NULL,
      crop VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS crop_notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      crop_name VARCHAR(255) NOT NULL,
      note TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_crop_notes_crop (crop_name)
    )
  `);
}

async function main() {
  loadEnvFile();

  const args = parseArgs(process.argv.slice(2));
  const username = args.username;
  const password =
    args.password || crypto.randomBytes(9).toString("base64url");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is missing. Set it in .env first.");
    process.exit(1);
  }

  const conn = await mysql.createConnection(parseDatabaseUrl(databaseUrl));

  try {
    await ensureSchema(conn);
    const hash = await bcrypt.hash(password, 10);

    const [existing] = await conn.execute(
      "SELECT id FROM users WHERE username = ?",
      [username]
    );

    if (existing.length > 0) {
      await conn.execute("UPDATE users SET password = ? WHERE username = ?", [
        hash,
        username,
      ]);
      console.log(`Updated existing admin user: ${username}`);
    } else {
      const [result] = await conn.execute(
        "INSERT INTO users (username, password) VALUES (?, ?)",
        [username, hash]
      );
      console.log(`Created admin user id=${result.insertId}`);
    }

    console.log("");
    console.log("Admin credentials");
    console.log("-----------------");
    console.log(`username: ${username}`);
    console.log(`password: ${password}`);
    console.log("");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Failed to create admin:", err.message);
  process.exit(1);
});
