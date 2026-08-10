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

/** Advisor rescue plan — seedable for any crop (doses calibrated for small pepper vines). */
export const DEFAULT_CYCLE_NAME = "Pepper Fertilizer Mixtures + rescue";

export const DEFAULT_CYCLE_DESCRIPTION =
  "Pepper Fertilizer Mixtures (N14-P11-K14-Mg2): Yr1 250+250, Yr2 500+500, Yr3+ 700+100 g/plant " +
  "at 1st/2nd monsoon. Optional Gliricidia mulch halves synthetic dose. " +
  "Rescue weeks 1–4 for soil amendments / foliar / disease. Use Apply week to sync stock.";

export const DEFAULT_CYCLE_STEPS: ScheduleStepInput[] = [
  {
    stepOrder: 0,
    weekNumber: 0,
    title: "Pepper Fertilizer Mixtures",
    instructions:
      "N14-P11-K14-Mg2. Apply at start of each monsoon: " +
      "1st year 250 g + 250 g; 2nd year 500 g + 500 g; 3rd year+ 700 g + 100 g per plant. " +
      "Can cut synthetic 50% with 10–15 kg Gliricidia mulch/vine, 4×/year.",
    suggestedAmount: 250,
    unit: "g/plant",
    intervalDays: 180,
  },
  {
    stepOrder: 1,
    weekNumber: 1,
    title: "Week 1 — Soil rescue mix + water-in",
    instructions:
      "Per small vine: Dolomite 10–15 g, Superphosphate 10 g, Urea 5 g, SOP 5 g, Compost 200 g. " +
      "50 vines ≈ 500–750 g / 500 g / 250 g / 250 g / 10 kg. Water thoroughly. " +
      "Optional NPK/Albert. Prefer urea as root drench; avoid MOP (use SOP).",
    suggestedAmount: 232.5,
    unit: "g/vine",
    intervalDays: 42,
  },
  {
    stepOrder: 2,
    weekNumber: 2,
    title: "Week 2 — Foliar MgSO₄",
    instructions:
      "MgSO₄ (Epsom) 150 g / 10 L (1.5%). Spray early morning or late evening. Yellow-leaf / chlorophyll boost.",
    suggestedAmount: 150,
    unit: "g/10L",
    intervalDays: 14,
  },
  {
    stepOrder: 3,
    weekNumber: 3,
    title: "Week 3 — Foliar micronutrients",
    instructions:
      "Per 10 L: ZnSO₄ 5 g + Albert solution 5 g (covers Fe, B & other micros) + Teepol/Sandovit 2–5 mL. " +
      "No separate FeSO₄/Borax — Albert provides Fe/B. Dissolve separately, then combine. Spray AM/PM only.",
    suggestedAmount: 10,
    unit: "g/10L",
    intervalDays: 28,
  },
  {
    stepOrder: 4,
    weekNumber: 4,
    title: "Week 4 — Disease control",
    instructions:
      "Neem oil or copper fungicide per label if disease signs. Remove blackened leaves/fruit. " +
      "Check moisture — avoid waterlogging. Repeat weekly/biweekly in rainy periods.",
    unit: "label",
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_pack_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sort_order INT NOT NULL DEFAULT 0,
      name VARCHAR(255) NOT NULL,
      unit VARCHAR(32) NOT NULL DEFAULT 'kg',
      stock_qty DECIMAL(14, 3) NOT NULL DEFAULT 0,
      unit_price DECIMAL(14, 2) NOT NULL DEFAULT 0,
      notes TEXT NULL,
      UNIQUE KEY uq_purchase_pack_name (name)
    )
  `);

  ensured = true;
}

export type PurchasePackItem = {
  id?: number;
  sort_order: number;
  name: string;
  unit: string;
  stock_qty: number;
  unit_price: number;
  notes: string | null;
};

export function mapPurchasePackItem(row: Record<string, unknown>): PurchasePackItem {
  return {
    id: row.id != null ? Number(row.id) : undefined,
    sort_order: Number(row.sort_order) || 0,
    name: String(row.name),
    unit: String(row.unit || "kg"),
    stock_qty: toNum(row.stock_qty),
    unit_price: toNum(row.unit_price),
    notes: row.notes != null ? String(row.notes) : null,
  };
}

/** Seed purchase_pack_items from STARTER_PURCHASE_PACK when the table is empty. */
export async function ensurePurchasePackSeeded() {
  await ensureFertilizerTables();
  const count = await pool.query(
    `SELECT COUNT(*) AS n FROM purchase_pack_items`
  );
  if (toNum(count.rows[0]?.n) > 0) return;

  const { STARTER_PURCHASE_PACK } = await import("./fertilizerRecipes");
  let order = 0;
  for (const item of STARTER_PURCHASE_PACK) {
    await pool.query(
      `INSERT INTO purchase_pack_items
        (sort_order, name, unit, stock_qty, unit_price, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        order++,
        item.name,
        item.unit,
        item.stock_qty,
        item.unit_price,
        item.notes,
      ]
    );
  }
}

