/**
 * Starter inventory (what you bought) + rescue-plan recipes (advisor doses).
 * Amounts for soil mix are per small vine in grams; foliar is per 10 L tank.
 */

export type StarterItem = {
  name: string;
  unit: string;
  stock_qty: number;
  unit_price: number;
  notes: string;
};

/** Exact purchase pack from your list + remaining pepper fertilizer. */
export const STARTER_PURCHASE_PACK: StarterItem[] = [
  {
    name: "Dolomite",
    unit: "kg",
    stock_qty: 3,
    unit_price: 0,
    notes: "Bought pack — soil calcium/pH",
  },
  {
    name: "Superphosphate",
    unit: "kg",
    stock_qty: 3,
    unit_price: 0,
    notes: "Bought pack — phosphorus",
  },
  {
    name: "Urea",
    unit: "kg",
    stock_qty: 2,
    unit_price: 0,
    notes: "Bought pack — nitrogen (prefer root drench, avoid heavy dry dose)",
  },
  {
    name: "Sulfate of Potash (SOP)",
    unit: "kg",
    stock_qty: 2,
    unit_price: 0,
    notes: "Bought pack — use SOP, avoid MOP",
  },
  {
    name: "NPK 19:19:19",
    unit: "kg",
    stock_qty: 2,
    unit_price: 0,
    notes: "Bought pack — base ERP/NPK every 6–8 weeks",
  },
  {
    name: "Compost",
    unit: "kg",
    stock_qty: 20,
    unit_price: 0,
    notes: "Bought pack",
  },
  {
    name: "Albert solution",
    unit: "kg",
    stock_qty: 2,
    unit_price: 0,
    notes: "Bought pack — Albert / soluble feed",
  },
  {
    name: "Pepper fertilizer",
    unit: "kg",
    stock_qty: 25,
    unit_price: 0,
    notes: "Remaining bag on hand",
  },
  // Foliar materials — start at 0 so you can restock when purchased
  {
    name: "MgSO4 (Epsom salt)",
    unit: "kg",
    stock_qty: 0,
    unit_price: 0,
    notes: "Foliar: 150 g / 10 L. Restock when bought.",
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
  /** Must match fertilizers.name */
  fertilizerName: string;
  /**
   * `per_plant` → total = gramsPerPlant * vineCount (stored/displayed in g)
   * `per_tank` → grams for one 10 L spray tank (user can scale tanks)
   * `fixed` → fixed grams regardless of vines
   */
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

/** 4-week rescue plan from advisor (small vine rates). */
export const RESCUE_WEEKS: RescueWeek[] = [
  {
    week: 1,
    title: "Week 1 — Soil base (now)",
    summary:
      "Per small vine: Dolomite 10–15g, Superphosphate 10g, Urea 5g, SOP 5g, Compost 200g. " +
      "For 50 vines ≈ 0.5–0.75 / 0.5 / 0.25 / 0.25 / 10 kg. Water in well. " +
      "Optional: light NPK / Albert / pepper fertilizer if you use them in the base mix.",
    lines: [
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
        tip: "Prefer as root drench; do not overdose dry",
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
        tip: "Optional in week-1 mix — uncheck if not using",
      },
      {
        fertilizerName: "Albert solution",
        mode: "per_plant",
        gramsPerPlant: 5,
        optional: true,
        tip: "Optional",
      },
    ],
  },
  {
    week: 2,
    title: "Week 2 — Foliar MgSO₄",
    summary:
      "MgSO₄ (Epsom) 150 g / 10 L (1.5%). Spray early morning or late evening. Targets yellow leaves.",
    lines: [
      {
        fertilizerName: "MgSO4 (Epsom salt)",
        mode: "per_tank",
        gramsPerTank: 150,
        tip: "One 10 L tank. Increase tanks if you spray more volume.",
      },
    ],
  },
  {
    week: 3,
    title: "Week 3 — Foliar micronutrients",
    summary:
      "Per 10 L: ZnSO₄ 5 g, FeSO₄ 5 g, Borax 1 g + sticker 2–5 mL. Dissolve separately, then mix. AM/PM spray.",
    lines: [
      {
        fertilizerName: "ZnSO4",
        mode: "per_tank",
        gramsPerTank: 5,
      },
      {
        fertilizerName: "FeSO4",
        mode: "per_tank",
        gramsPerTank: 5,
      },
      {
        fertilizerName: "Borax",
        mode: "per_tank",
        gramsPerTank: 1,
        tip: "Start low — excess micros can burn leaves",
      },
    ],
  },
  {
    week: 4,
    title: "Week 4 — Disease control",
    summary:
      "Neem oil or copper fungicide per label if disease signs. Remove blackened leaves/fruit. Check soil moisture — avoid waterlogging. " +
      "Log any product you used under inventory (add product first if missing).",
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

/** Convert usage amount into the fertilizer's stock unit for deduction. */
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
  if ((u === "l" || u === "liter" || u === "litre") && u !== s && (s === "ml")) {
    return amount * 1000;
  }
  // Fallback: treat as same scale (user responsibility)
  return amount;
}
