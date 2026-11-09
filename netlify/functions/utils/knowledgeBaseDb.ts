import pool from "../db";
import {
  RESCUE_WEEKS,
  TURMERIC_PHASES,
  TURMERIC_CHEMICAL_STAGES,
  type RescueWeek,
  type RecipeLine,
} from "./fertilizerRecipes";

/**
 * SHARED knowledge base (global — NOT scoped by farm).
 *
 * This is the "generalised" product knowledge every farmer sees: fertilizer and
 * pesticide names, what they do, and recommended application cycles. It
 * deliberately contains NO private data — no stock quantities, no prices, no
 * purchase notes. A farmer's own inventory amounts stay in the per-farm tables.
 */

export type KbFertilizer = {
  name: string;
  category: string;
  composition: string;
  what_it_does: string;
  how_to_use: string;
  default_unit: string;
};

export type KbPesticide = {
  name: string;
  target: string;
  what_it_does: string;
  advice: string;
  cycle_notes: string;
};

/** Curated, generalised fertilizer knowledge (no prices / stock). */
const FERTILIZER_SEED: KbFertilizer[] = [
  {
    name: "Pepper Fertilizer Mixtures",
    category: "Compound (pepper)",
    composition: "N 14 · P 11 · K 14 · Mg 2",
    what_it_does:
      "Balanced compound blend formulated for black pepper vines across the monsoon feeding windows.",
    how_to_use:
      "Apply per plant at the start of the first and second monsoon rains. Rates scale with vine age (see the Pepper plan).",
    default_unit: "kg",
  },
  {
    name: "Urea",
    category: "Nitrogen",
    composition: "N 46%",
    what_it_does:
      "High-nitrogen fertilizer that drives leafy vegetative growth and deep green colour.",
    how_to_use:
      "Use in small, split doses. Avoid over-application during rhizome/fruit swelling to prevent excess leaf at the cost of yield.",
    default_unit: "kg",
  },
  {
    name: "Superphosphate",
    category: "Phosphorus (TSP)",
    composition: "P₂O₅ ~16–20% (TSP ~46%)",
    what_it_does:
      "Supplies phosphorus for strong root development and early establishment.",
    how_to_use: "Mix into soil beds at planting and during earthing-up stages.",
    default_unit: "kg",
  },
  {
    name: "Sulfate of Potash (SOP)",
    category: "Potassium",
    composition: "K₂O ~50%, S ~18%",
    what_it_does:
      "Chloride-free potassium source improving quality, disease resistance and water regulation.",
    how_to_use: "Apply per plant in rescue and maintenance mixes.",
    default_unit: "kg",
  },
  {
    name: "Muriate of Potash (MOP)",
    category: "Potassium",
    composition: "K₂O ~60%",
    what_it_does:
      "Economical potassium source for rhizome and tuber crops such as turmeric.",
    how_to_use:
      "Split across planting, 60 days and 120 days in the turmeric chemical schedule.",
    default_unit: "kg",
  },
  {
    name: "NPK 19:19:19",
    category: "Compound (balanced)",
    composition: "N 19 · P 19 · K 19",
    what_it_does:
      "Fully water-soluble balanced feed for general growth and quick correction.",
    how_to_use: "Small per-plant doses or as a foliar/drench between main feeds.",
    default_unit: "kg",
  },
  {
    name: "Dolomite",
    category: "Soil amendment (Ca/Mg)",
    composition: "CaCO₃ + MgCO₃",
    what_it_does:
      "Raises soil pH and supplies calcium and magnesium; corrects acidity.",
    how_to_use: "Work into soil before planting or as a periodic top-dress.",
    default_unit: "kg",
  },
  {
    name: "Compost",
    category: "Organic matter",
    composition: "Variable organic",
    what_it_does:
      "Builds soil structure, feeds microbes and improves water/nutrient holding.",
    how_to_use: "Blend generously into beds and bags; safe at high volumes.",
    default_unit: "kg",
  },
  {
    name: "Albert solution",
    category: "Water-soluble + micros",
    composition: "~N 10.5 · P₂O₅ 9 · K₂O 16 · Ca ~10 · Mg 1–2 + Fe/Mn/Zn/Cu/B",
    what_it_does:
      "Balanced water-soluble fertilizer with a full micronutrient package — covers iron and boron so separate FeSO₄/Borax is not needed.",
    how_to_use: "Use as a foliar or drench micronutrient booster.",
    default_unit: "kg",
  },
  {
    name: "MgSO4 (Epsom salt)",
    category: "Magnesium (foliar)",
    composition: "Mg ~9.8%, S ~13%",
    what_it_does:
      "Corrects magnesium deficiency (interveinal yellowing) and supports chlorophyll.",
    how_to_use: "Foliar spray, roughly 150 g / 10 L, early morning or evening.",
    default_unit: "kg",
  },
  {
    name: "ZnSO4",
    category: "Micronutrient (zinc)",
    composition: "Zn ~21–33%, S",
    what_it_does:
      "Supplies zinc for enzyme function and new-leaf development.",
    how_to_use: "Foliar micronutrient, roughly 5 g / 10 L.",
    default_unit: "kg",
  },
  {
    name: "Rock Phosphate",
    category: "Phosphorus (slow-release)",
    composition: "P₂O₅ (slow-release)",
    what_it_does:
      "Slow-release phosphorus and calcium for long-term root-zone reserves.",
    how_to_use: "Mix into the soil/compost blend before planting.",
    default_unit: "kg",
  },
  {
    name: "Trichoderma Viride",
    category: "Biological (microbial shield)",
    composition: "Beneficial fungus",
    what_it_does:
      "Biocontrol fungus that suppresses soil-borne root-rot pathogens and aids root health.",
    how_to_use: "Blend powder into compost before planting; keep soil moist.",
    default_unit: "kg",
  },
  {
    name: "Fish NPK 5.1.1",
    category: "Organic liquid (nitrogen-rich)",
    composition: "N 5 · P 1 · K 1 (organic)",
    what_it_does:
      "Organic liquid feed driving vegetative canopy growth during the vegetative phase.",
    how_to_use:
      "Dilute and drench every ~2 weeks; stop once rhizome swelling begins to avoid excess nitrogen.",
    default_unit: "L",
  },
  {
    name: "Grow More Bloom Special (6-30-30)",
    category: "Compound (bloom/fruit)",
    composition: "N 6 · P 30 · K 30 + TE",
    what_it_does:
      "High phosphorus and potassium feed to push rhizome/fruit swelling and quality.",
    how_to_use: "Drench every 10–12 days during the swelling phase.",
    default_unit: "kg",
  },
];

