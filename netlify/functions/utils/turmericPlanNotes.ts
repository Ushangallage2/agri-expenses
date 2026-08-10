import pool from "../db";
import { ensureCropNotesTable } from "./cropNotesDb";
import { isTurmericCropName } from "./fertilizerRecipes";
import { invalidate } from "./memoryCache";

/** Idempotent source keys for Extra-Premium Localized Turmeric Plan notes. */
export function turmericPlanSource(phase: number): string {
  return `turmeric_plan:phase${phase}`;
}

/** Idempotent source keys for Chemical Fertilizer Schedule notes. */
export function turmericChemSource(stage: number): string {
  return `turmeric_chem:stage${stage}`;
}

export type TurmericPlanNoteSeed = {
  phase: number;
  note: string;
};

export type TurmericChemNoteSeed = {
  stage: number;
  note: string;
};

/**
 * Human-readable phase guidance seeded into crop_notes (entry_type=note).
 * Preserve Sinhala මාළු (UTF-8).
 */
export const TURMERIC_PLAN_NOTE_SEEDS: TurmericPlanNoteSeed[] = [
  {
    phase: 1,
    note:
      "[Turmeric Plan · Phase 1] Pre-Planting Soil Prep (7 days before planting)\n" +
      "Focus: long-term mineral foundations and root zone protection.\n" +
      "• Mix 2 tbsp Down To Earth Dolomite Lime (Ca/Mg) + 3 tbsp Rock Phosphate into 50% compost / 50% soil-sand in a rolled-down 50kg rice bag.\n" +
      "• Microbial shield: 1 tbsp Trichoderma Viride powder into the compost blend.\n" +
      "• Moisten like a wrung-out sponge; rest 7 days before planting.",
  },
  {
    phase: 2,
    note:
      "[Turmeric Plan · Phase 2] Months 0–2 — Sprouting & Rooting\n" +
      "Focus: root explosion; bio-stimulants only (no heavy nutrients).\n" +
      "• Roocta Dip: 1 tsp (~3–5g) Roocta Rooting Powder / 1 L water; soak 4–5 seed pieces 15 min; bury 2–3 inches.\n" +
      "• After sprouting: 1 ml Maxigrow + 1 ml HS Liquid Fertilizer / 1 L water; pour 500 ml over soil every 3 weeks.\n" +
      "• Minimal watering (bag retains moisture).",
  },
  {
    phase: 3,
    note:
      "[Turmeric Plan · Phase 3] Months 2–4 — Vegetative Canopy\n" +
      "Focus: deep-green leaves / solar capture. Full sunlight.\n" +
      "• Pure මාළු (Fish) NPK 5.1.1 liquid: 2 tbsp (30 ml) / 2 L water; pour all 2 L across bag every 2 weeks.\n" +
      "• Foliar: ½ tsp (2.5 ml) HS Liquid / 1 L spray; leaves early morning once weekly (2×/week if light green).\n" +
      "• Product tip: Pure මාළු sourcing — 0764658239.",
  },
  {
    phase: 4,
    note:
      "[Turmeric Plan · Phase 4] Months 5–7 — Rhizome Swelling\n" +
      "Focus: underground weight / thickness.\n" +
      "• Grow More Bloom Special (6-30-30 + TE): 1 tbsp (~15g) / 2 L water; drench every 10–12 days.\n" +
      "• Stop Pure මාළු fish fertilizer in this phase (avoid excess N).",
  },
  {
    phase: 5,
    note:
      "[Turmeric Plan · Phase 5] Month 8 — Flushing & Curing\n" +
      "• Products: none. Stop all fertilizers.\n" +
      "• Weeks 1–2: clean water only (~1 L when bag feels light) to flush salts.\n" +
      "• Final 2 weeks: stop watering; leaves dry/brown → curcumin concentration + skin curing.",
  },
];

/**
 * Chemical schedule notes (Urea / TSP / MOP three-stage plan).
 * Seeded only when the chemical rate template is loaded/saved.
 */
export const TURMERIC_CHEM_NOTE_SEEDS: TurmericChemNoteSeed[] = [
  {
    stage: 1,
    note:
      "[Turmeric Chemical · Stage 1] At Planting\n" +
      "Mix (per 1000 plants): 12 kg Urea + 10 kg TSP (Superphosphate) + 12 kg MOP = 34 kg total.\n" +
      "• Apply 1/3 of the mix into soil beds when burying seed rhizomes.\n" +
      "• Per stage / 1000 plants: Urea 4 kg · TSP ≈3.333 kg · MOP 4 kg (≈4 / 3.333 / 4 g per plant).",
  },
  {
    stage: 2,
    note:
      "[Turmeric Chemical · Stage 2] At 60 Days (2 Months)\n" +
      "• Earthing up + apply the second 1/3 of the same Urea / TSP / MOP mix.\n" +
      "• Same amounts as Stage 1 (4 / ≈3.333 / 4 g per plant).",
  },
  {
    stage: 3,
    note:
      "[Turmeric Chemical · Stage 3] At 120 Days (4 Months)\n" +
      "• Apply the final 1/3 of the mix before leaf growth stops.\n" +
      "• Same amounts as Stage 1 (4 / ≈3.333 / 4 g per plant).",
  },
];

/**
 * Idempotent: insert missing turmeric_plan:phaseN notes for a turmeric crop.
 * No-op for non-turmeric names.
 */
export async function ensureTurmericPlanNotes(cropName: string): Promise<void> {
  const crop = String(cropName || "").trim();
  if (!crop || !isTurmericCropName(crop)) return;

  await ensureCropNotesTable();
  let inserted = 0;

  for (const seed of TURMERIC_PLAN_NOTE_SEEDS) {
    const source = turmericPlanSource(seed.phase);
    const existing = await pool.query(
      `SELECT id FROM crop_notes
       WHERE crop_name = ? AND source = ? AND entry_type = 'note'
       LIMIT 1`,
      [crop, source]
    );
    if (existing.rowCount) continue;

    await pool.query(
      `INSERT INTO crop_notes (crop_name, note, entry_type, completed, source)
       VALUES (?, ?, 'note', 0, ?)`,
      [crop, seed.note, source]
    );
    inserted += 1;
  }

  if (inserted > 0) {
    invalidate(`cropNotes:${crop}`);
    invalidate("cropNotes:");
  }
}

/**
 * Idempotent: insert missing turmeric_chem:stageN notes for a turmeric crop.
 * Call when the chemical rate template is loaded/saved. Does not remove premium notes.
 */
export async function ensureTurmericChemicalPlanNotes(
  cropName: string
): Promise<void> {
  const crop = String(cropName || "").trim();
  if (!crop || !isTurmericCropName(crop)) return;

  await ensureCropNotesTable();
  let inserted = 0;

  for (const seed of TURMERIC_CHEM_NOTE_SEEDS) {
    const source = turmericChemSource(seed.stage);
    const existing = await pool.query(
      `SELECT id FROM crop_notes
       WHERE crop_name = ? AND source = ? AND entry_type = 'note'
       LIMIT 1`,
      [crop, source]
    );
    if (existing.rowCount) continue;

    await pool.query(
      `INSERT INTO crop_notes (crop_name, note, entry_type, completed, source)
       VALUES (?, ?, 'note', 0, ?)`,
      [crop, seed.note, source]
    );
    inserted += 1;
  }

  if (inserted > 0) {
    invalidate(`cropNotes:${crop}`);
    invalidate("cropNotes:");
  }
}
