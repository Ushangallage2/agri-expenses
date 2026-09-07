import pool from "../db";
import { ensureCropImagesTable } from "./cropImagesDb";
import { ensureCropNotesTable } from "./cropNotesDb";
import { ensureCropPlantCountColumn } from "./cropPlantCountDb";
import { ensureCropStatusColumns } from "./cropStatusDb";

export type CropPlantMeta = {
  name: string;
  plantCount: number;
  status: "active" | "closed";
  closedPlantCount: number;
  displayCount: number;
};

export type PlantSummary = {
  number: number;
  noteCount: number;
  openTodoCount: number;
  imageCount: number;
  lastActivity: string | null;
};

export async function ensurePlantNumberColumns() {
  await ensureCropNotesTable();
  await ensureCropImagesTable();
}

export async function getCropPlantMeta(
  crop: string
): Promise<CropPlantMeta | null> {
  await ensureCropPlantCountColumn();
  await ensureCropStatusColumns();
  const res = await pool.query(
    `SELECT name, plant_count, status, closed_plant_count
     FROM crops
     WHERE name = $1`,
    [crop]
  );
  if (!res.rowCount) return null;
  const row = res.rows[0] as {
    name: string;
    plant_count: number;
    status: string;
    closed_plant_count: number | null;
  };
  const status =
    String(row.status || "active").toLowerCase() === "closed"
      ? "closed"
      : "active";
  const plantCount = Number(row.plant_count) || 0;
  const closedPlantCount = Number(row.closed_plant_count) || 0;
  return {
    name: row.name,
    plantCount,
    status,
    closedPlantCount,
    displayCount: status === "closed" ? closedPlantCount : plantCount,
  };
}

export async function listPlantSummaries(
  crop: string
): Promise<PlantSummary[]> {
  await ensurePlantNumberColumns();

  const notes = await pool.query(
    `SELECT plant_number,
            COUNT(*) AS note_count,
            SUM(CASE WHEN entry_type = 'todo' AND completed = 0 THEN 1 ELSE 0 END) AS open_todo_count,
            MAX(created_at) AS last_activity
     FROM crop_notes
     WHERE crop_name = $1 AND plant_number IS NOT NULL
     GROUP BY plant_number`,
    [crop]
  );

  const images = await pool.query(
    `SELECT plant_number,
            COUNT(*) AS image_count,
            MAX(created_at) AS last_activity
     FROM crop_images
     WHERE crop_name = $1 AND plant_number IS NOT NULL
     GROUP BY plant_number`,
    [crop]
  );

  const byNumber = new Map<number, PlantSummary>();

  const upsert = (
    rawNumber: unknown,
    patch: Partial<PlantSummary>,
    activity: unknown
  ) => {
    const number = Number(rawNumber);
    if (!Number.isInteger(number) || number < 1) return;
    const prev = byNumber.get(number) || {
      number,
      noteCount: 0,
      openTodoCount: 0,
      imageCount: 0,
      lastActivity: null as string | null,
    };
    const nextActivity =
      activity != null ? String(activity) : prev.lastActivity;
    const newer =
      nextActivity &&
      (!prev.lastActivity ||
        new Date(nextActivity).getTime() >=
          new Date(prev.lastActivity).getTime())
        ? nextActivity
        : prev.lastActivity;
    byNumber.set(number, {
      ...prev,
      ...patch,
      lastActivity: newer,
    });
  };

  for (const row of notes.rows as any[]) {
    upsert(
      row.plant_number,
      {
        noteCount: Number(row.note_count) || 0,
        openTodoCount: Number(row.open_todo_count) || 0,
      },
      row.last_activity
    );
  }

  for (const row of images.rows as any[]) {
    upsert(
      row.plant_number,
      { imageCount: Number(row.image_count) || 0 },
      row.last_activity
    );
  }

  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

export async function assertWritablePlant(
  crop: string,
  plantNumber: number
): Promise<{ ok: true; meta: CropPlantMeta } | { ok: false; status: number; body: string }> {
  const meta = await getCropPlantMeta(crop);
  if (!meta) {
    return { ok: false, status: 404, body: "Crop not found" };
  }
  if (plantNumber <= meta.displayCount) {
    return { ok: true, meta };
  }

  await ensurePlantNumberColumns();
  const existing = await pool.query(
    `SELECT 1 AS ok FROM crop_notes
     WHERE crop_name = $1 AND plant_number = $2
     LIMIT 1`,
    [crop, plantNumber]
  );
  if (existing.rowCount) return { ok: true, meta };

  const existingImg = await pool.query(
    `SELECT 1 AS ok FROM crop_images
     WHERE crop_name = $1 AND plant_number = $2
     LIMIT 1`,
    [crop, plantNumber]
  );
  if (existingImg.rowCount) return { ok: true, meta };

  return {
    ok: false,
    status: 400,
    body: "Plant number is outside the current plant count",
  };
}
