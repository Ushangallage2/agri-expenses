import pool from "../db";
import {
  PEPPER_MIXTURE,
  RESCUE_WEEKS,
  type PlantAge,
  type Monsoon,
  type RecipeLine,
  type RescueWeek,
} from "./fertilizerRecipes";

let ensured = false;
let migratedLegacy = false;

export type FertilizerRateConfig = {
  mixtureRates: Record<PlantAge, Record<Monsoon, number>>;
  /** Reference dissolve volume for foliar recipes (liters per tank). */
  tankLiters: number;
  /** Cadence days per week number (string keys "0"…"4"). */
  intervals: Record<string, number>;
  weeks: RescueWeek[];
};

export function emptyFertilizerRateConfig(): FertilizerRateConfig {
  return {
    mixtureRates: {
      year1: { first: 0, second: 0 },
      year2: { first: 0, second: 0 },
      year3: { first: 0, second: 0 },
    },
    tankLiters: 10,
    intervals: {},
    weeks: [],
  };
}

export function defaultFertilizerRateConfig(): FertilizerRateConfig {
  return {
    mixtureRates: structuredClone(PEPPER_MIXTURE.rates),
    tankLiters: 10,
    intervals: { "0": 180, "1": 42, "2": 14, "3": 28, "4": 7 },
    weeks: structuredClone(RESCUE_WEEKS),
  };
}

/** True when the crop has a usable week schedule (not the empty starter). */
export function hasFertilizerRates(config: FertilizerRateConfig): boolean {
  return Array.isArray(config.weeks) && config.weeks.length > 0;
}

function sanitizeLine(raw: unknown): RecipeLine | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fertilizerName = String(o.fertilizerName ?? "").trim();
  if (!fertilizerName) return null;
  const mode =
    o.mode === "per_tank" || o.mode === "fixed" || o.mode === "per_plant"
      ? o.mode
      : "per_plant";
  const line: RecipeLine = { fertilizerName, mode };
  if (o.gramsPerPlant != null && Number.isFinite(Number(o.gramsPerPlant))) {
    line.gramsPerPlant = Number(o.gramsPerPlant);
  }
  if (o.gramsPerTank != null && Number.isFinite(Number(o.gramsPerTank))) {
    line.gramsPerTank = Number(o.gramsPerTank);
  }
  if (o.gramsFixed != null && Number.isFinite(Number(o.gramsFixed))) {
    line.gramsFixed = Number(o.gramsFixed);
  }
  if (o.optional) line.optional = true;
  if (typeof o.tip === "string" && o.tip.trim()) line.tip = o.tip.trim();
  return line;
}

/**
 * Normalize a rate config against `base`.
 * Use `emptyFertilizerRateConfig()` as base when reading stored rows so missing
 * fields stay empty (do not inject pepper defaults).
 * Use `defaultFertilizerRateConfig()` when saving admin edits that may omit fields.
 */
export function normalizeRateConfig(
  raw: unknown,
  base: FertilizerRateConfig = defaultFertilizerRateConfig()
): FertilizerRateConfig {
  const out: FertilizerRateConfig = {
    mixtureRates: structuredClone(base.mixtureRates),
    tankLiters: base.tankLiters,
    intervals: { ...base.intervals },
    weeks: structuredClone(base.weeks),
  };
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;

  if (o.mixtureRates && typeof o.mixtureRates === "object") {
    const mr = o.mixtureRates as Record<string, Record<string, number>>;
    for (const age of ["year1", "year2", "year3"] as PlantAge[]) {
      for (const mon of ["first", "second"] as Monsoon[]) {
        const v = Number(mr?.[age]?.[mon]);
        if (Number.isFinite(v) && v >= 0) out.mixtureRates[age][mon] = v;
      }
    }
  }

  const tank = Number(o.tankLiters);
  if (Number.isFinite(tank) && tank > 0) out.tankLiters = tank;

  if (o.intervals && typeof o.intervals === "object") {
    const next: Record<string, number> = { ...out.intervals };
    for (const [k, v] of Object.entries(o.intervals as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) next[k] = Math.floor(n);
    }
    out.intervals = next;
  }

  if (Array.isArray(o.weeks)) {
    const byWeek = new Map<number, RescueWeek>();
    for (const w of out.weeks) byWeek.set(w.week, w);
    for (const item of o.weeks) {
      if (!item || typeof item !== "object") continue;
      const w = item as Record<string, unknown>;
      const week = Number(w.week);
      if (!Number.isFinite(week)) continue;
      const prev = byWeek.get(week) || {
        week,
        title: `Week ${week}`,
        summary: "",
        lines: [],
      };
      const lines = Array.isArray(w.lines)
        ? (w.lines.map(sanitizeLine).filter(Boolean) as RecipeLine[])
        : prev.lines;
      byWeek.set(week, {
        week,
        title: typeof w.title === "string" && w.title.trim() ? w.title : prev.title,
        summary:
          typeof w.summary === "string" ? w.summary : prev.summary,
        lines,
      });
    }
    // Explicit empty weeks array against empty base → stay empty (new crop).
    if (o.weeks.length === 0 && base.weeks.length === 0) {
      out.weeks = [];
    } else {
      out.weeks = Array.from(byWeek.values()).sort((a, b) => a.week - b.week);
    }
  }

  return out;
}

