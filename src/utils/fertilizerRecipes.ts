/**
 * Frontend recipes — keep aligned with
 * netlify/functions/utils/fertilizerRecipes.ts
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

export const RESCUE_WEEKS: RescueWeek[] = [
  {
    week: 0,
    title: "Base — Pepper fertilizer",
    summary:
      "Usual pepper special-mix bag feed (BASE). Small vine ~50–75 g, mature ~100–150 g. Every 6–8 weeks. 25 kg on hand.",
    lines: [
      {
        fertilizerName: "Pepper fertilizer",
        mode: "per_plant",
        gramsPerPlant: 60,
        tip: "Default 60 g / small vine (50–75). Use 100–150 g for mature vines.",
      },
    ],
  },
  {
    week: 1,
    title: "Week 1 — Soil rescue mix (now)",
    summary:
      "Per small vine: Dolomite 10–15g, Superphosphate 10g, Urea 5g, SOP 5g, Compost 200g. 50 vines ≈ 0.5–0.75 / 0.5 / 0.25 / 0.25 / 10 kg.",
    lines: [
      {
        fertilizerName: "Pepper fertilizer",
        mode: "per_plant",
        gramsPerPlant: 60,
        optional: true,
        tip: "Optional if Base was already applied this round",
      },
      {
        fertilizerName: "Dolomite",
        mode: "per_plant",
        gramsPerPlant: 12.5,
        tip: "10–15 g / small vine",
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
        tip: "Prefer root drench",
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
    summary: "MgSO₄ 150 g / 10 L. Spray early morning or late evening.",
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
    summary: "Per 10 L: ZnSO₄ 5 g, FeSO₄ 5 g, Borax 1 g + sticker 2–5 mL.",
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
