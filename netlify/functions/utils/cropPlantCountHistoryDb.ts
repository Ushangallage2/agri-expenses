import pool from "../db";

let ensured = false;

export async function ensureCropPlantCountHistoryTable() {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crop_plant_count_history (
      id SERIAL PRIMARY KEY,
      crop_name VARCHAR(255) NOT NULL,
      plant_count INT NOT NULL DEFAULT 0,
      recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_plant_hist_crop ON crop_plant_count_history (crop_name)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_plant_hist_recorded ON crop_plant_count_history (recorded_at)`
  );
  ensured = true;
}

export async function recordPlantCountHistory(
  cropName: string,
  plantCount: number
) {
  await ensureCropPlantCountHistoryTable();
  await pool.query(
    `INSERT INTO crop_plant_count_history (crop_name, plant_count)
     VALUES ($1, $2)`,
    [cropName, plantCount]
  );
}