export async function getPurchasePackItems(): Promise<PurchasePackItem[]> {
  await ensurePurchasePackSeeded();
  const rows = await pool.query(
    `SELECT id, sort_order, name, unit, stock_qty, unit_price, notes
     FROM purchase_pack_items
     ORDER BY sort_order ASC, id ASC`
  );
  return rows.rows.map((r) => mapPurchasePackItem(r as Record<string, unknown>));
}

/** Replace all purchase pack rows. Empty array is rejected by callers. */
export async function savePurchasePackItems(
  items: Array<{
    name: string;
    unit?: string;
    stock_qty: number;
    unit_price: number;
    notes?: string | null;
  }>
): Promise<PurchasePackItem[]> {
  await ensureFertilizerTables();

  const cleaned = items
    .map((item, i) => ({
      sort_order: i,
      name: String(item.name || "").trim(),
      unit: String(item.unit || "kg").trim() || "kg",
      stock_qty: Math.max(0, toNum(item.stock_qty)),
      unit_price: Math.max(0, toNum(item.unit_price)),
      notes:
        item.notes != null && String(item.notes).trim()
          ? String(item.notes).trim()
          : null,
    }))
    .filter((item) => item.name.length > 0);

  if (!cleaned.length) {
    throw new Error("Purchase pack must have at least one product");
  }

  const names = cleaned.map((c) => c.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    throw new Error("Duplicate product names in purchase pack");
  }

  await pool.query(`DELETE FROM purchase_pack_items`);
  for (const item of cleaned) {
    await pool.query(
      `INSERT INTO purchase_pack_items
        (sort_order, name, unit, stock_qty, unit_price, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        item.sort_order,
        item.name,
        item.unit,
        item.stock_qty,
        item.unit_price,
        item.notes,
      ]
    );
  }

  return getPurchasePackItems();
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

/**
 * Upsert the purchase pack into inventory.
 * mode=add: stock += pack qty; unit_price from pack (default Sync)
 * mode=set: stock = pack qty; unit_price from pack (admin reset)
 * mode=add_if_zero: create missing; fill stock only where current is 0 (legacy)
 */
async function migrateLegacyPepperFertilizerName() {
  const LEGACY = "Pepper fertilizer";
  const NEXT = "Pepper Fertilizer Mixtures";

  const oldRow = await pool.query(
    `SELECT id FROM fertilizers WHERE name = $1 LIMIT 1`,
    [LEGACY]
  );
  if (!oldRow.rows[0]) return;

  const newRow = await pool.query(
    `SELECT id FROM fertilizers WHERE name = $1 LIMIT 1`,
    [NEXT]
  );

  const oldId = Number(oldRow.rows[0].id);
  if (!newRow.rows[0]) {
    await pool.query(`UPDATE fertilizers SET name = $1 WHERE id = $2`, [
      NEXT,
      oldId,
    ]);
    return;
  }

  const newId = Number(newRow.rows[0].id);
  await pool.query(
    `UPDATE fertilizer_applications SET fertilizer_id = $1 WHERE fertilizer_id = $2`,
    [newId, oldId]
  );
  await pool.query(
    `UPDATE fertilizer_schedule_steps SET suggested_fertilizer_id = $1 WHERE suggested_fertilizer_id = $2`,
    [newId, oldId]
  );
  await pool.query(
    `DELETE FROM fertilizer_price_history WHERE fertilizer_id = $1`,
    [oldId]
  );
  await pool.query(`DELETE FROM fertilizers WHERE id = $1`, [oldId]);
}

/** Remove FeSO₄ / Borax (and name variants) — Albert covers Fe/B micros. */
async function retireObsoleteInventory() {
  const { RETIRED_INVENTORY_NAMES } = await import("./fertilizerRecipes");
  if (!RETIRED_INVENTORY_NAMES.length) return;

  const placeholders = RETIRED_INVENTORY_NAMES.map((_, i) => `$${i + 1}`).join(
    ", "
  );
  const found = await pool.query(
    `SELECT id, name FROM fertilizers WHERE name IN (${placeholders})`,
    RETIRED_INVENTORY_NAMES
  );

  for (const row of found.rows) {
    const id = Number(row.id);
    await pool.query(
      `UPDATE fertilizer_schedule_steps
       SET suggested_fertilizer_id = NULL
       WHERE suggested_fertilizer_id = $1`,
      [id]
    );
    await pool.query(
      `DELETE FROM fertilizer_price_history WHERE fertilizer_id = $1`,
      [id]
    );
    // Keep application history rows; LEFT JOIN may show null name after delete.
    await pool.query(`DELETE FROM fertilizers WHERE id = $1`, [id]);
  }
}

/** Refresh week-3 copy so existing schedules drop FeSO₄/Borax advice. */
async function syncWeek3MicronutrientInstructions() {
  const week3 = DEFAULT_CYCLE_STEPS.find((s) => s.weekNumber === 3);
  if (!week3?.instructions) return;
  await pool.query(
    `UPDATE fertilizer_schedule_steps
     SET instructions = $1, suggested_amount = $2, unit = $3
     WHERE week_number = 3 AND title LIKE $4`,
    [
      week3.instructions,
      week3.suggestedAmount ?? null,
      week3.unit ?? null,
      "%micronutrient%",
    ]
  );
}

export async function seedStarterInventory(opts?: {
  mode?: "add" | "set" | "add_if_zero";
}) {
  await ensureFertilizerTables();
  await migrateLegacyPepperFertilizerName();
  await retireObsoleteInventory();
  await syncWeek3MicronutrientInstructions();
  const pack = await getPurchasePackItems();
  const mode = opts?.mode || "add";
  const results: {
    name: string;
    id: number;
    stock_qty: number;
    unit_price: number;
    created: boolean;
  }[] = [];

  for (const item of pack) {
    const existing = await pool.query(
      `SELECT id, stock_qty, unit_price FROM fertilizers WHERE name = $1`,
      [item.name]
    );

    if (existing.rows[0]) {
      const id = Number(existing.rows[0].id);
      const current = toNum(existing.rows[0].stock_qty);
      const prevPrice = toNum(existing.rows[0].unit_price);
      let next = current;
      let nextPrice = prevPrice;

      if (mode === "set") {
        next = item.stock_qty;
        nextPrice = item.unit_price;
      } else if (mode === "add") {
        next = current + item.stock_qty;
        nextPrice = item.unit_price;
      } else if (mode === "add_if_zero" && current <= 0 && item.stock_qty > 0) {
        next = item.stock_qty;
      }

      if (mode === "set" || mode === "add") {
        await pool.query(
          `UPDATE fertilizers
           SET stock_qty = $1, unit = $2, unit_price = $3, notes = $4
           WHERE id = $5`,
          [next, item.unit, nextPrice, item.notes, id]
        );
        if (nextPrice !== prevPrice) {
          await recordPriceHistory(id, nextPrice);
        }
      } else {
        await pool.query(
          `UPDATE fertilizers SET stock_qty = $1, unit = $2, notes = $3 WHERE id = $4`,
          [next, item.unit, item.notes, id]
        );
      }
      results.push({
        name: item.name,
        id,
        stock_qty: next,
        unit_price: mode === "add_if_zero" ? prevPrice : nextPrice,
        created: false,
      });
    } else {
      const created = await pool.query(
        `INSERT INTO fertilizers (name, unit, stock_qty, unit_price, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, stock_qty`,
        [item.name, item.unit, item.stock_qty, item.unit_price, item.notes]
      );
      const id = Number(created.rows[0].id);
      if (item.unit_price > 0) {
        await recordPriceHistory(id, item.unit_price);
      }
      results.push({
        name: item.name,
        id,
        stock_qty: toNum(created.rows[0].stock_qty),
        unit_price: item.unit_price,
        created: true,
      });
    }
  }

  return results;
}