/** Curated, generalised pesticide knowledge including application cycles. */
const PESTICIDE_SEED: KbPesticide[] = [
  {
    name: "Neem oil (Azadirachtin)",
    target: "Aphids, mites, whitefly, soft-bodied pests",
    what_it_does:
      "Botanical, broad-spectrum repellent and growth disruptor; low toxicity and safe near harvest.",
    advice:
      "Mix with a little mild soap/sticker as an emulsifier. Spray early morning or late evening to avoid leaf burn and protect pollinators.",
    cycle_notes:
      "Preventive cycle: every 7–14 days. During an active outbreak, tighten to every 5–7 days for 2–3 rounds, then return to preventive spacing.",
  },
  {
    name: "Copper fungicide (Bordeaux / copper oxychloride)",
    target: "Fungal & bacterial leaf spot, foot rot, blight",
    what_it_does:
      "Protectant that coats foliage and stops spores from establishing. Best used before infection takes hold.",
    advice:
      "Apply at first sign of disease and before heavy monsoon rain. Do not mix with strongly acidic products.",
    cycle_notes:
      "Protective cycle: every 10–14 days through wet weather. Reapply after heavy rain washes off the coating.",
  },
  {
    name: "Mancozeb",
    target: "Broad fungal diseases (leaf spot, rhizome rot)",
    what_it_does:
      "Multi-site contact fungicide used protectively against a wide range of fungal diseases.",
    advice:
      "Rotate with coppers or systemics to slow resistance. Observe the label pre-harvest interval.",
    cycle_notes:
      "Protective cycle: every 7–10 days in high-pressure periods; alternate chemical families each cycle.",
  },
  {
    name: "Trichoderma (biocontrol)",
    target: "Soil-borne root & rhizome rot (Pythium, Fusarium)",
    what_it_does:
      "Beneficial fungus that colonises the root zone and out-competes rot pathogens — preventive, not curative.",
    advice:
      "Apply to moist soil/compost; avoid tank-mixing with fungicides that kill it.",
    cycle_notes:
      "At planting, then a soil drench every 4–6 weeks through the wet season.",
  },
  {
    name: "Insecticidal soap",
    target: "Aphids, mealybugs, scale crawlers",
    what_it_does:
      "Contact spray that breaks down soft-bodied insect cuticles; needs direct coverage.",
    advice:
      "Spray undersides of leaves thoroughly. Avoid in strong midday sun.",
    cycle_notes:
      "Outbreak cycle: every 5–7 days for 2–3 applications until populations drop.",
  },
];

