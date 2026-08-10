import pool from "../db";
import {
  PEPPER_MIXTURE,
  RESCUE_WEEKS,
  TURMERIC_PHASES,
  TURMERIC_CHEMICAL_STAGES,
  isTurmericCropName,
  type PlantAge,
  type Monsoon,
  type RecipeLine,
  type RescueWeek,
} from "./fertilizerRecipes";
import {
  ensureTurmericPlanNotes,
  ensureTurmericChemicalPlanNotes,
} from "./turmericPlanNotes";

let ensured = false;
let migratedLegacy = false;

export type FertilizerRateConfig = {
  mixtureRates: Record<PlantAge, Record<Monsoon, number>>;
  /** Reference dissolve volume for foliar recipes (liters per tank). */
  tankLiters: number;
  /** Cadence days per week number (string keys). */
  intervals: Record<string, number>;
  weeks: RescueWeek[];
};

export function defaultFertilizerRateConfig(): FertilizerRateConfig {
  return {
    mixtureRates: structuredClone(PEPPER_MIXTURE.rates),
    tankLiters: 10,
    intervals: { "0": 180, "1": 42, "2": 14, "3": 28, "4": 7 },
    weeks: structuredClone(RESCUE_WEEKS),
  };
}

export function defaultTurmericFertilizerRateConfig(): FertilizerRateConfig {
  return {
    mixtureRates: structuredClone(PEPPER_MIXTURE.rates),
    tankLiters: 1,
    intervals: { "1": 365, "2": 21, "3": 14, "4": 11, "5": 60 },
    weeks: structuredClone(TURMERIC_PHASES),
  };
}

export function defaultTurmericChemicalFertilizerRateConfig(): FertilizerRateConfig {
  return {
    mixtureRates: structuredClone(PEPPER_MIXTURE.rates),
    tankLiters: 1,
    intervals: { "1": 365, "2": 60, "3": 60 },
    weeks: structuredClone(TURMERIC_CHEMICAL_STAGES),
  };
}

/** True when rate config is the chemical Urea/TSP/MOP three-stage plan. */
export function isTurmericChemicalRateConfig(
  config: FertilizerRateConfig | null | undefined
): boolean {
  if (!config?.weeks?.length) return false;
  const hasMop = config.weeks.some((w) =>
    w.lines.some((l) =>
      /muriate of potash|\(mop\)/i.test(l.fertilizerName || "")
    )
  );
  const hasStageTitle = config.weeks.some((w) =>
    /^Stage\s+\d+/i.test(w.title || "")
  );
  return hasMop || hasStageTitle;
}

/** Pepper defaults, or turmeric Extra-Premium plan when crop name matches. */
export function defaultFertilizerRateConfigForCrop(
  cropName: string
): FertilizerRateConfig {
  return isTurmericCropName(cropName)
    ? defaultTurmericFertilizerRateConfig()
    : defaultFertilizerRateConfig();
}

/** True when the crop has a usable week schedule. */
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
 * Normalize a rate config against `base` (defaults when omitted).
 * Pass crop-appropriate base so turmeric does not pick up pepper weeks.
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
    // Full weeks array from client/DB replaces base weeks (avoids pepper week-0
    // leaking onto turmeric Phase 1–5 schedules).
    const byWeek = new Map<number, RescueWeek>();
    for (const item of o.weeks) {
      if (!item || typeof item !== "object") continue;
      const w = item as Record<string, unknown>;
      const week = Number(w.week);
      if (!Number.isFinite(week)) continue;
      const baseWeek = out.weeks.find((x) => x.week === week);
      const prev = baseWeek || {
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
    if (byWeek.size > 0) {
      out.weeks = Array.from(byWeek.values()).sort((a, b) => a.week - b.week);
    }
  }

  return out;
}

