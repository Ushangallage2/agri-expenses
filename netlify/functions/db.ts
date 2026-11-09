import pg from "pg";

const { Pool } = pg;

function sslForDatabaseUrl(url: string): boolean | { rejectUnauthorized: boolean } {
  const raw = url.toLowerCase();
  if (/sslmode=disable/.test(raw)) return false;
  const local = /localhost|127\.0\.0\.1/.test(raw);
  const requireSsl = /sslmode=require|sslmode=verify/.test(raw);
  if (local && !requireSsl) return false;
  // Aiven and most hosted Postgres require TLS. Their CA is optional;
  // rejectUnauthorized:false matches the previous MySQL client setting.
  return { rejectUnauthorized: false };
}

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
  return raw;
}

const connectionString = parseConnectionString();

const pool = new Pool({
  connectionString,
  ssl: sslForDatabaseUrl(connectionString),
  max: 10,
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