let schemaReady: Promise<void> | null = null;

function formatLine(line: RecipeLine): string {
  let amount = "";
  if (line.mode === "per_plant" && line.gramsPerPlant != null) {
    amount = `${line.gramsPerPlant} g/plant`;
  } else if (line.mode === "per_tank" && line.gramsPerTank != null) {
    amount = `${line.gramsPerTank} g/tank`;
  } else if (line.gramsFixed != null) {
    amount = `${line.gramsFixed} g`;
  }
  const opt = line.optional ? " (optional)" : "";
  const tip = line.tip ? ` — ${line.tip}` : "";
  return `• ${line.fertilizerName}${amount ? `: ${amount}` : ""}${opt}${tip}`;
}

function stepDetails(week: RescueWeek): string {
  if (!week.lines.length) return "";
  return week.lines.map(formatLine).join("\n");
}

type ScheduleSeed = {
  sourceKey: string;
  cropType: string;
  name: string;
  summary: string;
  weeks: RescueWeek[];
};

const SCHEDULE_SEED: ScheduleSeed[] = [
  {
    sourceKey: "pepper_rescue",
    cropType: "Pepper",
    name: "Pepper monsoon & rescue plan",
    summary:
      "Official monsoon compound feeding plus a four-week soil/foliar rescue sequence for black pepper.",
    weeks: RESCUE_WEEKS,
  },
  {
    sourceKey: "turmeric_organic",
    cropType: "Turmeric",
    name: "Turmeric organic plan (phases)",
    summary:
      "Five-phase organic plan from pre-planting soil prep through flushing & curing.",
    weeks: TURMERIC_PHASES,
  },
  {
    sourceKey: "turmeric_chemical",
    cropType: "Turmeric",
    name: "Turmeric chemical schedule",
    summary:
      "Three-stage Urea / TSP / MOP mix applied at planting, 60 days and 120 days.",
    weeks: TURMERIC_CHEMICAL_STAGES,
  },
];

export function ensureKnowledgeBaseSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS kb_fertilizers (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          category VARCHAR(128) NOT NULL DEFAULT '',
          composition VARCHAR(255) NOT NULL DEFAULT '',
          what_it_does TEXT NULL,
          how_to_use TEXT NULL,
          default_unit VARCHAR(32) NOT NULL DEFAULT 'kg'
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS kb_pesticides (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          target VARCHAR(255) NOT NULL DEFAULT '',
          what_it_does TEXT NULL,
          advice TEXT NULL,
          cycle_notes TEXT NULL
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS kb_schedules (
          id SERIAL PRIMARY KEY,
          source_key VARCHAR(64) NOT NULL UNIQUE,
          crop_type VARCHAR(128) NOT NULL DEFAULT '',
          name VARCHAR(255) NOT NULL,
          summary TEXT NULL
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS kb_schedule_steps (
          id SERIAL PRIMARY KEY,
          schedule_id INT NOT NULL,
          step_order INT NOT NULL DEFAULT 0,
          title VARCHAR(255) NOT NULL,
          summary TEXT NULL,
          details TEXT NULL
        )
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_kb_steps_schedule ON kb_schedule_steps (schedule_id)`
      );

      await seedKnowledgeBase();
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

/** Idempotent content seed. Safe to run on every cold start. */
async function seedKnowledgeBase(): Promise<void> {
  for (const f of FERTILIZER_SEED) {
    await pool.query(
      `INSERT INTO kb_fertilizers
         (name, category, composition, what_it_does, how_to_use, default_unit)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) DO UPDATE SET
         category = EXCLUDED.category,
         composition = EXCLUDED.composition,
         what_it_does = EXCLUDED.what_it_does,
         how_to_use = EXCLUDED.how_to_use,
         default_unit = EXCLUDED.default_unit`,
      [f.name, f.category, f.composition, f.what_it_does, f.how_to_use, f.default_unit]
    );
  }

  for (const p of PESTICIDE_SEED) {
    await pool.query(
      `INSERT INTO kb_pesticides
         (name, target, what_it_does, advice, cycle_notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE SET
         target = EXCLUDED.target,
         what_it_does = EXCLUDED.what_it_does,
         advice = EXCLUDED.advice,
         cycle_notes = EXCLUDED.cycle_notes`,
      [p.name, p.target, p.what_it_does, p.advice, p.cycle_notes]
    );
  }

  for (const s of SCHEDULE_SEED) {
    const existing = await pool.query(
      `SELECT id FROM kb_schedules WHERE source_key = ? LIMIT 1`,
      [s.sourceKey]
    );
    let scheduleId: number;
    if ((existing.rowCount ?? 0) > 0) {
      scheduleId = Number((existing.rows[0] as { id: number }).id);
      await pool.query(
        `UPDATE kb_schedules SET crop_type = ?, name = ?, summary = ? WHERE id = ?`,
        [s.cropType, s.name, s.summary, scheduleId]
      );
      // Rebuild steps so edits to the source recipes propagate.
      await pool.query(`DELETE FROM kb_schedule_steps WHERE schedule_id = ?`, [
        scheduleId,
      ]);
    } else {
      const ins = await pool.query(
        `INSERT INTO kb_schedules (source_key, crop_type, name, summary)
         VALUES (?, ?, ?, ?) RETURNING id`,
        [s.sourceKey, s.cropType, s.name, s.summary]
      );
      scheduleId = Number((ins.rows[0] as { id: number }).id);
    }

    let order = 0;
    for (const week of s.weeks) {
      await pool.query(
        `INSERT INTO kb_schedule_steps
           (schedule_id, step_order, title, summary, details)
         VALUES (?, ?, ?, ?, ?)`,
        [scheduleId, order++, week.title, week.summary, stepDetails(week)]
      );
    }
  }
}

export type KnowledgeBase = {
  fertilizers: Array<KbFertilizer & { id: number }>;
  pesticides: Array<KbPesticide & { id: number }>;
  schedules: Array<{
    id: number;
    source_key: string;
    crop_type: string;
    name: string;
    summary: string;
    steps: Array<{
      step_order: number;
      title: string;
      summary: string;
      details: string;
    }>;
  }>;
};

export async function loadKnowledgeBase(): Promise<KnowledgeBase> {
  await ensureKnowledgeBaseSchema();

  const ferts = await pool.query(
    `SELECT id, name, category, composition, what_it_does, how_to_use, default_unit
       FROM kb_fertilizers ORDER BY category, name`
  );
  const pests = await pool.query(
    `SELECT id, name, target, what_it_does, advice, cycle_notes
       FROM kb_pesticides ORDER BY name`
  );
  const scheds = await pool.query(
    `SELECT id, source_key, crop_type, name, summary
       FROM kb_schedules ORDER BY crop_type, name`
  );
  const steps = await pool.query(
    `SELECT schedule_id, step_order, title, summary, details
       FROM kb_schedule_steps ORDER BY schedule_id, step_order`
  );

  const stepsBySchedule = new Map<number, any[]>();
  for (const row of steps.rows as any[]) {
    const sid = Number(row.schedule_id);
    if (!stepsBySchedule.has(sid)) stepsBySchedule.set(sid, []);
    stepsBySchedule.get(sid)!.push({
      step_order: Number(row.step_order),
      title: row.title,
      summary: row.summary || "",
      details: row.details || "",
    });
  }

  return {
    fertilizers: (ferts.rows as any[]).map((r) => ({
      id: Number(r.id),
      name: r.name,
      category: r.category || "",
      composition: r.composition || "",
      what_it_does: r.what_it_does || "",
      how_to_use: r.how_to_use || "",
      default_unit: r.default_unit || "kg",
    })),
    pesticides: (pests.rows as any[]).map((r) => ({
      id: Number(r.id),
      name: r.name,
      target: r.target || "",
      what_it_does: r.what_it_does || "",
      advice: r.advice || "",
      cycle_notes: r.cycle_notes || "",
    })),
    schedules: (scheds.rows as any[]).map((r) => ({
      id: Number(r.id),
      source_key: r.source_key,
      crop_type: r.crop_type || "",
      name: r.name,
      summary: r.summary || "",
      steps: stepsBySchedule.get(Number(r.id)) || [],
    })),
  };
}
