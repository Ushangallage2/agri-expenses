import pool from "../db";

let ensured = false;

export async function ensureCropPlantCountHistoryTable() {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crop_plant_count_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      crop_name VARCHAR(255) NOT NULL,
      plant_count INT NOT NULL DEFAULT 0,
      recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_plant_hist_crop (crop_name),
      INDEX idx_plant_hist_recorded (recorded_at)
    )
  `);
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
