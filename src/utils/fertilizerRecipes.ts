/**
 * Keep aligned with netlify/functions/utils/fertilizerRecipes.ts
 * (shared types, PEPPER_MIXTURE rates, RESCUE_WEEKS, TURMERIC_PHASES,
 * TURMERIC_CHEMICAL_STAGES — not STARTER_PURCHASE_PACK).
 */
export type RecipeLine = {
  fertilizerName: string;
  mode: "per_plant" | "per_tank" | "fixed";
  gramsPerPlant?: number;
  gramsPerTank?: number;
  gramsFixed?: number;
  optional?: boolean;
  tip?: string;
};

export type RescueWeek = {
  week: number;
  title: string;
  summary: string;
  lines: RecipeLine[];
};

export type PlantAge = "year1" | "year2" | "year3";
export type Monsoon = "first" | "second";

/** Official Pepper Fertilizer Mixtures (N14 P11 K14 Mg2) — g/plant per monsoon. */
export const PEPPER_MIXTURE = {
  productName: "Pepper Fertilizer Mixtures",
  label: "Pepper Fertilizer Mixtures",
  composition: "N 14 · P 11 · K 14 · Mg 2",
  /** g / plant / application */
  rates: {
    year1: { first: 250, second: 250 }, // 1st year (6 months after planting)
    year2: { first: 500, second: 500 },
    year3: { first: 700, second: 100 }, // 3rd year and onward
  } as Record<PlantAge, Record<Monsoon, number>>,
  ageLabels: {
    year1: "1st year (6 months after planting)",
    year2: "2nd year",
    year3: "3rd year and onward",
  } as Record<PlantAge, string>,
  monsoonLabels: {
    first: "Beginning of first monsoonal rains",
    second: "Beginning of second monsoonal rains",
  } as Record<Monsoon, string>,
  gliricidiaNote:
    "Synthetic dose can be cut 50% if you mulch 10–15 kg fresh Gliricidia leaves/branches per vine, 4× per year.",
};

export function pepperMixtureGrams(age: PlantAge, monsoon: Monsoon): number {
  return PEPPER_MIXTURE.rates[age][monsoon];
}

/**
 * week 0 = Pepper Fertilizer Mixtures (official monsoon timetable — amounts set in UI)
 * weeks 1–4 = advisor rescue plan
 */
export const RESCUE_WEEKS: RescueWeek[] = [
  {
    week: 0,
    title: "Pepper Fertilizer Mixtures",
    summary:
      "N14-P11-K14-Mg2. Rates g/plant: Yr1 250+250 · Yr2 500+500 · Yr3+ 700+100 (1st / 2nd monsoon). " +
      PEPPER_MIXTURE.gliricidiaNote,
    lines: [
      {
        fertilizerName: "Pepper Fertilizer Mixtures",
        mode: "per_plant",
        gramsPerPlant: 250,
        tip: "Pick plant age + monsoon above — amount updates from the official table",
      },
    ],
  },
  {
    week: 1,
    title: "Week 1 — Soil rescue mix",
    summary:
      "Per small vine: Dolomite 10–15g, Superphosphate 10g, Urea 5g, SOP 5g, Compost 200g.",
    lines: [
      {
        fertilizerName: "Dolomite",
        mode: "per_plant",
        gramsPerPlant: 12.5,
      },
      {
        fertilizerName: "Superphosphate",
        mode: "per_plant",
        gramsPerPlant: 10,
      },
      {
        fertilizerName: "Urea",
        mode: "per_plant",
        gramsPerPlant: 5,
      },
      {
        fertilizerName: "Sulfate of Potash (SOP)",
        mode: "per_plant",
        gramsPerPlant: 5,
      },
      {
        fertilizerName: "Compost",
        mode: "per_plant",
        gramsPerPlant: 200,
      },
      {
        fertilizerName: "NPK 19:19:19",
        mode: "per_plant",
        gramsPerPlant: 5,
        optional: true,
      },
      {
        fertilizerName: "Albert solution",
        mode: "per_plant",
        gramsPerPlant: 5,
        optional: true,
        tip: "Albert supplies Fe, B, Mn, Zn, Cu + macros/Ca/Mg",
      },
    ],
  },
  {
    week: 2,
    title: "Week 2 — Foliar MgSO₄",
    summary: "MgSO₄ 150 g / 10 L. Spray early morning or late evening.",
    lines: [
      {
        fertilizerName: "MgSO4 (Epsom salt)",
        mode: "per_tank",
        gramsPerTank: 150,
      },
    ],
  },
  {
    week: 3,
    title: "Week 3 — Foliar micronutrients",
    summary:
      "Per 10 L: ZnSO₄ 5 g + Albert solution 5 g (covers Fe, B & other micros) + sticker 2–5 mL. " +
      "No separate FeSO₄/Borax — Albert provides Fe/B.",
    lines: [
      { fertilizerName: "ZnSO4", mode: "per_tank", gramsPerTank: 5 },
      {
        fertilizerName: "Albert solution",
        mode: "per_tank",
        gramsPerTank: 5,
        tip: "Replaces FeSO₄ + Borax (Albert has Fe, B, Mn, Zn, Cu)",
      },
    ],
  },
  {
    week: 4,
    title: "Week 4 — Disease control",
    summary:
      "Neem oil or copper fungicide per label. Remove diseased leaves. Check moisture.",
    lines: [],
  },
];

