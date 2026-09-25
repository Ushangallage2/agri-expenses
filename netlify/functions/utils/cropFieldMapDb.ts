import pool from "../db";
import { getCropPlantMeta, listPlantSummaries } from "./plantMapDb";

export type FieldLayer = "hybrid" | "hd" | "satellite" | "streets";

export type CropMapView = {
  lat: number;
  lng: number;
  zoom: number;
  layer: FieldLayer;
  label: string | null;
};

export type FieldPhoto = {
  imageData: string;
  width: number;
  height: number;
};

export type PlantPosition = {
  number: number;
  lat: number | null;
  lng: number | null;
  photoX: number | null;
  photoY: number | null;
};

let ensured = false;

export async function ensureFieldMapTables() {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crop_field_maps (
      crop_name VARCHAR(255) NOT NULL PRIMARY KEY,
      lat DOUBLE NOT NULL,
      lng DOUBLE NOT NULL,
      zoom DOUBLE NOT NULL DEFAULT 17,
      layer VARCHAR(16) NOT NULL DEFAULT 'satellite',
      label VARCHAR(255) NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crop_plant_positions (
      crop_name VARCHAR(255) NOT NULL,
      plant_number INT NOT NULL,
      lat DOUBLE NOT NULL,
      lng DOUBLE NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (crop_name, plant_number),
      INDEX idx_plant_pos_crop (crop_name)
    )
  `);
  try {
    await pool.query(
      `ALTER TABLE crop_field_maps ADD COLUMN photo_data MEDIUMTEXT NULL`
    );
  } catch (err: any) {
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(String(err?.message || err))) {
      throw err;
    }
  }
  try {
    await pool.query(`ALTER TABLE crop_field_maps ADD COLUMN photo_w INT NULL`);
  } catch (err: any) {
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(String(err?.message || err))) {
      throw err;
    }
  }
  try {
    await pool.query(`ALTER TABLE crop_field_maps ADD COLUMN photo_h INT NULL`);
  } catch (err: any) {
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(String(err?.message || err))) {
      throw err;
    }
  }
  try {
    await pool.query(
      `ALTER TABLE crop_plant_positions ADD COLUMN photo_x DOUBLE NULL`
    );
  } catch (err: any) {
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(String(err?.message || err))) {
      throw err;
    }
  }
  try {
    await pool.query(
      `ALTER TABLE crop_plant_positions ADD COLUMN photo_y DOUBLE NULL`
    );
  } catch (err: any) {
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(String(err?.message || err))) {
      throw err;
    }
  }
  try {
    await pool.query(
      `ALTER TABLE crop_field_maps ADD COLUMN layout_json MEDIUMTEXT NULL`
    );
  } catch (err: any) {
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(String(err?.message || err))) {
      throw err;
    }
  }
  try {
    await pool.query(
      `ALTER TABLE crop_plant_positions MODIFY COLUMN lat DOUBLE NULL`
    );
  } catch {
    /* already nullable or unsupported */
  }
  try {
    await pool.query(
      `ALTER TABLE crop_plant_positions MODIFY COLUMN lng DOUBLE NULL`
    );
  } catch {
    /* already nullable or unsupported */
  }

  ensured = true;
}

export function normalizeLayer(value: unknown): FieldLayer {
  if (value === "streets") return "streets";
  if (value === "satellite") return "satellite";
  if (value === "hd") return "hd";
  return "hybrid";
}

export function parseCoord(value: unknown, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export async function getCropMapView(
  crop: string
): Promise<CropMapView | null> {
  await ensureFieldMapTables();
  const res = await pool.query(
    `SELECT lat, lng, zoom, layer, label
     FROM crop_field_maps
     WHERE crop_name = $1`,
    [crop]
  );
  if (!res.rowCount) return null;
  const row = res.rows[0] as {
    lat: number;
    lng: number;
    zoom: number;
    layer: string;
    label: string | null;
  };
  return {
    lat: Number(row.lat),
    lng: Number(row.lng),
    zoom: Number(row.zoom) || 17,
    layer: normalizeLayer(row.layer),
    label: row.label || null,
  };
}

export async function upsertCropMapView(
  crop: string,
  view: CropMapView
) {
  await ensureFieldMapTables();
  await pool.query(
    `INSERT INTO crop_field_maps (crop_name, lat, lng, zoom, layer, label)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON DUPLICATE KEY UPDATE
       lat = VALUES(lat),
       lng = VALUES(lng),
       zoom = VALUES(zoom),
       layer = VALUES(layer),
       label = VALUES(label)`,
    [crop, view.lat, view.lng, view.zoom, view.layer, view.label]
  );
}

export async function getCropFieldPhoto(
  crop: string
): Promise<FieldPhoto | null> {
  await ensureFieldMapTables();
  const res = await pool.query(
    `SELECT photo_data, photo_w, photo_h
     FROM crop_field_maps
     WHERE crop_name = $1`,
    [crop]
  );
  if (!res.rowCount) return null;
  const row = res.rows[0] as {
    photo_data?: string | null;
    photo_w?: number | null;
    photo_h?: number | null;
  };
  if (!row.photo_data) return null;
  return {
    imageData: row.photo_data,
    width: Number(row.photo_w) || 1600,
    height: Number(row.photo_h) || 900,
  };
}

export async function upsertCropFieldPhoto(
  crop: string,
  photo: FieldPhoto | null
) {
  await ensureFieldMapTables();
  const existing = await getCropMapView(crop);
  if (!existing) {
    await upsertCropMapView(crop, {
      lat: 6.77465,
      lng: 79.97151,
      zoom: 19,
      layer: "hybrid",
      label: crop,
    });
  }
  await pool.query(
    `UPDATE crop_field_maps
     SET photo_data = $1, photo_w = $2, photo_h = $3
     WHERE crop_name = $4`,
    [
      photo?.imageData ?? null,
      photo?.width ?? null,
      photo?.height ?? null,
      crop,
    ]
  );
}

export async function listPlantPositions(
  crop: string
): Promise<PlantPosition[]> {
  await ensureFieldMapTables();
  const res = await pool.query(
    `SELECT plant_number, lat, lng, photo_x, photo_y
     FROM crop_plant_positions
     WHERE crop_name = $1
     ORDER BY plant_number ASC`,
    [crop]
  );
  return (res.rows as any[]).map((r) => ({
    number: Number(r.plant_number),
    lat: r.lat == null ? null : Number(r.lat),
    lng: r.lng == null ? null : Number(r.lng),
    photoX: r.photo_x == null ? null : Number(r.photo_x),
    photoY: r.photo_y == null ? null : Number(r.photo_y),
  }));
}

export async function upsertPlantPositions(
  crop: string,
  positions: Array<{
    number: number;
    lat: number | null;
    lng: number | null;
    photoX?: number | null;
    photoY?: number | null;
  }>
) {
  await ensureFieldMapTables();
  for (const p of positions) {
    if (!Number.isInteger(p.number) || p.number < 1) continue;
    const clearing =
      p.lat == null &&
      p.lng == null &&
      p.photoX == null &&
      p.photoY == null;
    if (clearing) {
      await pool.query(
        `DELETE FROM crop_plant_positions
         WHERE crop_name = $1 AND plant_number = $2`,
        [crop, p.number]
      );
      continue;
    }
    const lat = p.lat == null ? null : parseCoord(p.lat, -90, 90);
    const lng = p.lng == null ? null : parseCoord(p.lng, -180, 180);
    const photoX =
      p.photoX == null ? null : parseCoord(p.photoX, 0, 1);
    const photoY =
      p.photoY == null ? null : parseCoord(p.photoY, 0, 1);
    if (lat == null && lng == null && photoX == null && photoY == null) {
      continue;
    }
    await pool.query(
      `INSERT INTO crop_plant_positions (crop_name, plant_number, lat, lng, photo_x, photo_y)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON DUPLICATE KEY UPDATE
         lat = COALESCE(VALUES(lat), lat),
         lng = COALESCE(VALUES(lng), lng),
         photo_x = COALESCE(VALUES(photo_x), photo_x),
         photo_y = COALESCE(VALUES(photo_y), photo_y)`,
      [crop, p.number, lat, lng, photoX, photoY]
    );
  }
}

export type LayoutPoint = { x: number; y: number };

export type PlantLayout = {
  outline: LayoutPoint[];
  tiles: { number: number; x: number; y: number }[];
  widthM: number | null;
  lengthM: number | null;
};

function parseUnit(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

function parseMeters(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) return null;
  return n;
}

export function parsePlantLayout(raw: unknown): PlantLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as {
    outline?: unknown;
    tiles?: unknown;
    widthM?: unknown;
    lengthM?: unknown;
  };
  const outline: LayoutPoint[] = [];
  if (Array.isArray(body.outline)) {
    for (const point of body.outline) {
      const row = point as { x?: unknown; y?: unknown };
      const x = parseUnit(row?.x);
      const y = parseUnit(row?.y);
      if (x == null || y == null) continue;
      outline.push({ x, y });
    }
  }
  if (outline.length < 3 || outline.length > 32) return null;
  const tiles: PlantLayout["tiles"] = [];
  if (Array.isArray(body.tiles)) {
    for (const tile of body.tiles) {
      const row = tile as { number?: unknown; x?: unknown; y?: unknown };
      const number = Number(row?.number);
      const x = parseUnit(row?.x);
      const y = parseUnit(row?.y);
      if (!Number.isInteger(number) || number < 1 || x == null || y == null) {
        continue;
      }
      tiles.push({ number, x, y });
    }
  }
  return {
    outline,
    tiles,
    widthM: parseMeters(body.widthM),
    lengthM: parseMeters(body.lengthM),
  };
}

export async function getPlantLayout(crop: string): Promise<PlantLayout | null> {
  await ensureFieldMapTables();
  const res = await pool.query(
    `SELECT layout_json FROM crop_field_maps WHERE crop_name = $1`,
    [crop]
  );
  if (!res.rowCount) return null;
  const raw = (res.rows[0] as { layout_json?: string | null }).layout_json;
  if (!raw) return null;
  try {
    return parsePlantLayout(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function savePlantLayout(crop: string, layout: PlantLayout) {
  await ensureFieldMapTables();
  const existing = await getCropMapView(crop);
  if (!existing) {
    await upsertCropMapView(crop, {
      lat: 6.77465,
      lng: 79.97151,
      zoom: 19,
      layer: "hybrid",
      label: crop,
    });
  }
  await pool.query(
    `UPDATE crop_field_maps SET layout_json = $1 WHERE crop_name = $2`,
    [JSON.stringify(layout), crop]
  );
}

export async function loadFieldMapPayload(crop: string) {
  const meta = await getCropPlantMeta(crop);
  if (!meta) return null;
  const [view, positions, summaries] = await Promise.all([
    getCropMapView(crop),
    listPlantPositions(crop),
    listPlantSummaries(crop),
  ]);
  const summaryBy = new Map(summaries.map((s) => [s.number, s]));
  const posBy = new Map(positions.map((p) => [p.number, p]));
  const extra = positions
    .map((p) => p.number)
    .filter((n) => n > meta.displayCount);
  const numbers = [
    ...Array.from({ length: meta.displayCount }, (_, i) => i + 1),
    ...extra,
  ];
  return {
    crop: meta.name,
    status: meta.status,
    plantCount: meta.plantCount,
    closedPlantCount: meta.closedPlantCount,
    displayCount: meta.displayCount,
    map: view,
    photo: await getCropFieldPhoto(crop),
    plants: numbers.map((number) => {
      const pos = posBy.get(number);
      const sum = summaryBy.get(number);
      return {
        number,
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
        photoX: pos?.photoX ?? null,
        photoY: pos?.photoY ?? null,
        retired: number > meta.displayCount,
        noteCount: sum?.noteCount || 0,
        openTodoCount: sum?.openTodoCount || 0,
        imageCount: sum?.imageCount || 0,
      };
    }),
  };
}
