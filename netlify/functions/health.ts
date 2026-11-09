import type { Handler } from "@netlify/functions";
import pg from "pg";
import { normalizeDatabaseUrl, sslForDatabaseUrl } from "./utils/pgConnect";

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
    connectionString: normalizeDatabaseUrl(url),
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
      hint = /53300|SUPERUSER|connection slots/i.test(dbError || "")
        ? "Postgres is out of connections (Aiven free tier is small). Restart the Aiven PostgreSQL service to drop stale Netlify/DBeaver sessions, then retry."
        : "Netlify cannot reach Postgres. Check dbError, Aiven allowed IPs (0.0.0.0/0), public access, and that DATABASE_URL is the PostgreSQL Service URI. Then trigger a new deploy.";
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
