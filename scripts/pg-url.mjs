import pg from "pg";

export function sslForDatabaseUrl(url) {
  const raw = String(url || "").toLowerCase();
  if (/sslmode=disable/.test(raw)) return false;
  const local = /localhost|127\.0\.0\.1/.test(raw);
  const requireSsl = /sslmode=require|sslmode=verify/.test(raw);
  if (local && !requireSsl) return false;
  return { rejectUnauthorized: false };
}

export function makePgClient(url) {
  return new pg.Client({
    connectionString: url,
    ssl: sslForDatabaseUrl(url),
  });
}
