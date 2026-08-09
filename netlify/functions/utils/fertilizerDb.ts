import pool from "../db";

let ensured = false;

export type ScheduleStepInput = {
  stepOrder: number;
  weekNumber?: number | null;
  title: string;
  instructions?: string | null;
  suggestedFertilizerId?: number | null;
  suggestedAmount?: number | null;
  unit?: string | null;
  intervalDays?: number | null;
};

/** Pepper-style 4-week cycle — seedable template for any crop. */
export const DEFAULT_CYCLE_NAME = "4-week nutrient cycle";

export const DEFAULT_CYCLE_DESCRIPTION =
  "Universal 4-week cycle inspired by pepper feeding. Customize amounts per crop. " +
  "Repeat notes: NPK every 6–8 weeks; MgSO₄ every 2–3 weeks; micronutrients monthly; " +
  "calcium every 2–3 months; disease spray weekly or biweekly.";

export const DEFAULT_CYCLE_STEPS: ScheduleStepInput[] = [
  {
    stepOrder: 1,
    weekNumber: 1,
    title: "Base mix + water-in",
    instructions:
      "Soil base mix: dolomite + superphosphate + urea + SOP + NPK + compost + Albert. " +
      "Suggested rate ~150–200g per mature plant / 50–75g per small plant. Water thoroughly after.",
    suggestedAmount: 175,
    unit: "g",
    intervalDays: 28,
  },
  {
    stepOrder: 2,
    weekNumber: 2,
    title: "Foliar MgSO₄",
    instructions: "Foliar spray magnesium sulfate (MgSO₄) at 15g per litre of water.",
    suggestedAmount: 15,
    unit: "g/L",
    intervalDays: 14,
  },
  {
    stepOrder: 3,
    weekNumber: 3,
    title: "Micronutrient foliar",
    instructions:
      "Foliar micronutrients: zinc (Zn), boron (B), and iron (Fe) at label/recommended doses. " +
      "Typically monthly in the broader cycle.",
    unit: "ml/L",
    intervalDays: 28,
  },
  {
    stepOrder: 4,
    weekNumber: 4,
    title: "Disease spray",
    instructions:
      "Preventive disease spray (neem and/or copper). Repeat weekly or biweekly as needed " +
      "outside the fixed week slot.",
    unit: "ml/L",
    intervalDays: 7,
  },
];

export async function ensureFertilizerTables() {
  if (ensured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fertilizers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      unit VARCHAR(32) NOT NULL DEFAULT 'kg',
      stock_qty DECIMAL(14, 3) NOT NULL DEFAULT 0,
      unit_price DECIMAL(14, 2) NOT NULL DEFAULT 0,
      notes TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_fertilizers_name (name)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fertilizer_price_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fertilizer_id INT NOT NULL,
      price DECIMAL(14, 2) NOT NULL,
      recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_fph_fertilizer (fertilizer_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fertilizer_schedules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      crop_name VARCHAR(255) NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_fs_crop (crop_name)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fertilizer_schedule_steps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      schedule_id INT NOT NULL,
      step_order INT NOT NULL DEFAULT 1,
      week_number INT NULL,
      title VARCHAR(255) NOT NULL,
      instructions TEXT NULL,
      suggested_fertilizer_id INT NULL,
      suggested_amount DECIMAL(14, 3) NULL,
      unit VARCHAR(32) NULL,
      interval_days INT NULL,
      INDEX idx_fss_schedule (schedule_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fertilizer_applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      crop_name VARCHAR(255) NOT NULL,
      fertilizer_id INT NOT NULL,
      amount DECIMAL(14, 3) NOT NULL,
      unit VARCHAR(32) NOT NULL,
      applied_at DATETIME NOT NULL,
      notes TEXT NULL,
      schedule_step_id INT NULL,
      created_by VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_fa_crop (crop_name),
      INDEX idx_fa_fertilizer (fertilizer_id),
      INDEX idx_fa_applied (applied_at)
    )
  `);

  ensured = true;
}

export function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function mapFertilizer(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    name: String(row.name),
    unit: String(row.unit || "kg"),
    stock_qty: toNum(row.stock_qty),
    unit_price: toNum(row.unit_price),
    notes: row.notes != null ? String(row.notes) : null,
    created_at: row.created_at,
  };
}

export function mapStep(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    schedule_id: Number(row.schedule_id),
    step_order: Number(row.step_order) || 1,
    week_number: row.week_number != null ? Number(row.week_number) : null,
    title: String(row.title),
    instructions: row.instructions != null ? String(row.instructions) : null,
    suggested_fertilizer_id:
      row.suggested_fertilizer_id != null
        ? Number(row.suggested_fertilizer_id)
        : null,
    suggested_amount:
      row.suggested_amount != null ? toNum(row.suggested_amount) : null,
    unit: row.unit != null ? String(row.unit) : null,
    interval_days:
      row.interval_days != null ? Number(row.interval_days) : null,
  };
}

export function mapSchedule(
  row: Record<string, unknown>,
  steps: ReturnType<typeof mapStep>[] = []
) {
  return {
    id: Number(row.id),
    crop_name: row.crop_name != null ? String(row.crop_name) : null,
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    created_at: row.created_at,
    steps,
  };
}

export function mapApplication(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    crop_name: String(row.crop_name),
    fertilizer_id: Number(row.fertilizer_id),
    fertilizer_name:
      row.fertilizer_name != null ? String(row.fertilizer_name) : null,
    amount: toNum(row.amount),
    unit: String(row.unit || ""),
    applied_at: row.applied_at,
    notes: row.notes != null ? String(row.notes) : null,
    schedule_step_id:
      row.schedule_step_id != null ? Number(row.schedule_step_id) : null,
    created_by: row.created_by != null ? String(row.created_by) : null,
    created_at: row.created_at,
  };
}

export async function insertScheduleSteps(
  scheduleId: number,
  steps: ScheduleStepInput[]
) {
  for (const step of steps) {
    await pool.query(
      `INSERT INTO fertilizer_schedule_steps
        (schedule_id, step_order, week_number, title, instructions,
         suggested_fertilizer_id, suggested_amount, unit, interval_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        scheduleId,
        step.stepOrder,
        step.weekNumber ?? null,
        step.title,
        step.instructions ?? null,
        step.suggestedFertilizerId ?? null,
        step.suggestedAmount ?? null,
        step.unit ?? null,
        step.intervalDays ?? null,
      ]
    );
  }
}

