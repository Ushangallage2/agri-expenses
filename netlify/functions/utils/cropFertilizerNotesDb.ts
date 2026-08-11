import pool from "../db";

let ensured = false;

export async function ensureCropFertilizerNotesTable() {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crop_fertilizer_notes (
      crop_name VARCHAR(255) NOT NULL,
      fertilizer_name VARCHAR(255) NOT NULL,
      note TEXT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (crop_name, fertilizer_name)
    )
  `);
  ensured = true;
}

export type CropFertilizerNote = {
  crop_name: string;
  fertilizer_name: string;
  note: string;
};

export async function listCropFertilizerNotes(
  cropName: string
): Promise<CropFertilizerNote[]> {
  await ensureCropFertilizerNotesTable();
  const res = await pool.query(
    `SELECT crop_name, fertilizer_name, note
     FROM crop_fertilizer_notes
     WHERE crop_name = $1
     ORDER BY fertilizer_name ASC`,
    [cropName]
  );
  return res.rows.map((r: any) => ({
    crop_name: String(r.crop_name),
    fertilizer_name: String(r.fertilizer_name),
    note: r.note != null ? String(r.note) : "",
  }));
}

export async function upsertCropFertilizerNote(
  cropName: string,
  fertilizerName: string,
  note: string
): Promise<CropFertilizerNote> {
  await ensureCropFertilizerNotesTable();
  const crop = cropName.trim();
  const fert = fertilizerName.trim();
  const text = note.trim();
  if (!crop || !fert) {
    throw new Error("cropName and fertilizerName are required");
  }

  if (!text) {
    await pool.query(
      `DELETE FROM crop_fertilizer_notes
       WHERE crop_name = $1 AND fertilizer_name = $2`,
      [crop, fert]
    );
    return { crop_name: crop, fertilizer_name: fert, note: "" };
  }

  await pool.query(
    `INSERT INTO crop_fertilizer_notes (crop_name, fertilizer_name, note)
     VALUES ($1, $2, $3)
     ON DUPLICATE KEY UPDATE note = VALUES(note)`,
    [crop, fert, text]
  );

  return { crop_name: crop, fertilizer_name: fert, note: text };
}
