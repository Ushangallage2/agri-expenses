import type { Handler } from "@netlify/functions";

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

  const ok = db === "mysql" && jwt;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok,
      database: db,
      jwtConfigured: jwt,
      mailtrapConfigured: mail,
      mailFromConfigured: from,
      hint:
        ok
          ? "Env looks ready for login."
          : db !== "mysql"
            ? "Set DATABASE_URL to a mysql://… connection string (not postgres)."
            : "Set JWT_SECRET in Netlify site environment variables.",
    }),
  };
};