export function lineGrams(
  line: RecipeLine,
  vineCount: number,
  tankCount: number
): number {
  if (line.mode === "per_plant") {
    return (line.gramsPerPlant || 0) * Math.max(0, vineCount);
  }
  if (line.mode === "per_tank") {
    return (line.gramsPerTank || 0) * Math.max(0, tankCount);
  }
  return line.gramsFixed || 0;
}

/** Editable rates stored in DB (admin). Defaults match RESCUE_WEEKS / PEPPER_MIXTURE. */
export type FertilizerRateConfig = {
  mixtureRates: Record<PlantAge, Record<Monsoon, number>>;
  tankLiters: number;
  intervals: Record<string, number>;
  weeks: RescueWeek[];
  /** User-pinned ongoing weeks for this crop (multiple allowed). */
  ongoingWeeks?: number[];
};

export function defaultFertilizerRateConfig(): FertilizerRateConfig {
  return {
    mixtureRates: structuredClone(PEPPER_MIXTURE.rates),
    tankLiters: 10,
    intervals: { "0": 180, "1": 42, "2": 14, "3": 28, "4": 7 },
    weeks: structuredClone(RESCUE_WEEKS),
    ongoingWeeks: [],
  };
}

/**
 * Extra-Premium Localized Turmeric Plan — weeks 1–5 = Phase 1–5
 * (avoids pepper week-0 Mixtures special-case in Apply UI).
 * tbsp≈15g, tsp≈5g; liquids tracked as ml≈g for stock.
 */
