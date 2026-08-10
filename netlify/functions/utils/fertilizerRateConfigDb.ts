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

export type FertilizerRateConfig = {
  mixtureRates: Record<PlantAge, Record<Monsoon, number>>;
  /** Reference dissolve volume for foliar recipes (liters per tank). */
  tankLiters: number;
  /** Cadence days per week number (string keys "0"…"4"). */
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

export function normalizeRateConfig(raw: unknown): FertilizerRateConfig {
  const base = defaultFertilizerRateConfig();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;

  if (o.mixtureRates && typeof o.mixtureRates === "object") {
    const mr = o.mixtureRates as Record<string, Record<string, number>>;
    for (const age of ["year1", "year2", "year3"] as PlantAge[]) {
      for (const mon of ["first", "second"] as Monsoon[]) {
        const v = Number(mr?.[age]?.[mon]);
        if (Number.isFinite(v) && v >= 0) base.mixtureRates[age][mon] = v;
      }
    }
  }

  const tank = Number(o.tankLiters);
  if (Number.isFinite(tank) && tank > 0) base.tankLiters = tank;

  if (o.intervals && typeof o.intervals === "object") {
    for (const [k, v] of Object.entries(o.intervals as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) base.intervals[k] = Math.floor(n);
    }
  }

  if (Array.isArray(o.weeks)) {
    const byWeek = new Map<number, RescueWeek>();
    for (const w of base.weeks) byWeek.set(w.week, w);
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
    base.weeks = Array.from(byWeek.values()).sort((a, b) => a.week - b.week);
  }

  return base;
}

export async function ensureFertilizerRateConfigTable() {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fertilizer_rate_config (
      id INT PRIMARY KEY,
      config_json LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  ensured = true;
}

export async function getFertilizerRateConfig(): Promise<FertilizerRateConfig> {
  await ensureFertilizerRateConfigTable();
  const res = await pool.query(
    `SELECT config_json FROM fertilizer_rate_config WHERE id = 1`
  );
  if (!res.rowCount) return defaultFertilizerRateConfig();
  try {
    return normalizeRateConfig(JSON.parse(String(res.rows[0].config_json)));
  } catch {
    return defaultFertilizerRateConfig();
  }
}

export async function saveFertilizerRateConfig(
  raw: unknown
): Promise<FertilizerRateConfig> {
  await ensureFertilizerRateConfigTable();
  const config = normalizeRateConfig(raw);
  const json = JSON.stringify(config);
  await pool.query(
    `INSERT INTO fertilizer_rate_config (id, config_json)
     VALUES (1, $1)
     ON DUPLICATE KEY UPDATE config_json = VALUES(config_json)`,
    [json]
  );
  return config;
}

export function pepperGramsFromConfig(
  config: FertilizerRateConfig,
  age: PlantAge,
  monsoon: Monsoon
): number {
  return Number(config.mixtureRates?.[age]?.[monsoon]) || 0;
}
