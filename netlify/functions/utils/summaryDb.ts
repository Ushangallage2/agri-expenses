import pool from "../db";

export type SummaryFrequency = "weekly" | "monthly";

export async function ensureSummaryTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS summary_emails (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS summary_settings (
      id INT PRIMARY KEY,
      frequency VARCHAR(16) NOT NULL DEFAULT 'weekly',
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      last_sent_at DATETIME NULL,
      last_period_key VARCHAR(32) NULL
    )
  `);
  await pool.query(
    `INSERT IGNORE INTO summary_settings (id, frequency, enabled) VALUES (1, 'weekly', 1)`
  );
}

export async function getSummaryConfig() {
  await ensureSummaryTables();
  const settings = await pool.query(
    `SELECT frequency, enabled, last_sent_at, last_period_key FROM summary_settings WHERE id = 1`
  );
  const emails = await pool.query(
    `SELECT id, email, created_at FROM summary_emails ORDER BY email ASC`
  );
  const row = settings.rows[0] || {
    frequency: "weekly",
    enabled: 1,
    last_sent_at: null,
    last_period_key: null,
  };
  return {
    frequency: (row.frequency === "monthly" ? "monthly" : "weekly") as SummaryFrequency,
    enabled: Boolean(Number(row.enabled)),
    lastSentAt: row.last_sent_at as string | null,
    lastPeriodKey: row.last_period_key as string | null,
    emails: emails.rows as { id: number; email: string; created_at: string }[],
  };
}

export async function saveSummaryConfig(args: {
  frequency: SummaryFrequency;
  enabled: boolean;
  emails: string[];
}) {
  await ensureSummaryTables();
  await pool.query(
    `UPDATE summary_settings SET frequency = $1, enabled = $2 WHERE id = 1`,
    [args.frequency, args.enabled ? 1 : 0]
  );

  const cleaned = [
    ...new Set(
      args.emails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    ),
  ];

  await pool.query(`DELETE FROM summary_emails`);
  for (const email of cleaned) {
    await pool.query(`INSERT INTO summary_emails (email) VALUES ($1)`, [email]);
  }

  return getSummaryConfig();
}

export async function markSummarySent(periodKey: string) {
  await ensureSummaryTables();
  await pool.query(
    `UPDATE summary_settings SET last_sent_at = NOW(), last_period_key = $1 WHERE id = 1`,
    [periodKey]
  );
}