export const TURMERIC_PHASES: RescueWeek[] = [
  {
    week: 1,
    title: "Phase 1 — Pre-Planting Soil Prep",
    summary:
      "7 days before planting: mineral foundations + microbial shield in 50% compost / 50% soil-sand (50kg rice bag). Moisten like wrung-out sponge; rest 7 days.",
    lines: [
      {
        fertilizerName: "Dolomite",
        mode: "per_plant",
        gramsPerPlant: 30,
        tip: "2 tbsp Down To Earth Dolomite Lime (Ca/Mg) per bag",
      },
      {
        fertilizerName: "Rock Phosphate",
        mode: "per_plant",
        gramsPerPlant: 45,
        tip: "3 tbsp Down To Earth Rock Phosphate (slow-release P) per bag",
      },
      {
        fertilizerName: "Trichoderma Viride",
        mode: "per_plant",
        gramsPerPlant: 15,
        tip: "1 tbsp powder into compost blend (microbial shield)",
      },
    ],
  },
  {
    week: 2,
    title: "Phase 2 — Months 0–2 Sprouting & Rooting",
    summary:
      "Root explosion — bio-stimulants only. Roocta dip at planting; after sprouting pour 500 ml of Maxigrow+HS dilution per bag every 3 weeks. Minimal watering.",
    lines: [
      {
        fertilizerName: "Roocta Rooting Powder",
        mode: "per_plant",
        gramsPerPlant: 4,
        optional: true,
        tip: "Roocta Dip: 1 tsp (~3–5g) / 1 L; soak 4–5 seed pieces 15 min; bury 2–3 inches",
      },
      {
        fertilizerName: "Maxigrow",
        mode: "per_plant",
        gramsPerPlant: 0.5,
        tip: "1 ml Maxigrow + 1 ml HS / 1 L water; pour 500 ml over soil every 3 weeks",
      },
      {
        fertilizerName: "HS Liquid Fertilizer",
        mode: "per_plant",
        gramsPerPlant: 0.5,
        tip: "Paired with Maxigrow in the same 1 L dilution; 500 ml per bag",
      },
    ],
  },
  {
    week: 3,
    title: "Phase 3 — Months 2–4 Vegetative Canopy",
    summary:
      "Deep-green leaves / solar capture. Soil: Pure මාළු fish NPK 5.1.1 every 2 weeks. Foliar HS weekly (2× if light green). Full sunlight.",
    lines: [
      {
        fertilizerName: "Pure මාළු (Fish) NPK 5.1.1",
        mode: "per_plant",
        gramsPerPlant: 30,
        tip: "2 tbsp (30 ml) / 2 L water; pour all 2 L across bag every 2 weeks",
      },
      {
        fertilizerName: "HS Liquid Fertilizer",
        mode: "per_tank",
        gramsPerTank: 2.5,
        tip: "Foliar: ½ tsp (2.5 ml) / 1 L; early morning once weekly (2×/week if light green)",
      },
    ],
  },
  {
    week: 4,
    title: "Phase 4 — Months 5–7 Rhizome Swelling",
    summary:
      "Underground weight/thickness. Grow More Bloom Special every 10–12 days. Stop Pure මාළු fish fertilizer (avoid excess N).",
    lines: [
      {
        fertilizerName: "Grow More Bloom Special (6-30-30)",
        mode: "per_plant",
        gramsPerPlant: 15,
        tip: "1 tbsp (~15g) / 2 L water; drench every 10–12 days. Stop fish NPK this phase.",
      },
    ],
  },
  {
    week: 5,
    title: "Phase 5 — Month 8 Flushing & Curing",
    summary:
      "Stop all fertilizers. Weeks 1–2: clean water only (~1 L when bag feels light) to flush salts. Final 2 weeks: stop watering; leaves dry/brown → curcumin + skin curing.",
    lines: [],
  },
];

export function defaultTurmericFertilizerRateConfig(): FertilizerRateConfig {
  return {
    mixtureRates: structuredClone(PEPPER_MIXTURE.rates),
    tankLiters: 1,
    intervals: { "1": 365, "2": 21, "3": 14, "4": 11, "5": 60 },
    weeks: structuredClone(TURMERIC_PHASES),
    ongoingWeeks: [],
  };
}

/**
 * Chemical Fertilizer Schedule (per 1,000 plants) — weeks 1–3 = Stage 1–3.
 * Mix: 12 kg Urea + 10 kg Superphosphate (TSP) + 12 kg MOP = 34 kg / 1000 plants.
 * Apply 1/3 of the mix at planting, 60 days, and 120 days.
 * Rates as g/plant so Apply week scales with plant_count (4 / 3.333 / 4 g).
 * Superphosphate matches existing inventory (TSP); MOP is its own product name.
 */
