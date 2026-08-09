/**
 * Starter inventory (what you bought) + rescue-plan + pepper base recipes.
 * Soil amounts are per small vine in grams; foliar is per 10 L tank.
 */

export type StarterItem = {
  name: string;
  unit: string;
  stock_qty: number;
  unit_price: number;
  notes: string;
};

/** Exact purchase from your note + 25 kg pepper fertilizer remaining. */
export const STARTER_PURCHASE_PACK: StarterItem[] = [
  {
    name: "Pepper fertilizer",
    unit: "kg",
    stock_qty: 25,
    unit_price: 0,
    notes:
      "BASE feed — usual pepper special mix. Apply every 6–8 weeks. Stock: 25 kg remaining.",
  },
  {
    name: "Dolomite",
    unit: "kg",
    stock_qty: 3,
    unit_price: 0,
    notes: "Bought — 3 kg (soil calcium / pH)",
  },
  {
    name: "Superphosphate",
    unit: "kg",
    stock_qty: 3,
    unit_price: 0,
    notes: "Bought — 3 kg",
  },
  {
    name: "Urea",
    unit: "kg",
    stock_qty: 2,
    unit_price: 0,
    notes: "Bought — 2 kg (prefer root drench)",
  },
  {
    name: "Sulfate of Potash (SOP)",
    unit: "kg",
    stock_qty: 2,
    unit_price: 0,
    notes: "Bought — 2 kg (use SOP, avoid MOP)",
  },
  {
    name: "NPK 19:19:19",
    unit: "kg",
    stock_qty: 2,
    unit_price: 0,
    notes: "Bought — 2 kg",
  },
  {
    name: "Compost",
    unit: "kg",
    stock_qty: 20,
    unit_price: 0,
    notes: "Bought — 20 kg",
  },
  {
    name: "Albert solution",
    unit: "kg",
    stock_qty: 2,
    unit_price: 0,
    notes: "Bought — 2 kg",
  },
  {
    name: "MgSO4 (Epsom salt)",
    unit: "kg",
    stock_qty: 0,
    unit_price: 0,
    notes: "Foliar: 150 g / 10 L — restock when bought",
  },
  {
    name: "ZnSO4",
    unit: "kg",
    stock_qty: 0,
    unit_price: 0,
    notes: "Micronutrient foliar: 5 g / 10 L",
  },
  {
    name: "FeSO4",
    unit: "kg",
    stock_qty: 0,
    unit_price: 0,
    notes: "Micronutrient foliar: 5 g / 10 L",
  },
  {
    name: "Borax",
    unit: "kg",
    stock_qty: 0,
    unit_price: 0,
    notes: "Micronutrient foliar: 1 g / 10 L",
  },
];

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

/**
 * week 0 = ongoing pepper BASE fertilizer
 * weeks 1–4 = advisor rescue plan (amendments / foliar / disease)
 */
export const RESCUE_WEEKS: RescueWeek[] = [
  {
    week: 0,
    title: "Base — Pepper fertilizer",
    summary:
      "Usual pepper special-mix bag feed (your BASE). " +
      "Small vine ~50–75 g, mature ~100–150 g. Repeat every 6–8 weeks. " +
      "You have 25 kg on hand — log each round here so stock stays correct.",
    lines: [
      {
        fertilizerName: "Pepper fertilizer",
        mode: "per_plant",
        gramsPerPlant: 60,
        tip: "Default 60 g / small vine (range 50–75). Raise toward 100–150 g for mature vines.",
      },
    ],
  },
  {
    week: 1,
    title: "Week 1 — Soil rescue mix (now)",
    summary:
      "Per small vine with purchased pack: Dolomite 10–15g, Superphosphate 10g, Urea 5g, SOP 5g, Compost 200g. " +
      "50 vines ≈ 0.5–0.75 / 0.5 / 0.25 / 0.25 / 10 kg. Water in well. " +
      "Can combine with Base pepper fertilizer the same week if needed.",
    lines: [
      {
        fertilizerName: "Pepper fertilizer",
        mode: "per_plant",
        gramsPerPlant: 60,
        optional: true,
        tip: "Optional if you also run Base week — avoid double-dosing the same day unless planned",
      },
      {
        fertilizerName: "Dolomite",
        mode: "per_plant",
        gramsPerPlant: 12.5,
        tip: "Advisor range 10–15 g / small vine",
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
        tip: "Prefer as root drench",
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
      },
    ],
  },
  {
    week: 2,
    title: "Week 2 — Foliar MgSO₄",
    summary:
      "MgSO₄ (Epsom) 150 g / 10 L (1.5%). Spray early morning or late evening.",
    lines: [
      {
        fertilizerName: "MgSO4 (Epsom salt)",
        mode: "per_tank",
        gramsPerTank: 150,
        tip: "Per 10 L tank",
      },
    ],
  },
  {
    week: 3,
    title: "Week 3 — Foliar micronutrients",
    summary:
      "Per 10 L: ZnSO₄ 5 g, FeSO₄ 5 g, Borax 1 g + sticker 2–5 mL.",
    lines: [
      { fertilizerName: "ZnSO4", mode: "per_tank", gramsPerTank: 5 },
      { fertilizerName: "FeSO4", mode: "per_tank", gramsPerTank: 5 },
      {
        fertilizerName: "Borax",
        mode: "per_tank",
        gramsPerTank: 1,
        tip: "Start low — excess can burn leaves",
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

export function toStockAmount(
  amount: number,
  usageUnit: string,
  stockUnit: string
): number {
  const u = usageUnit.trim().toLowerCase();
  const s = stockUnit.trim().toLowerCase();
  if (u === s) return amount;
  if (u === "g" && s === "kg") return amount / 1000;
  if (u === "kg" && s === "g") return amount * 1000;
  if ((u === "ml" || u === "mL".toLowerCase()) && (s === "l" || s === "liter" || s === "litre")) {
    return amount / 1000;
  }
  if ((u === "l" || u === "liter" || u === "litre") && (s === "ml")) {
    return amount * 1000;
  }
  return amount;
}
