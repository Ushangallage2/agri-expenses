import pool from "../db";

let plantColEnsured = false;

export async function ensureCropImagesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crop_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      crop_name VARCHAR(255) NOT NULL,
      note_id INT NULL,
      image_data MEDIUMTEXT NOT NULL,
      mime_type VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_crop_images_crop (crop_name)
    )
  `);

  if (plantColEnsured) return;
  try {
    await pool.query(`ALTER TABLE crop_images ADD COLUMN plant_number INT NULL`);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(msg)) throw err;
  }
  try {
    await pool.query(
      `CREATE INDEX idx_crop_images_plant ON crop_images (crop_name, plant_number)`
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate|ER_DUP_KEYNAME|exists/i.test(msg)) throw err;
  }
  plantColEnsured = true;
}

export async function insertCropImage(args: {
  crop: string;
  imageData: string;
  mimeType?: string;
  noteId?: number | null;
  plantNumber?: number | null;
}) {
  await ensureCropImagesTable();
  const res = await pool.query(
    `INSERT INTO crop_images (crop_name, note_id, image_data, mime_type, plant_number)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, crop_name, note_id, mime_type, plant_number, created_at`,
    [
      args.crop,
      args.noteId ?? null,
      args.imageData,
      args.mimeType || "image/jpeg",
      args.plantNumber ?? null,
    ]
  );
  return res.rows[0];
}

/** Crop-level gallery when plantNumber is omitted; one plant when set. */
export async function listCropImages(crop: string, plantNumber?: number | null) {
  await ensureCropImagesTable();
  if (plantNumber != null) {
    const res = await pool.query(
      `SELECT id, crop_name, note_id, image_data, mime_type, plant_number, created_at
       FROM crop_images
       WHERE crop_name = $1 AND plant_number = $2
       ORDER BY created_at DESC`,
      [crop, plantNumber]
    );
    return res.rows;
  }
  const res = await pool.query(
    `SELECT id, crop_name, note_id, image_data, mime_type, plant_number, created_at
     FROM crop_images
     WHERE crop_name = $1 AND plant_number IS NULL
     ORDER BY created_at DESC`,
    [crop]
  );
  return res.rows;
}

export async function deleteCropImageById(id: number) {
  await ensureCropImagesTable();
  const res = await pool.query("DELETE FROM crop_images WHERE id = $1", [id]);
  return (res.rowCount ?? 0) > 0;
}
