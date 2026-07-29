import pool from "../db";

let ensured = false;

export async function ensureCropPlantCountColumn() {
  if (ensured) return;
  try {
    await pool.query(
      `ALTER TABLE crops ADD COLUMN plant_count INT NOT NULL DEFAULT 0`
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(msg)) throw err;
  }
  ensured = true;
}
