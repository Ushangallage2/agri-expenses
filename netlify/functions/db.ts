import pg from "pg";
import { normalizeDatabaseUrl, sslForDatabaseUrl } from "./utils/pgConnect";

const { Pool } = pg;

function parseConnectionString() {
  const raw = (process.env.DATABASE_URL || "").trim();
  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }
  if (/^mysql(\+[^:]+)?:\/\//i.test(raw)) {
    throw new Error(
      "DATABASE_URL is mysql://… but this app now uses PostgreSQL (postgres://…)"
    );
  }
  return normalizeDatabaseUrl(raw);
}

const connectionString = parseConnectionString();

const pool = new Pool({
  connectionString,
  ssl: sslForDatabaseUrl(process.env.DATABASE_URL || connectionString),
  max: 10,
  connectionTimeoutMillis: 5000,
});

/** Legacy queries used `?`; most functions already use `$1`. Support both. */
function toPostgresPlaceholders(sql: string) {
  if (!sql.includes("?")) return sql;
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function query(sql: string, params: unknown[] = []) {
  const text = toPostgresPlaceholders(sql.trim());
  const result = await pool.query(text, params);
  const rows = result.rows || [];
  return {
    rows,
    rowCount: result.rowCount ?? rows.length,
    insertId: rows[0]?.id,
  };
}

export default { query, end: () => pool.end() };