export async function getScheduleWithSteps(scheduleId: number) {
  const sched = await pool.query(
    `SELECT id, crop_name, name, description, created_at
     FROM fertilizer_schedules WHERE id = $1`,
    [scheduleId]
  );
  if (!sched.rows[0]) return null;

  const steps = await pool.query(
    `SELECT id, schedule_id, step_order, week_number, title, instructions,
            suggested_fertilizer_id, suggested_amount, unit, interval_days
     FROM fertilizer_schedule_steps
     WHERE schedule_id = $1
     ORDER BY step_order ASC, id ASC`,
    [scheduleId]
  );

  return mapSchedule(
    sched.rows[0],
    steps.rows.map((r) => mapStep(r as Record<string, unknown>))
  );
}

/** Ensure global template (crop_name NULL) exists; return its id. */
export async function ensureDefaultTemplate(): Promise<number> {
  await ensureFertilizerTables();

  const existing = await pool.query(
    `SELECT id FROM fertilizer_schedules
     WHERE crop_name IS NULL AND name = $1
     LIMIT 1`,
    [DEFAULT_CYCLE_NAME]
  );

  if (existing.rows[0]) {
    return Number(existing.rows[0].id);
  }

  const created = await pool.query(
    `INSERT INTO fertilizer_schedules (crop_name, name, description)
     VALUES (NULL, $1, $2)
     RETURNING id`,
    [DEFAULT_CYCLE_NAME, DEFAULT_CYCLE_DESCRIPTION]
  );
  const id = Number(created.rows[0].id);
  await insertScheduleSteps(id, DEFAULT_CYCLE_STEPS);
  return id;
}

/** Clone the default template (or create fresh) onto a crop. */
export async function seedScheduleForCrop(cropName: string) {
  await ensureFertilizerTables();
  const crop = cropName.trim();
  if (!crop) throw new Error("cropName required");

  const templateId = await ensureDefaultTemplate();
  const template = await getScheduleWithSteps(templateId);
  if (!template) throw new Error("Template missing");

  const created = await pool.query(
    `INSERT INTO fertilizer_schedules (crop_name, name, description)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [crop, template.name, template.description]
  );
  const id = Number(created.rows[0].id);

  await insertScheduleSteps(
    id,
    template.steps.map((s) => ({
      stepOrder: s.step_order,
      weekNumber: s.week_number,
      title: s.title,
      instructions: s.instructions,
      suggestedFertilizerId: s.suggested_fertilizer_id,
      suggestedAmount: s.suggested_amount,
      unit: s.unit,
      intervalDays: s.interval_days,
    }))
  );

  return getScheduleWithSteps(id);
}

export async function recordPriceHistory(
  fertilizerId: number,
  price: number
) {
  await pool.query(
    `INSERT INTO fertilizer_price_history (fertilizer_id, price, recorded_at)
     VALUES ($1, $2, NOW())`,
    [fertilizerId, price]
  );
}