async function migrateLegacyGlobalRow(): Promise<void> {
  if (migratedLegacy) return;

  // Keep legacy global (crop_name NULL) as an unused template unless exactly
  // one crop exists — then attach that config to the crop so existing setups
  // keep working without cloning to every crop.
  const legacy = await pool.query(
    `SELECT id FROM fertilizer_rate_config
     WHERE crop_name IS NULL
     ORDER BY id ASC
     LIMIT 1`
  );
  if (!legacy.rowCount) {
    migratedLegacy = true;
    return;
  }

  try {
    const crops = await pool.query(
      `SELECT name FROM crops ORDER BY name ASC LIMIT 2`
    );
    if (crops.rowCount === 1) {
      const cropName = String(crops.rows[0].name || "").trim();
      if (!cropName) return;
      const taken = await pool.query(
        `SELECT id FROM fertilizer_rate_config WHERE crop_name = ? LIMIT 1`,
        [cropName]
      );
      if (!taken.rowCount) {
        await pool.query(
          `UPDATE fertilizer_rate_config SET crop_name = ? WHERE id = ?`,
          [cropName, legacy.rows[0].id]
        );
      }
      migratedLegacy = true;
    } else if (crops.rowCount > 1) {
      // Multi-crop: leave null template unused; each crop starts empty.
      migratedLegacy = true;
    }
    // 0 crops: retry on a later ensure once a crop exists.
  } catch {
    // crops table may not exist yet during early boot — retry later.
  }
}

export async function ensureFertilizerRateConfigTable() {
  if (ensured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fertilizer_rate_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      crop_name VARCHAR(255) NULL,
      config_json LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_fert_rate_crop (crop_name)
    )
  `);

  // Legacy installs: table may exist without crop_name.
  try {
    await pool.query(
      `ALTER TABLE fertilizer_rate_config ADD COLUMN crop_name VARCHAR(255) NULL`
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(msg)) throw err;
  }

  try {
    await pool.query(
      `CREATE UNIQUE INDEX uq_fert_rate_crop ON fertilizer_rate_config (crop_name)`
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate|ER_DUP_KEYNAME|already exists/i.test(msg)) throw err;
  }

  ensured = true;
  await migrateLegacyGlobalRow();
}

function parseStoredConfig(rawJson: unknown): FertilizerRateConfig {
  try {
    return normalizeRateConfig(
      JSON.parse(String(rawJson)),
      emptyFertilizerRateConfig()
    );
  } catch {
    return emptyFertilizerRateConfig();
  }
}

/**
 * Rates for one crop. Missing row → empty structure (no fallback to another
 * crop or the legacy global template).
 */
export async function getFertilizerRateConfig(
  cropName: string
): Promise<FertilizerRateConfig> {
  const crop = String(cropName || "").trim();
  if (!crop) return emptyFertilizerRateConfig();

  await ensureFertilizerRateConfigTable();
  const res = await pool.query(
    `SELECT config_json FROM fertilizer_rate_config WHERE crop_name = ? LIMIT 1`,
    [crop]
  );
  if (!res.rowCount) return emptyFertilizerRateConfig();
  return parseStoredConfig(res.rows[0].config_json);
}

export async function saveFertilizerRateConfig(
  cropName: string,
  raw: unknown
): Promise<FertilizerRateConfig> {
  const crop = String(cropName || "").trim();
  if (!crop) {
    throw new Error("cropName is required");
  }

  await ensureFertilizerRateConfigTable();
  // Preserve empty weeks for crops that have not been configured yet.
  // Admin "Load defaults" sends a full payload that is stored as-is.
  const config = normalizeRateConfig(raw, emptyFertilizerRateConfig());
  const json = JSON.stringify(config);

  const existing = await pool.query(
    `SELECT id FROM fertilizer_rate_config WHERE crop_name = ? LIMIT 1`,
    [crop]
  );

  if (existing.rowCount) {
    await pool.query(
      `UPDATE fertilizer_rate_config SET config_json = ? WHERE crop_name = ?`,
      [json, crop]
    );
  } else {
    await pool.query(
      `INSERT INTO fertilizer_rate_config (id, crop_name, config_json)
       SELECT next_id, ?, ? FROM (
         SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM fertilizer_rate_config
       ) t`,
      [crop, json]
    );
  }

  return config;
}

export function pepperGramsFromConfig(
  config: FertilizerRateConfig,
  age: PlantAge,
  monsoon: Monsoon
): number {
  return Number(config.mixtureRates?.[age]?.[monsoon]) || 0;
}