export const TURMERIC_CHEMICAL_STAGES: RescueWeek[] = [
  {
    week: 1,
    title: "Stage 1 — At Planting",
    summary:
      "Chemical mix (1/3 of 34 kg / 1000 plants): bury into soil beds with seed rhizomes. " +
      "Per 1000 plants: Urea 4 kg + Superphosphate (TSP) ≈3.333 kg + MOP 4 kg.",
    lines: [
      {
        fertilizerName: "Urea",
        mode: "per_plant",
        gramsPerPlant: 4,
        tip: "4 kg / 1000 plants (1/3 of 12 kg mix) → 4 g/plant",
      },
      {
        fertilizerName: "Superphosphate",
        mode: "per_plant",
        gramsPerPlant: 10 / 3,
        tip: "TSP 10 kg / 1000 in full mix; 1/3 ≈ 3.333 kg → ≈3.333 g/plant (maps to Superphosphate stock)",
      },
      {
        fertilizerName: "Muriate of Potash (MOP)",
        mode: "per_plant",
        gramsPerPlant: 4,
        tip: "4 kg / 1000 plants (1/3 of 12 kg mix) → 4 g/plant",
      },
    ],
  },
  {
    week: 2,
    title: "Stage 2 — At 60 Days (2 Months)",
    summary:
      "Earthing up + second 1/3 of the Urea / TSP / MOP mix. Same rates as Stage 1.",
    lines: [
      {
        fertilizerName: "Urea",
        mode: "per_plant",
        gramsPerPlant: 4,
        tip: "4 g/plant · earthing up with second 1/3",
      },
      {
        fertilizerName: "Superphosphate",
        mode: "per_plant",
        gramsPerPlant: 10 / 3,
        tip: "≈3.333 g/plant (TSP portion)",
      },
      {
        fertilizerName: "Muriate of Potash (MOP)",
        mode: "per_plant",
        gramsPerPlant: 4,
        tip: "4 g/plant",
      },
    ],
  },
  {
    week: 3,
    title: "Stage 3 — At 120 Days (4 Months)",
    summary:
      "Final 1/3 of the chemical mix before leaf growth stops. Same rates as Stage 1.",
    lines: [
      {
        fertilizerName: "Urea",
        mode: "per_plant",
        gramsPerPlant: 4,
        tip: "4 g/plant · final 1/3 before leaf growth stops",
      },
      {
        fertilizerName: "Superphosphate",
        mode: "per_plant",
        gramsPerPlant: 10 / 3,
        tip: "≈3.333 g/plant (TSP portion)",
      },
      {
        fertilizerName: "Muriate of Potash (MOP)",
        mode: "per_plant",
        gramsPerPlant: 4,
        tip: "4 g/plant",
      },
    ],
  },
];

export function defaultTurmericChemicalFertilizerRateConfig(): FertilizerRateConfig {
  return {
    mixtureRates: structuredClone(PEPPER_MIXTURE.rates),
    tankLiters: 1,
    intervals: { "1": 365, "2": 60, "3": 60 },
    weeks: structuredClone(TURMERIC_CHEMICAL_STAGES),
    ongoingWeeks: [],
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

/** Case-insensitive: turmeric, කහ, or name contains "turmeric". */
export function isTurmericCropName(cropName: string): boolean {
  const n = String(cropName || "").trim().toLowerCase();
  if (!n) return false;
  if (n.includes("turmeric")) return true;
  if (n.includes("කහ")) return true;
  return n === "kaha";
}

/** Default auto-seed for turmeric crops: Extra-Premium Localized Phase 1–5. */
export function defaultFertilizerRateConfigForCrop(
  cropName: string
): FertilizerRateConfig {
  return isTurmericCropName(cropName)
    ? defaultTurmericFertilizerRateConfig()
    : defaultFertilizerRateConfig();
}

/** Short Apply-week tab label from week title. */
export function weekScheduleButtonLabel(w: RescueWeek): string {
  const stage = w.title.match(/^(Stage\s+\d+)/i);
  if (stage) return stage[1];
  const phase = w.title.match(/^(Phase\s+\d+)/i);
  if (phase) return phase[1];
  const week = w.title.match(/^(Week\s+\d+)/i);
  if (week) return week[1];
  if (w.week === 0) return "Mixtures";
  return `Week ${w.week}`;
}

/** Pepper monsoon Mixtures week (week 0 with mixtures product) — not turmeric Phase. */
export function isPepperMixturesWeek(
  w:
    | {
        title?: string;
        lines?: { fertilizerName: string }[];
      }
    | null
    | undefined
): boolean {
  if (!w) return false;
  if (
    (w.lines || []).some((l) => l.fertilizerName === "Pepper Fertilizer Mixtures")
  ) {
    return true;
  }
  return /pepper fertilizer mixtures/i.test(w.title || "");
}

export function gramsFromConfig(
  config: FertilizerRateConfig,
  age: PlantAge,
  monsoon: Monsoon
): number {
  return Number(config.mixtureRates?.[age]?.[monsoon]) || 0;
}
