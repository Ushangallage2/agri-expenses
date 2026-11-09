/** Aiven (and most hosted PG) URIs include `sslmode=require`. node-pg treats
 * that as verify-full and overwrites `ssl: { rejectUnauthorized: false }`,
 * so Netlify fails TLS while DBeaver/psql succeed. Strip those params, then
 * set SSL ourselves. */

export function sslForDatabaseUrl(url: string): boolean | { rejectUnauthorized: boolean } {
  const raw = url.toLowerCase();
  if (/sslmode=disable/.test(raw)) return false;
  const local = /localhost|127\.0\.0\.1/.test(raw);
  const requireSsl = /sslmode=require|sslmode=verify/.test(raw);
  if (local && !requireSsl) return false;
  return { rejectUnauthorized: false };
}

export function normalizeDatabaseUrl(raw: string): string {
  const url = raw.trim().replace(/^['"]|['"]$/g, "");
  try {
    const parsed = new URL(url);
    for (const key of [
      "sslmode",
      "sslrootcert",
      "sslcert",
      "sslkey",
      "channel_binding",
      "sslnegotiation",
    ]) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