async function migrateLegacyGlobalRow(): Promise<void> {
  if (migratedLegacy) return;

  // Legacy global (crop_name NULL) is unused as a live config. If exactly one
  // crop exists and has no row yet, attach the legacy row to that crop once.
  // Otherwise leave it; each crop seeds from code defaults on first get.
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

function parseStoredConfig(
  rawJson: unknown,
  cropName: string
): FertilizerRateConfig {
  let base = defaultFertilizerRateConfigForCrop(cropName);
  try {
    const raw = JSON.parse(String(rawJson));
    const peek = normalizeRateConfig(raw, base);
    if (isTurmericCropName(cropName) && isTurmericChemicalRateConfig(peek)) {
      base = defaultTurmericChemicalFertilizerRateConfig();
      return normalizeRateConfig(raw, base);
    }
    return peek;
  } catch {
    return structuredClone(base);
  }
}

/** True when stored JSON has no usable weeks (prior "start empty" rows). */
function storedWeeksAreEmpty(rawJson: unknown): boolean {
  try {
    const raw = JSON.parse(String(rawJson));
    return !Array.isArray(raw?.weeks) || raw.weeks.length === 0;
  } catch {
    return true;
  }
}

/** Detect pepper Mixtures template wrongly stored on a turmeric crop. */
function storedLooksLikePepperTemplate(rawJson: unknown): boolean {
  try {
    const raw = JSON.parse(String(rawJson));
    const weeks = Array.isArray(raw?.weeks) ? raw.weeks : [];
    return weeks.some((w: any) => {
      if (/pepper fertilizer mixtures/i.test(String(w?.title || ""))) {
        return true;
      }
      const lines = Array.isArray(w?.lines) ? w.lines : [];
      return lines.some(
        (l: any) =>
          String(l?.fertilizerName || "") === "Pepper Fertilizer Mixtures"
      );
    });
  } catch {
    return false;
  }
}

/**
 * Persist a clone of the crop-type default template for this crop only.
 * Does not read another crop's live config.
 */
async function seedDefaultForCrop(
  crop: string
): Promise<FertilizerRateConfig> {
  const config = await saveFertilizerRateConfig(
    crop,
    defaultFertilizerRateConfigForCrop(crop)
  );
  try {
    await ensureTurmericPlanNotes(crop);
  } catch (err) {
    console.error("turmeric plan notes seed:", err);
  }
  return config;
}

/**
 * Rates for one crop. Missing row or empty weeks → clone defaults, persist,
 * return. Never falls back to another crop's live config.
 * Turmeric-named crops seed the turmeric template; others seed pepper/rescue.
 */
export async function getFertilizerRateConfig(
  cropName: string
): Promise<FertilizerRateConfig> {
  const crop = String(cropName || "").trim();
  if (!crop) return defaultFertilizerRateConfig();

  await ensureFertilizerRateConfigTable();
  const res = await pool.query(
    `SELECT config_json FROM fertilizer_rate_config WHERE crop_name = ? LIMIT 1`,
    [crop]
  );
  if (!res.rowCount) {
    return seedDefaultForCrop(crop);
  }

  // Crops left empty by the prior "start empty" product choice — re-seed once.
  if (storedWeeksAreEmpty(res.rows[0].config_json)) {
    return seedDefaultForCrop(crop);
  }

  // Turmeric crops that were wrongly auto-seeded with pepper Mixtures — replace once.
  if (
    isTurmericCropName(crop) &&
    storedLooksLikePepperTemplate(res.rows[0].config_json)
  ) {
    return seedDefaultForCrop(crop);
  }

  // Turmeric crops with rates already saved still get plan notes (idempotent).
  try {
    await ensureTurmericPlanNotes(crop);
  } catch (err) {
    console.error("turmeric plan notes ensure:", err);
  }

  const config = parseStoredConfig(res.rows[0].config_json, crop);
  if (isTurmericChemicalRateConfig(config)) {
    try {
      await ensureTurmericChemicalPlanNotes(crop);
    } catch (err) {
      console.error("turmeric chemical notes ensure:", err);
    }
  }

  return config;
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
  // Prefer chemical base when the payload is the Urea/TSP/MOP stage plan so
  // intervals/weeks do not pick up leftover Extra-Premium Phase 4–5 keys.
  let base = defaultFertilizerRateConfigForCrop(crop);
  if (isTurmericCropName(crop)) {
    const peek = normalizeRateConfig(raw, base);
    if (isTurmericChemicalRateConfig(peek)) {
      base = defaultTurmericChemicalFertilizerRateConfig();
    }
  }
  const config = normalizeRateConfig(raw, base);
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
    try {
      await pool.query(
        `INSERT INTO fertilizer_rate_config (id, crop_name, config_json)
         SELECT next_id, ?, ? FROM (
           SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM fertilizer_rate_config
         ) t`,
        [crop, json]
      );
    } catch (err: any) {
      const msg = String(err?.message || err);
      const dup =
        err?.code === "ER_DUP_ENTRY" ||
        err?.errno === 1062 ||
        /Duplicate/i.test(msg);
      if (!dup) throw err;
      await pool.query(
        `UPDATE fertilizer_rate_config SET config_json = ? WHERE crop_name = ?`,
        [json, crop]
      );
    }
  }

  try {
    await ensureTurmericPlanNotes(crop);
  } catch (err) {
    console.error("turmeric plan notes after save:", err);
  }

  if (isTurmericChemicalRateConfig(config)) {
    try {
      await ensureTurmericChemicalPlanNotes(crop);
    } catch (err) {
      console.error("turmeric chemical notes after save:", err);
    }
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
