/**
 * Keep aligned with netlify/functions/utils/fertilizerRecipes.ts
 * (shared types, PEPPER_MIXTURE rates, RESCUE_WEEKS — not STARTER_PURCHASE_PACK).
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

export function hasFertilizerRates(config: FertilizerRateConfig): boolean {
  return Array.isArray(config.weeks) && config.weeks.length > 0;
}

export function gramsFromConfig(
  config: FertilizerRateConfig,
  age: PlantAge,
  monsoon: Monsoon
): number {
  return Number(config.mixtureRates?.[age]?.[monsoon]) || 0;
}
