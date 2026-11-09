import pool from "../db";

let ensured = false;

export async function ensureCropNotesTable() {
  if (ensured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crop_notes (
      id SERIAL PRIMARY KEY,
      crop_name VARCHAR(255) NOT NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_crop_notes_crop ON crop_notes (crop_name)`
  );

  try {
    await pool.query(
      `ALTER TABLE crop_notes ADD COLUMN entry_type VARCHAR(16) NOT NULL DEFAULT 'note'`
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate column|ER_DUP_FIELDNAME|already exists|42701/i.test(msg)) throw err;
  }

  try {
    await pool.query(
      `ALTER TABLE crop_notes ADD COLUMN completed SMALLINT NOT NULL DEFAULT 0`
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate column|ER_DUP_FIELDNAME|already exists|42701/i.test(msg)) throw err;
  }

  try {
    await pool.query(
      `ALTER TABLE crop_notes ADD COLUMN source VARCHAR(128) NULL`
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate column|ER_DUP_FIELDNAME|already exists|42701/i.test(msg)) throw err;
  }

  try {
    await pool.query(
      `CREATE INDEX idx_crop_notes_source ON crop_notes (source)`
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate|ER_DUP_KEYNAME|exists/i.test(msg)) throw err;
  }

  try {
    await pool.query(`ALTER TABLE crop_notes ADD COLUMN plant_number INT NULL`);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate column|ER_DUP_FIELDNAME|already exists|42701/i.test(msg)) throw err;
  }

  try {
    await pool.query(
      `CREATE INDEX idx_crop_notes_plant ON crop_notes (crop_name, plant_number)`
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

/** Positive plant index, or null when the entry is crop-level. */
export function parsePlantNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 100_000) return null;
  return n;
}
