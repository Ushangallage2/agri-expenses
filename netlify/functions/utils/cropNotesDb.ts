import pool from "../db";

let ensured = false;

export async function ensureCropNotesTable() {
  if (ensured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crop_notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      crop_name VARCHAR(255) NOT NULL,
      note TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_crop_notes_crop (crop_name)
    )
  `);

  try {
    await pool.query(
      `ALTER TABLE crop_notes ADD COLUMN entry_type VARCHAR(16) NOT NULL DEFAULT 'note'`
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(msg)) throw err;
  }

  try {
    await pool.query(
      `ALTER TABLE crop_notes ADD COLUMN completed TINYINT(1) NOT NULL DEFAULT 0`
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(msg)) throw err;
  }

  try {
    await pool.query(
      `ALTER TABLE crop_notes ADD COLUMN source VARCHAR(128) NULL`
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(msg)) throw err;
  }

  try {
    await pool.query(
      `CREATE INDEX idx_crop_notes_source ON crop_notes (source)`
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate|ER_DUP_KEYNAME|exists/i.test(msg)) throw err;
  }

  ensured = true;
}

export function normalizeEntryType(value: unknown): "note" | "todo" {
  return value === "todo" ? "todo" : "note";
}
