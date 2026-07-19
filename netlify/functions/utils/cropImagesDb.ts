import pool from "../db";

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
}

export async function insertCropImage(args: {
  crop: string;
  imageData: string;
  mimeType?: string;
  noteId?: number | null;
}) {
  await ensureCropImagesTable();
  const res = await pool.query(
    `INSERT INTO crop_images (crop_name, note_id, image_data, mime_type)
     VALUES ($1, $2, $3, $4)
     RETURNING id, crop_name, note_id, mime_type, created_at`,
    [
      args.crop,
      args.noteId ?? null,
      args.imageData,
      args.mimeType || "image/jpeg",
    ]
  );
  return res.rows[0];
}

export async function listCropImages(crop: string) {
  await ensureCropImagesTable();
  const res = await pool.query(
    `SELECT id, crop_name, note_id, image_data, mime_type, created_at
     FROM crop_images
     WHERE crop_name = $1
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
