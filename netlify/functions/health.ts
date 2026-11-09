import type { Handler } from "@netlify/functions";
import pg from "pg";

function sslForDatabaseUrl(url: string): boolean | { rejectUnauthorized: boolean } {
  const raw = url.toLowerCase();
  if (/sslmode=disable/.test(raw)) return false;
  const local = /localhost|127\.0\.0\.1/.test(raw);
  const requireSsl = /sslmode=require|sslmode=verify/.test(raw);
  if (local && !requireSsl) return false;
  return { rejectUnauthorized: false };
}

function sanitizeDbError(err: unknown): string {
  const anyErr = err as { code?: string; message?: string };
  const code = anyErr?.code ? String(anyErr.code) : "";
  let message = String(anyErr?.message || err || "unknown");
  message = message.replace(/postgres(ql)?:\/\/[^\s'"]+/gi, "postgres://…");
  if (code) return `${code}: ${message}`;
  return message;
}

async function pingPostgres(url: string): Promise<{ connected: boolean; error?: string }> {
  const client = new pg.Client({
    connectionString: url,
    ssl: sslForDatabaseUrl(url),
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return { connected: true };
  } catch (err) {
    return { connected: false, error: sanitizeDbError(err) };
  } finally {
    await client.end().catch(() => {});
  }
}

/** Public probe so you can verify Netlify env without leaking secrets. */
export const handler: Handler = async () => {
  const raw = (process.env.DATABASE_URL || "").trim();
  let db: "mysql" | "postgres" | "other" | "missing" = "missing";
  if (raw) {
    if (/^mysql(\+[^:]+)?:\/\//i.test(raw)) db = "mysql";
    else if (/^postgres(ql)?:\/\//i.test(raw)) db = "postgres";
    else db = "other";
  }

  const jwt = Boolean((process.env.JWT_SECRET || "").trim());
  const mail = Boolean((process.env.MAILTRAP_API_TOKEN || "").trim());
  const from = Boolean((process.env.MAIL_FROM_EMAIL || "").trim());

  let dbConnected = false;
  let dbError: string | undefined;
  if (db === "postgres") {
    const ping = await pingPostgres(raw);
    dbConnected = ping.connected;
    dbError = ping.error;
  } else if (db === "mysql") {
    dbError = "DATABASE_URL is still mysql://…";
  } else if (db === "missing") {
    dbError = "DATABASE_URL is not set";
  } else {
    dbError = "DATABASE_URL is not a postgres:// URI";
  }

  const ok = db === "postgres" && jwt && dbConnected;

  let hint = "Env looks ready for login.";
  if (!ok) {
    if (db !== "postgres") {
      hint =
        "Set DATABASE_URL to a postgres://… connection string (Aiven PostgreSQL).";
    } else if (!dbConnected) {
      hint =
        "Netlify cannot reach Postgres. In Aiven allow 0.0.0.0/0 (Netlify has no static IPs), turn on public access, paste the PostgreSQL service URI with ?sslmode=require, then trigger a new deploy.";
    } else {
      hint = "Set JWT_SECRET in Netlify site environment variables.";
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok,
      database: db,
      dbConnected,
      ...(dbError ? { dbError } : {}),
      jwtConfigured: jwt,
      mailtrapConfigured: mail,
      mailFromConfigured: from,
      hint,
    }),
  };
};
