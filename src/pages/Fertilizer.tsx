import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../utils/api";
import SoundToggle from "../components/SoundToggle";
import ConfirmModal from "../components/ConfirmModal";
import { play, unlockAudio } from "../utils/sounds";
import {
  PEPPER_MIXTURE,
  RESCUE_WEEKS,
  lineGrams,
  gramsFromConfig,
  defaultFertilizerRateConfig,
  defaultFertilizerRateConfigForCrop,
  defaultTurmericFertilizerRateConfig,
  defaultTurmericChemicalFertilizerRateConfig,
  isTurmericCropName,
  isTurmericChemicalRateConfig,
  isPepperMixturesWeek,
  weekScheduleButtonLabel,
  type RescueWeek,
  type RecipeLine,
  type PlantAge,
  type Monsoon,
  type FertilizerRateConfig,
} from "../utils/fertilizerRecipes";
import {
  computeCycleProgress,
  computeSeasonWeekStatus,
  type CycleProgress,
} from "../utils/fertilizerCycleProgress";
import { useAuth } from "../utils/AuthContext";
import Money from "../components/Money";
import {
  invalidateCache,
  swrLoad,
} from "../utils/clientCache";

type Fertilizer = {
  id: number;
  name: string;
  unit: string;
  stock_qty: number;
  unit_price: number;
  notes: string | null;
  created_at: string;
};

type PurchasePackDraft = {
  name: string;
  unit: string;
  stock_qty: string;
  unit_price: string;
  notes: string;
};

type ScheduleStep = {
  id?: number;
  step_order: number;
  week_number: number | null;
  title: string;
  instructions: string | null;
  suggested_fertilizer_id: number | null;
  suggested_amount: number | null;
  unit: string | null;
  interval_days: number | null;
};

type Schedule = {
  id: number;
  crop_name: string | null;
  name: string;
  description: string | null;
  is_working?: boolean;
  created_at: string;
  steps: ScheduleStep[];
};

type Application = {
  id: number;
  crop_name: string;
  fertilizer_id: number;
  fertilizer_name: string | null;
  amount: number;
  unit: string;
  applied_at: string;
  notes: string | null;
  schedule_step_id: number | null;
  created_by: string | null;
};

type PriceRow = {
  id: number;
  fertilizer_id: number;
  price: number;
  recorded_at: string;
};

type Tab = "apply" | "inventory" | "schedules" | "usage" | "rates";

type CropMeta = { name: string; plant_count: number; status?: string };

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const s = String(value).replace("T", " ").slice(0, 16);
  return s;
}

/** Format grams with optional kg note, e.g. "12,500 g (12.5 kg)". */
function fmtGramsTotal(grams: number) {
  const g = Number(grams) || 0;
  const gLabel = g.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (g >= 1000) {
    const kg = g / 1000;
    return `${gLabel} g (${kg.toLocaleString(undefined, {
      maximumFractionDigits: 3,
    })} kg)`;
  }
  return `${gLabel} g`;
}

/** e.g. "250 g/plant × 50 plants = 12,500 g (12.5 kg)" */
function fmtScaledDose(
  perUnit: number,
  unitSuffix: string,
  count: number,
  countLabel: string
) {
  const total = perUnit * count;
  return `${perUnit.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} ${unitSuffix} × ${count.toLocaleString()} ${countLabel} = ${fmtGramsTotal(total)}`;
}

/** Cost in ledger currency from grams used and unit_price (per kg/L). */
function lineCostFromGrams(
  grams: number,
  unitPrice: number,
  stockUnit: string
): number {
  if (!(grams > 0) || !(unitPrice > 0)) return 0;
  const u = stockUnit.trim().toLowerCase();
  const stockQty =
    u === "kg" || u === "l" || u === "liter" || u === "litre"
      ? grams / 1000
      : grams;
  return Number((stockQty * unitPrice).toFixed(2));
}

type WeekNeedLine = {
  fertilizerName: string;
  optional?: boolean;
  mode: RecipeLine["mode"];
  perUnit: number;
  unitSuffix: string;
  count: number;
  countLabel: string;
  totalGrams: number;
};

type WeekNeedBlock = {
  week: number;
  title: string;
  lines: WeekNeedLine[];
  note?: string;
};

/** Full schedule needs for a crop plant count (and tanks for foliar weeks). */
function buildScheduleNeeds(opts: {
  weeks: RescueWeek[];
  mixturePerPlant: number;
  vines: number;
  tanks: number;
  plantAge: PlantAge;
  monsoon: Monsoon;
  halveWithGliricidia: boolean;
  tankLiters: number;
}): WeekNeedBlock[] {
  const {
    weeks,
    mixturePerPlant,
    vines,
    tanks,
    plantAge,
    monsoon,
    halveWithGliricidia,
    tankLiters,
  } = opts;

  return weeks.map((w) => {
    if (isPepperMixturesWeek(w)) {
      const per = mixturePerPlant;
      return {
        week: w.week,
        title: w.title,
        note: `${PEPPER_MIXTURE.ageLabels[plantAge]} · ${PEPPER_MIXTURE.monsoonLabels[monsoon]}${
          halveWithGliricidia ? " · halved (Gliricidia)" : ""
        }`,
        lines: [
          {
            fertilizerName: PEPPER_MIXTURE.productName,
            mode: "per_plant",
            perUnit: per,
            unitSuffix: "g/plant",
            count: vines,
            countLabel: vines === 1 ? "plant" : "plants",
            totalGrams: per * vines,
          },
        ],
      };
    }

    if (w.lines.length === 0) {
      return {
        week: w.week,
        title: w.title,
        note: /flush|curing|phase 5/i.test(w.title + w.summary)
          ? "Checklist only — water flush / curing; no fertilizer products"
          : "No bag fertilizer — disease spray / cultural care per label",
        lines: [],
      };
    }

    const lines: WeekNeedLine[] = w.lines.map((line) => {
      if (line.mode === "per_plant") {
        const per = line.gramsPerPlant || 0;
        return {
          fertilizerName: line.fertilizerName,
          optional: line.optional,
          mode: line.mode,
          perUnit: per,
          unitSuffix: "g/plant",
          count: vines,
          countLabel: vines === 1 ? "plant" : "plants",
          totalGrams: per * vines,
        };
      }
      if (line.mode === "per_tank") {
        const per = line.gramsPerTank || 0;
        return {
          fertilizerName: line.fertilizerName,
          optional: line.optional,
          mode: line.mode,
          perUnit: per,
          unitSuffix: `g/${tankLiters}L tank`,
          count: tanks,
          countLabel: tanks === 1 ? "tank" : "tanks",
          totalGrams: per * tanks,
        };
      }
      const fixed = line.gramsFixed || 0;
      return {
        fertilizerName: line.fertilizerName,
        optional: line.optional,
        mode: line.mode,
        perUnit: fixed,
        unitSuffix: "g",
        count: 1,
        countLabel: "batch",
        totalGrams: fixed,
      };
    });

    return { week: w.week, title: w.title, lines };
  });
}

async function readError(res: Response) {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    return j?.error || text || res.statusText;
  } catch {
    return text || res.statusText;
  }
}

export default function FertilizerPage() {
  const { isAdmin, isObserve } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const cropParam = searchParams.get("crop") || "";

  const [tab, setTab] = useState<Tab>(cropParam ? "apply" : "apply");
  const [crops, setCrops] = useState<string[]>([]);
  const [cropMeta, setCropMeta] = useState<CropMeta[]>([]);
  const [fertilizers, setFertilizers] = useState<Fertilizer[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [cropFertNotes, setCropFertNotes] = useState<Record<string, string>>(
    {}
  );
  const [noteEditor, setNoteEditor] = useState<{
    fertilizerName: string;
    draft: string;
  } | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [selectedCrop, setSelectedCrop] = useState(cropParam);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Inventory form
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [stockQty, setStockQty] = useState("0");
  const [unitPrice, setUnitPrice] = useState("0");
  const [notes, setNotes] = useState("");
  const [restockId, setRestockId] = useState<number | null>(null);
  const [restockAmount, setRestockAmount] = useState("");
  const [priceHistory, setPriceHistory] = useState<PriceRow[]>([]);
  const [historyFor, setHistoryFor] = useState<number | null>(null);

  // Usage form
  const [useCrop, setUseCrop] = useState(cropParam);
  const [useFertId, setUseFertId] = useState("");
  const [useAmount, setUseAmount] = useState("");
  const [useUnit, setUseUnit] = useState("");
  const [useDate, setUseDate] = useState(todayISO());
  const [useNotes, setUseNotes] = useState("");
  const [useStepId, setUseStepId] = useState("");
  const [saving, setSaving] = useState(false);

  // Schedule edit
  const [activeScheduleId, setActiveScheduleId] = useState<number | null>(null);
  const [schedName, setSchedName] = useState("");
  const [schedDesc, setSchedDesc] = useState("");
  const [schedSteps, setSchedSteps] = useState<ScheduleStep[]>([]);

  const [confirmDeleteFert, setConfirmDeleteFert] = useState<number | null>(
    null
  );
  const [confirmDeleteApp, setConfirmDeleteApp] = useState<number | null>(null);
  const [confirmDeleteSched, setConfirmDeleteSched] = useState<number | null>(
    null
  );
  const [selectedSchedIds, setSelectedSchedIds] = useState<number[]>([]);
  const [confirmBulkDeleteSched, setConfirmBulkDeleteSched] = useState(false);
  const [saveAndApply, setSaveAndApply] = useState(true);
  /** Pending turmeric template overwrite: premium | chemical */
  const [confirmTurmericTemplate, setConfirmTurmericTemplate] = useState<
    "premium" | "chemical" | null
  >(null);

  // Apply-week wizard
  const [applyCrop, setApplyCrop] = useState(cropParam);
  const [applyWeek, setApplyWeek] = useState(0);
  /** Total vines on the crop (schedule “full need”). */
  const [vineCount, setVineCount] = useState("50");
  /** Vines treated in this log (partial apply over several days). */
  const [treatedCount, setTreatedCount] = useState("50");
  const [tankCount, setTankCount] = useState("1");
  const [plantAge, setPlantAge] = useState<PlantAge>("year1");
  const [monsoon, setMonsoon] = useState<Monsoon>("first");
  const [halveWithGliricidia, setHalveWithGliricidia] = useState(false);
  /** Force-clear past-due even if treated < total. */
  const [markWeekComplete, setMarkWeekComplete] = useState(false);
  /** Ad-hoc Pepper Fertilizer Mixtures beyond the usual monsoon cycle. */
  const [extraRound, setExtraRound] = useState(false);
  const [applyDate, setApplyDate] = useState(todayISO());
  const [lineEnabled, setLineEnabled] = useState<Record<string, boolean>>({});
  const [lineAmounts, setLineAmounts] = useState<Record<string, string>>({});
  const [rateConfig, setRateConfig] = useState<FertilizerRateConfig>(
    defaultFertilizerRateConfig
  );
  const [ratesDraft, setRatesDraft] = useState<FertilizerRateConfig | null>(
    null
  );
  const [ratesSaving, setRatesSaving] = useState(false);

  /** Editable purchase pack used by “Add purchases to stock”. */
  const [purchasePack, setPurchasePack] = useState<PurchasePackDraft[]>([]);
  const [purchasePackSaving, setPurchasePackSaving] = useState(false);

  const cropSchedules = useMemo(
    () =>
      schedules
        .filter(
          (s) =>
            selectedCrop &&
            s.crop_name &&
            s.crop_name.toLowerCase() === selectedCrop.toLowerCase()
        )
        .slice()
        .sort((a, b) => {
          const aw = a.is_working ? 1 : 0;
          const bw = b.is_working ? 1 : 0;
          if (bw !== aw) return bw - aw;
          return a.name.localeCompare(b.name);
        }),
    [schedules, selectedCrop]
  );

  const workingSchedule = useMemo(
    () => cropSchedules.find((s) => s.is_working) || null,
    [cropSchedules]
  );

  const activeSchedule = useMemo(
    () => schedules.find((s) => s.id === activeScheduleId) || null,
    [schedules, activeScheduleId]
  );

  const stepOptions = useMemo(() => {
    const list: { id: number; label: string }[] = [];
    for (const s of cropSchedules) {
      for (const step of s.steps) {
        if (step.id) {
          list.push({
            id: step.id,
            label: `${s.name}: W${step.week_number ?? step.step_order} — ${step.title}`,
          });
        }
      }
    }
    return list;
  }, [cropSchedules]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cropParam) {
      setSelectedCrop(cropParam);
      setUseCrop(cropParam);
      setApplyCrop(cropParam);
      setTab("apply");
    }
  }, [cropParam]);

  useEffect(() => {
    if (!selectedCrop) {
      setSchedules([]);
      setActiveScheduleId(null);
      clearScheduleForm();
      return;
    }
    void loadSchedules(selectedCrop);
    void loadApplications(selectedCrop);
  }, [selectedCrop]);

  useEffect(() => {
    if (!applyCrop) {
      // Do not keep another crop’s rates visible when nothing is selected.
      setRateConfig(defaultFertilizerRateConfig());
      return;
    }
    void loadRateConfig(applyCrop).then((cfg) => {
      if (cfg) setRateConfig(cfg);
    });
  }, [applyCrop]);

  useEffect(() => {
    if (tab !== "rates") return;
    if (!selectedCrop) {
      setRatesDraft(null);
      return;
    }
    void loadRateConfig(selectedCrop).then((cfg) => {
      if (!cfg) return;
      setRatesDraft(structuredClone(cfg));
      if (
        applyCrop &&
        selectedCrop.toLowerCase() === applyCrop.toLowerCase()
      ) {
        setRateConfig(cfg);
      }
    });
  }, [tab, selectedCrop]);

  const rateWeeks =
    rateConfig.weeks?.length > 0 ? rateConfig.weeks : RESCUE_WEEKS;

  const activeRescueWeek: RescueWeek =
    rateWeeks.find((w) => w.week === applyWeek) || rateWeeks[0];

  const pepperMixturesActive = isPepperMixturesWeek(activeRescueWeek);
  const activeHasPerTank = activeRescueWeek.lines.some(
    (l) => l.mode === "per_tank"
  );
  const applyCropIsTurmeric = isTurmericCropName(applyCrop);
  const ratesCropIsTurmeric = isTurmericCropName(selectedCrop);

  const applyCropMeta = useMemo(
    () =>
      cropMeta.find(
        (c) => c.name.toLowerCase() === applyCrop.toLowerCase()
      ) || null,
    [cropMeta, applyCrop]
  );
  const vinesN = Math.max(0, Math.floor(Number(vineCount) || 0));
  const treatedN = Math.max(0, Math.floor(Number(treatedCount) || 0));
  const tanksN = Math.max(0, Number(tankCount) || 0);
  const isPartialApply = vinesN > 0 && treatedN > 0 && treatedN < vinesN;
  const mixturePerPlant = useMemo(() => {
    let g = gramsFromConfig(rateConfig, plantAge, monsoon);
    if (halveWithGliricidia) g = g / 2;
    return g;
  }, [rateConfig, plantAge, monsoon, halveWithGliricidia]);

  const scheduleNeeds = useMemo(() => {
    if (!applyCrop) return [];
    return buildScheduleNeeds({
      weeks: rateWeeks,
      mixturePerPlant,
      vines: vinesN,
      tanks: tanksN,
      plantAge,
      monsoon,
      halveWithGliricidia,
      tankLiters: rateConfig.tankLiters || 10,
    });
  }, [
    applyCrop,
    rateWeeks,
    mixturePerPlant,
    vinesN,
    tanksN,
    plantAge,
    monsoon,
    halveWithGliricidia,
    rateConfig.tankLiters,
  ]);

  const scheduleNeedsWithCost = useMemo(() => {
    return scheduleNeeds.map((block) => ({
      ...block,
      lines: block.lines.map((line) => {
        const fert = fertilizers.find((f) => f.name === line.fertilizerName);
        const cost = fert
          ? lineCostFromGrams(line.totalGrams, fert.unit_price, fert.unit)
          : 0;
        return { ...line, estCost: cost, hasPrice: Boolean(fert && fert.unit_price > 0) };
      }),
      weekCost: block.lines.reduce((s, line) => {
        const fert = fertilizers.find((f) => f.name === line.fertilizerName);
        if (!fert || !(fert.unit_price > 0)) return s;
        return s + lineCostFromGrams(line.totalGrams, fert.unit_price, fert.unit);
      }, 0),
    }));
  }, [scheduleNeeds, fertilizers]);

  /** Live: volumes + expense estimate for enabled lines (updates as vines/amounts/prices change). */
  const applyLivePreview = useMemo(() => {
    let totalGrams = 0;
    let totalCost = 0;
    let priced = 0;
    let unpriced = 0;
    const rows: {
      name: string;
      grams: number;
      cost: number;
      hasPrice: boolean;
      equation: string;
    }[] = [];

    for (const line of activeRescueWeek.lines) {
      if (!lineEnabled[line.fertilizerName]) continue;
      const grams = Number(lineAmounts[line.fertilizerName] || 0);
      if (!(grams > 0)) continue;
      const fert = fertilizers.find((f) => f.name === line.fertilizerName);
      const price = fert ? Number(fert.unit_price) || 0 : 0;
      const cost = fert
        ? lineCostFromGrams(grams, price, fert.unit)
        : 0;
      const equation =
        pepperMixturesActive
          ? fmtScaledDose(
              mixturePerPlant,
              "g/plant",
              treatedN,
              treatedN === 1 ? "plant treated" : "plants treated"
            )
          : line.mode === "per_plant"
            ? fmtScaledDose(
                line.gramsPerPlant || 0,
                "g/plant",
                treatedN,
                treatedN === 1 ? "plant treated" : "plants treated"
              )
            : line.mode === "per_tank"
              ? fmtScaledDose(
                  line.gramsPerTank || 0,
                  `g/${rateConfig.tankLiters || 10}L`,
                  tanksN,
                  tanksN === 1 ? "tank" : "tanks"
                )
              : fmtGramsTotal(line.gramsFixed || 0);

      totalGrams += grams;
      if (cost > 0) {
        totalCost += cost;
        priced += 1;
      } else {
        unpriced += 1;
      }
      rows.push({
        name: line.fertilizerName,
        grams,
        cost,
        hasPrice: price > 0,
        equation,
      });
    }

    return {
      rows,
      totalGrams,
      totalCost: Number(totalCost.toFixed(2)),
      priced,
      unpriced,
    };
  }, [
    activeRescueWeek,
    lineEnabled,
    lineAmounts,
    fertilizers,
    pepperMixturesActive,
    mixturePerPlant,
    treatedN,
    tanksN,
    rateConfig.tankLiters,
  ]);

  /**
   * Per-fertilizer plant coverage for the selected Apply week.
   * Each product gets its own bar — you usually apply them on different days.
   */
  const lineProgressByName = useMemo(() => {
    const map: Record<string, CycleProgress> = {};
    if (!applyCrop) return map;
    const intervalDays = Number(rateConfig.intervals?.[String(applyWeek)]) || 0;
    const lines = activeRescueWeek?.lines || [];
    for (const line of lines) {
      map[line.fertilizerName] = computeCycleProgress({
        applications,
        cropName: applyCrop,
        week: applyWeek,
        vinesTotal: vinesN,
        intervalDays,
        pepperMixturesWeek: pepperMixturesActive,
        fertilizerName: line.fertilizerName,
      });
    }
    // Pepper mixtures product even if line list is empty somehow
    if (pepperMixturesActive && !map[PEPPER_MIXTURE.productName]) {
      map[PEPPER_MIXTURE.productName] = computeCycleProgress({
        applications,
        cropName: applyCrop,
        week: applyWeek,
        vinesTotal: vinesN,
        intervalDays,
        pepperMixturesWeek: true,
        fertilizerName: PEPPER_MIXTURE.productName,
      });
    }
    return map;
  }, [
    applications,
    applyCrop,
    applyWeek,
    vinesN,
    pepperMixturesActive,
    activeRescueWeek,
    rateConfig.intervals,
  ]);

  /** Week-level: unfinished products for the amber finish panel. */
  const unfinishedLines = useMemo(() => {
    return Object.entries(lineProgressByName)
      .filter(([, p]) => p.incomplete)
      .map(([name, p]) => ({ name, ...p }));
  }, [lineProgressByName]);

  /**
   * Primary finish-rest context: prefer enabled incomplete lines, else any.
   */
  const cycleProgress = useMemo((): CycleProgress & {
    focusName: string | null;
  } => {
    const enabledIncomplete = unfinishedLines.filter((u) =>
      Boolean(lineEnabled[u.name])
    );
    const focus = enabledIncomplete[0] || unfinishedLines[0] || null;
    if (focus) {
      return { ...focus, focusName: focus.name };
    }
    // No incomplete — show empty progress for UX helpers
    const empty: CycleProgress = {
      treated: 0,
      total: vinesN,
      remaining: vinesN,
      intervalDays: Number(rateConfig.intervals?.[String(applyWeek)]) || 0,
      cycleStartedAt: null,
      cycleDueAt: null,
      incomplete: false,
      doneThisRound: false,
      neverStarted: true,
      steps: [],
      lastStepTreated: 0,
    };
    return { ...empty, focusName: null };
  }, [
    unfinishedLines,
    lineEnabled,
    vinesN,
    rateConfig.intervals,
    applyWeek,
  ]);

  const seasonWeekStatus = useMemo(() => {
    if (!applyCrop || !rateWeeks.length) return [];
    return computeSeasonWeekStatus({
      weeks: rateWeeks,
      applications,
      cropName: applyCrop,
      vinesTotal: vinesN,
      intervals: rateConfig.intervals || {},
      isPepperMixturesWeek,
    });
  }, [applyCrop, rateWeeks, applications, vinesN, rateConfig.intervals]);

  const currentSeasonWeek = seasonWeekStatus.find((s) => s.isCurrent)?.week;

  const treatedSoFar = cycleProgress.treated;
  const vinesLeft = cycleProgress.remaining;
  const cycleDueLabel = cycleProgress.cycleDueAt
    ? cycleProgress.cycleDueAt.toISOString().slice(0, 10)
    : "";
  /** Live preview: after logging what’s in “Treated today”, how many still need this round. */
  const remainingAfterThisStep = cycleProgress.incomplete
    ? Math.max(0, vinesLeft - treatedN)
    : vinesN > 0
      ? Math.max(0, vinesN - treatedN)
      : 0;
  const progressAfterThisStep = cycleProgress.incomplete
    ? Math.min(cycleProgress.total, treatedSoFar + treatedN)
    : treatedN;

  // Sync treated-today with round progress (do not fight user typing mid-edit:
  // only when crop/week/remaining changes from data reload).
  useEffect(() => {
    if (cycleProgress.incomplete && vinesLeft > 0) {
      setTreatedCount(String(vinesLeft));
      return;
    }
    if (!cycleProgress.incomplete && vinesN > 0) {
      setTreatedCount(String(vinesN));
    }
  }, [applyCrop, applyWeek, cycleProgress.incomplete, vinesLeft, vinesN]);

  useEffect(() => {
    const treated = Math.max(0, Math.floor(Number(treatedCount) || 0));
    const tanks = Math.max(0, Number(tankCount) || 0);
    const refreshed: Record<string, string> = {};
    const refreshedEn: Record<string, boolean> = {};

    if (pepperMixturesActive) {
      let perPlant = gramsFromConfig(rateConfig, plantAge, monsoon);
      if (halveWithGliricidia) perPlant = perPlant / 2;
      const key = PEPPER_MIXTURE.productName;
      refreshedEn[key] = true;
      refreshed[key] = String(Number((perPlant * treated).toFixed(2)));
    } else {
      for (const line of activeRescueWeek.lines) {
        const key = line.fertilizerName;
        refreshedEn[key] = line.optional ? false : true;
        refreshed[key] = String(
          Number(lineGrams(line, treated, tanks).toFixed(2))
        );
      }
    }
    setLineEnabled(refreshedEn);
    setLineAmounts(refreshed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    applyWeek,
    treatedCount,
    tankCount,
    plantAge,
    monsoon,
    halveWithGliricidia,
    rateConfig,
    activeRescueWeek,
    pepperMixturesActive,
  ]);

  // Plant count from crop card → Total plants only (never clobber Treated today).
  useEffect(() => {
    if (!applyCrop) return;
    const meta = cropMeta.find(
      (c) => c.name.toLowerCase() === applyCrop.toLowerCase()
    );
    if (meta && meta.plant_count > 0) {
      setVineCount(String(meta.plant_count));
    }
  }, [applyCrop, cropMeta]);

  // Keep Apply week in range when crop template switches (pepper 0–4 vs turmeric 1–5).
  // Prefer the season's current week when the selection is invalid.
  useEffect(() => {
    if (!rateWeeks.length) return;
    if (!rateWeeks.some((w) => w.week === applyWeek)) {
      const prefer =
        currentSeasonWeek != null &&
        rateWeeks.some((w) => w.week === currentSeasonWeek)
          ? currentSeasonWeek
          : rateWeeks[0].week;
      setApplyWeek(prefer);
      setExtraRound(false);
    }
  }, [rateWeeks, applyWeek, currentSeasonWeek]);

  // Jump to the highlighted "on now" week when switching crops.
  useEffect(() => {
    if (!applyCrop || currentSeasonWeek == null) return;
    if (rateWeeks.some((w) => w.week === currentSeasonWeek)) {
      setApplyWeek(currentSeasonWeek);
      setExtraRound(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on crop change
  }, [applyCrop]);

  async function loadRateConfig(
    crop: string
  ): Promise<FertilizerRateConfig | null> {
    const name = String(crop || "").trim();
    if (!name) return defaultFertilizerRateConfig();
    const res = await apiFetch(
      `/getFertilizerRates?crop=${encodeURIComponent(name)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as FertilizerRateConfig;
    const defaults = defaultFertilizerRateConfigForCrop(name);
    return {
      mixtureRates: data?.mixtureRates || defaults.mixtureRates,
      weeks:
        Array.isArray(data?.weeks) && data.weeks.length > 0
          ? data.weeks
          : defaults.weeks,
      intervals: data?.intervals || defaults.intervals,
      tankLiters:
        Number(data?.tankLiters) > 0
          ? Number(data.tankLiters)
          : defaults.tankLiters,
    };
  }

  async function saveRateConfig() {
    if (!isAdmin || !ratesDraft) return;
    if (!selectedCrop) {
      setError("Select a crop before saving fertilizer rates.");
      return;
    }
    void unlockAudio();
    play("click");
    setRatesSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await apiFetch("/saveFertilizerRates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cropName: selectedCrop, config: ratesDraft }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const saved = (await res.json()) as FertilizerRateConfig;
      setRatesDraft(structuredClone(saved));
      if (
        applyCrop &&
        selectedCrop.toLowerCase() === applyCrop.toLowerCase()
      ) {
        setRateConfig(saved);
      }
      play("success");
      setMessage(
        `Fertilizer rates saved for ${selectedCrop} — Apply week uses these amounts for this crop.`
      );
    } catch (e: any) {
      play("error");
      setError(e?.message || "Failed to save rates");
    } finally {
      setRatesSaving(false);
    }
  }

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const cropForRates = applyCrop || selectedCrop || cropParam || "";
      const cacheKey = cropForRates
        ? `fertilizer:bootstrap:${cropForRates.toLowerCase()}`
        : "fertilizer:bootstrap";

      await swrLoad({
        key: cacheKey,
        freshMaxAgeMs: 45_000,
        fetcher: async () => {
          const q = cropForRates
            ? `?crop=${encodeURIComponent(cropForRates)}`
            : "";
          const res = await apiFetch(`/getFertilizerBootstrap${q}`);
          if (res.status === 401) {
            navigate("/login");
            throw new Error("Unauthorized");
          }
          if (!res.ok) throw new Error(await readError(res));
          return res.json();
        },
        apply: (data) => {
          applyFertilizerBootstrap(data);
        },
      });
    } catch (e: any) {
      if (e?.message !== "Unauthorized") {
        setError(e?.message || "Failed to load");
      }
    } finally {
      setLoading(false);
    }
  }

  function applyFertilizerBootstrap(data: {
    crops?: {
      name: string;
      plant_count?: number;
      status?: string;
    }[];
    fertilizers?: Fertilizer[];
    purchasePack?: { items?: any[] };
    schedules?: Schedule[];
    applications?: Application[];
    rates?: FertilizerRateConfig | null;
    cropFertilizerNotes?: {
      crop_name?: string;
      fertilizer_name?: string;
      note?: string;
    }[];
    crop?: string | null;
  }) {
    if (!data) return;

    if (Array.isArray(data.crops)) {
      const active = data.crops.filter(
        (r) => String(r.status || "active").toLowerCase() !== "closed"
      );
      setCropMeta(
        active.map((r) => ({
          name: r.name,
          plant_count: Number(r.plant_count) || 0,
          status: String(r.status || "active"),
        }))
      );
      const names = active.map((r) => r.name).filter(Boolean);
      setCrops(names);
      setSelectedCrop((prev) => (prev && !names.includes(prev) ? "" : prev));
      setApplyCrop((prev) => (prev && !names.includes(prev) ? "" : prev));
      setUseCrop((prev) => (prev && !names.includes(prev) ? "" : prev));
    }

    if (Array.isArray(data.fertilizers)) {
      setFertilizers(data.fertilizers);
    }

    if (data.purchasePack?.items) {
      setPurchasePack(
        data.purchasePack.items.map(
          (row: {
            name?: string;
            unit?: string;
            stock_qty?: number;
            unit_price?: number;
            notes?: string | null;
          }) => ({
            name: String(row.name || ""),
            unit: String(row.unit || "kg"),
            stock_qty: String(row.stock_qty ?? 0),
            unit_price: String(row.unit_price ?? 0),
            notes: row.notes != null ? String(row.notes) : "",
          })
        )
      );
    }

    if (Array.isArray(data.schedules)) {
      setSchedules(data.schedules);
      setSelectedSchedIds([]);
      const forCrop = data.schedules;
      const prefer =
        forCrop.find((s) => s.is_working) || forCrop[0] || null;
      if (prefer) {
        setActiveScheduleId(prefer.id);
        fillScheduleForm(prefer);
      } else if (!forCrop.length) {
        setActiveScheduleId(null);
        clearScheduleForm();
      }
    }

    if (Array.isArray(data.applications)) {
      setApplications(data.applications);
    }

    if (Array.isArray(data.cropFertilizerNotes)) {
      const map: Record<string, string> = {};
      for (const row of data.cropFertilizerNotes) {
        const n = String(row.fertilizer_name || "").trim();
        if (n) map[n] = row.note != null ? String(row.note) : "";
      }
      setCropFertNotes(map);
    } else if (data.crop != null) {
      setCropFertNotes({});
    }

    if (data.rates) {
      const name = String(data.crop || applyCrop || selectedCrop || "").trim();
      const defaults = name
        ? defaultFertilizerRateConfigForCrop(name)
        : defaultFertilizerRateConfig();
      setRateConfig({
        mixtureRates: data.rates.mixtureRates || defaults.mixtureRates,
        weeks:
          Array.isArray(data.rates.weeks) && data.rates.weeks.length > 0
            ? data.rates.weeks
            : defaults.weeks,
        intervals: data.rates.intervals || defaults.intervals,
        tankLiters:
          Number(data.rates.tankLiters) > 0
            ? Number(data.rates.tankLiters)
            : defaults.tankLiters,
      });
    } else if (!(applyCrop || selectedCrop || cropParam)) {
      setRateConfig(defaultFertilizerRateConfig());
    }
  }

  async function loadPurchasePack() {
    const res = await apiFetch("/getPurchasePack");
    if (res.status === 401) {
      navigate("/login");
      return;
    }
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    setPurchasePack(
      items.map(
        (row: {
          name?: string;
          unit?: string;
          stock_qty?: number;
          unit_price?: number;
          notes?: string | null;
        }) => ({
          name: String(row.name || ""),
          unit: String(row.unit || "kg"),
          stock_qty: String(row.stock_qty ?? 0),
          unit_price: String(row.unit_price ?? 0),
          notes: row.notes != null ? String(row.notes) : "",
        })
      )
    );
  }

  async function savePurchasePack() {
    if (!isAdmin) return;
    void unlockAudio();
    play("click");
    setPurchasePackSaving(true);
    setError("");
    setMessage("");
    try {
      const items = purchasePack
        .map((row) => ({
          name: row.name.trim(),
          unit: row.unit.trim() || "kg",
          stock_qty: Number(row.stock_qty) || 0,
          unit_price: Number(row.unit_price) || 0,
          notes: row.notes.trim() || null,
        }))
        .filter((row) => row.name.length > 0);
      if (!items.length) {
        throw new Error("Add at least one purchase pack product");
      }
      const res = await apiFetch("/savePurchasePack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      const saved = Array.isArray(data.items) ? data.items : [];
      setPurchasePack(
        saved.map(
          (row: {
            name?: string;
            unit?: string;
            stock_qty?: number;
            unit_price?: number;
            notes?: string | null;
          }) => ({
            name: String(row.name || ""),
            unit: String(row.unit || "kg"),
            stock_qty: String(row.stock_qty ?? 0),
            unit_price: String(row.unit_price ?? 0),
            notes: row.notes != null ? String(row.notes) : "",
          })
        )
      );
      play("save");
      setMessage(
        "Purchase pack saved. Use “Add purchases to stock” to add these quantities to inventory."
      );
    } catch (e: any) {
      play("error");
      setError(e?.message || "Failed to save purchase pack");
    } finally {
      setPurchasePackSaving(false);
    }
  }

  async function importPurchasePack(mode: "add" | "set" | "add_if_zero") {
    if (!isAdmin) return;
    if (mode === "set") {
      const ok = window.confirm(
        "Reset stock to pack quantities?\n\nThis REPLACES current stock with the purchase pack amounts (does not add). Unit prices will also be set from the pack."
      );
      if (!ok) return;
    }
    void unlockAudio();
    play("click");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await apiFetch("/seedStarterInventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      invalidateCache("fertilizer");
      setFertilizers(data.fertilizers || []);
      await loadPurchasePack();
      play("save");
      setMessage(
        mode === "add"
          ? data.hint ||
              "Purchases added to stock — quantities summed; unit prices updated."
          : mode === "set"
            ? data.hint ||
                "Stock reset to pack quantities and unit prices updated."
            : data.hint ||
                "Purchase pack synced — missing products added; empty stocks filled."
      );
    } catch (e: any) {
      play("error");
      setError(e?.message || "Import failed");
    } finally {
      setSaving(false);
    }
  }

  function mixturesWeekLabel() {
    const base = activeRescueWeek.title;
    if (pepperMixturesActive && extraRound) {
      return `Extra round — ${base}`;
    }
    return base;
  }

  function openFertilizerNote(fertilizerName: string, tip?: string) {
    const existing = cropFertNotes[fertilizerName] || "";
    setNoteEditor({
      fertilizerName,
      draft: existing || tip || "",
    });
  }

  async function saveFertilizerCropNote() {
    if (!noteEditor || !applyCrop) return;
    if (!isAdmin) {
      setNoteEditor(null);
      return;
    }
    setNoteSaving(true);
    setError("");
    try {
      const res = await apiFetch("/saveCropFertilizerNote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cropName: applyCrop,
          fertilizerName: noteEditor.fertilizerName,
          note: noteEditor.draft,
        }),
      });
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      if (!res.ok) throw new Error(await readError(res));
      const saved = await res.json();
      setCropFertNotes((prev) => {
        const next = { ...prev };
        const text = String(saved.note || "").trim();
        if (text) next[noteEditor.fertilizerName] = text;
        else delete next[noteEditor.fertilizerName];
        return next;
      });
      invalidateCache("fertilizer");
      play("success");
      setNoteEditor(null);
      setMessage(`Note saved for ${noteEditor.fertilizerName} on ${applyCrop}`);
    } catch (e: any) {
      play("error");
      setError(e?.message || "Failed to save note");
    } finally {
      setNoteSaving(false);
    }
  }

  async function applyRescueWeek(e: FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    if (!applyCrop) {
      setError("Select a crop first");
      return;
    }
    void unlockAudio();
    play("click");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (!(treatedN > 0)) {
        throw new Error("Enter how many plants / vines were treated today");
      }
      if (cycleProgress.incomplete && vinesLeft > 0 && treatedN > vinesLeft) {
        throw new Error(
          `Only ${vinesLeft} vines still need${
            cycleProgress.focusName ? ` ${cycleProgress.focusName}` : " this round"
          } — lower “Treated today” (or mark week complete if done/skipped).`
        );
      }
      for (const u of unfinishedLines) {
        if (lineEnabled[u.name] && treatedN > u.remaining) {
          throw new Error(
            `Only ${u.remaining} vines still need ${u.name} — lower “Treated today” or uncheck that product.`
          );
        }
      }

      const weekLabel = mixturesWeekLabel();
      const batchId = `${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const coverage =
        vinesN > 0
          ? `[treated:${treatedN}/${vinesN}]`
          : `[treated:${treatedN}]`;
      const partialLabel = isPartialApply
        ? ` Partial ${treatedN}/${vinesN} vines`
        : vinesN > 0
          ? ` Full ${treatedN}/${vinesN} vines`
          : ` ${treatedN} vines`;
      const detail =
        pepperMixturesActive
          ? ` · ${PEPPER_MIXTURE.ageLabels[plantAge]} · ${PEPPER_MIXTURE.monsoonLabels[monsoon]}${
              halveWithGliricidia ? " · halved (Gliricidia)" : ""
            }`
          : "";
      const noteBase = `[batch:${batchId}] ${coverage}${partialLabel} · ${weekLabel}${detail} · ${applyCrop}`;

      const lines = activeRescueWeek.lines
        .filter((line) => lineEnabled[line.fertilizerName])
        .map((line) => ({
          fertilizerName: line.fertilizerName,
          amount: Number(lineAmounts[line.fertilizerName]),
          unit: "g",
          notes: noteBase,
        }))
        .filter((l) => l.amount > 0);

      if (!lines.length) {
        throw new Error(
          activeRescueWeek.lines.length === 0
            ? "This phase/week is checklist-only — no stock lines to log. Use Crop Notes for flush/cure steps, or add products under Log usage."
            : "Enable at least one product line with amount > 0"
        );
      }

      const finishWeek =
        markWeekComplete || (vinesN > 0 && treatedN >= vinesN);

      const res = await apiFetch("/addFertilizerApplicationBatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cropName: applyCrop,
          appliedAt: applyDate,
          weekLabel,
          weekNumber: applyWeek,
          treatedPlants: treatedN,
          totalPlants: vinesN,
          markWeekComplete: finishWeek,
          lines,
        }),
      });
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      if (data.fertilizers) setFertilizers(data.fertilizers);
      await loadApplications(applyCrop);
      play("save");
      const afterLeft = cycleProgress.incomplete
        ? Math.max(0, vinesLeft - treatedN)
        : Math.max(0, vinesN - treatedN);
      const est = Number(data.estimatedCost) || 0;
      const estMsg =
        est > 0
          ? ` Est. stock value used ~${est.toLocaleString()} (not added to ledger — already paid).`
          : "";
      setMessage(
        (pepperMixturesActive && extraRound
          ? `Logged Extra round (${lines.length} product(s)) for ${treatedN} vine(s) on ${applyCrop}.`
          : `Logged ${lines.length} product(s) · −${treatedN} vines on ${applyCrop}.`) +
          (finishWeek
            ? " Round complete — goal reached."
            : afterLeft > 0
              ? ` Now ${afterLeft} vines still need it — keep stepping.`
              : "") +
          " Inventory updated." +
          estMsg
      );
      invalidateCache("fertilizer");
      // After save, applications reload; cycleProgress effect will set remaining.
      setSelectedCrop(applyCrop);
      setUseCrop(applyCrop);
    } catch (err: any) {
      play("error");
      setError(err?.message || "Apply failed");
    } finally {
      setSaving(false);
    }
  }

  async function loadFertilizers() {
    const res = await apiFetch("/getFertilizers");
    if (res.status === 401) {
      navigate("/login");
      return;
    }
    if (!res.ok) throw new Error(await readError(res));
    setFertilizers(await res.json());
  }

  async function loadSchedules(crop?: string) {
    const q = crop ? `?crop=${encodeURIComponent(crop)}` : "";
    const res = await apiFetch(`/getFertilizerSchedules${q}`);
    if (res.status === 401) {
      navigate("/login");
      return;
    }
    if (!res.ok) throw new Error(await readError(res));
    const rows = (await res.json()) as Schedule[];
    setSchedules(rows);
    setSelectedSchedIds([]);
    if (crop) {
      const forCrop = rows.filter(
        (s) =>
          s.crop_name && s.crop_name.toLowerCase() === crop.toLowerCase()
      );
      const prefer =
        forCrop.find((s) => s.is_working) || forCrop[0] || null;
      if (prefer) {
        setActiveScheduleId(prefer.id);
        fillScheduleForm(prefer);
      } else {
        setActiveScheduleId(null);
        clearScheduleForm();
      }
    }
  }

  async function loadApplications(crop?: string) {
    const q = crop ? `?crop=${encodeURIComponent(crop)}` : "";
    const res = await apiFetch(`/getFertilizerApplications${q}`);
    if (res.status === 401) {
      navigate("/login");
      return;
    }
    if (!res.ok) throw new Error(await readError(res));
    setApplications(await res.json());
  }

  function fillScheduleForm(s: Schedule) {
    setSchedName(s.name);
    setSchedDesc(s.description || "");
    setSchedSteps(
      s.steps.length
        ? s.steps.map((st) => ({ ...st }))
        : [
            {
              step_order: 1,
              week_number: 1,
              title: "",
              instructions: "",
              suggested_fertilizer_id: null,
              suggested_amount: null,
              unit: "g",
              interval_days: null,
            },
          ]
    );
  }

  function clearScheduleForm() {
    setSchedName("");
    setSchedDesc("");
    setSchedSteps([]);
  }

  function resetFertForm() {
    setEditId(null);
    setName("");
    setUnit("kg");
    setStockQty("0");
    setUnitPrice("0");
    setNotes("");
  }

  function startEdit(f: Fertilizer) {
    void unlockAudio();
    play("click");
    setEditId(f.id);
    setName(f.name);
    setUnit(f.unit);
    setStockQty(String(f.stock_qty));
    setUnitPrice(String(f.unit_price));
    setNotes(f.notes || "");
    setTab("inventory");
  }

  async function saveFertilizer(e: FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    void unlockAudio();
    play("click");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        id: editId ?? undefined,
        name: name.trim(),
        unit: unit.trim() || "kg",
        stockQty: Number(stockQty),
        unitPrice: Number(unitPrice),
        notes: notes.trim() || null,
      };
      const res = await apiFetch(
        editId ? "/updateFertilizer" : "/addFertilizer",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error(await readError(res));
      play("save");
      setMessage(editId ? "Fertilizer updated." : "Fertilizer added.");
      resetFertForm();
      await loadFertilizers();
    } catch (err: any) {
      play("error");
      setError(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function doRestock() {
    if (!isAdmin) return;
    if (restockId == null) return;
    const delta = Number(restockAmount);
    if (!(delta > 0)) {
      play("error");
      setError("Restock amount must be greater than 0");
      return;
    }
    void unlockAudio();
    play("click");
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/updateFertilizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: restockId, stockDelta: delta }),
      });
      if (!res.ok) throw new Error(await readError(res));
      play("success");
      setMessage(`Restocked +${delta}.`);
      setRestockId(null);
      setRestockAmount("");
      await loadFertilizers();
    } catch (err: any) {
      play("error");
      setError(err?.message || "Restock failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeFertilizer(id: number) {
    if (!isAdmin) return;
    void unlockAudio();
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/deleteFertilizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(await readError(res));
      play("delete");
      setConfirmDeleteFert(null);
      setMessage("Fertilizer deleted.");
      if (editId === id) resetFertForm();
      await loadFertilizers();
    } catch (err: any) {
      play("error");
      setError(err?.message || "Delete failed");
      setConfirmDeleteFert(null);
    } finally {
      setSaving(false);
    }
  }

  async function showPriceHistory(id: number) {
    void unlockAudio();
    play("click");
    if (historyFor === id) {
      setHistoryFor(null);
      setPriceHistory([]);
      return;
    }
    const res = await apiFetch(
      `/getFertilizerPriceHistory?fertilizerId=${id}`
    );
    if (!res.ok) {
      play("error");
      setError(await readError(res));
      return;
    }
    setPriceHistory(await res.json());
    setHistoryFor(id);
  }

  async function logUsage(e: FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    void unlockAudio();
    play("click");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const fert = fertilizers.find((f) => f.id === Number(useFertId));
      const res = await apiFetch("/addFertilizerApplication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cropName: useCrop.trim(),
          fertilizerId: Number(useFertId),
          amount: Number(useAmount),
          unit: useUnit.trim() || fert?.unit || "kg",
          appliedAt: useDate,
          notes: useNotes.trim() || null,
          scheduleStepId: useStepId ? Number(useStepId) : null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      play("success");
      setMessage("Usage logged — inventory updated.");
      setUseAmount("");
      setUseNotes("");
      setUseStepId("");
      await Promise.all([
        loadFertilizers(),
        loadApplications(selectedCrop || useCrop || undefined),
      ]);
    } catch (err: any) {
      play("error");
      setError(err?.message || "Failed to log usage");
    } finally {
      setSaving(false);
    }
  }

  async function removeApplication(id: number) {
    if (!isAdmin) return;
    void unlockAudio();
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/deleteFertilizerApplication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(await readError(res));
      play("delete");
      setConfirmDeleteApp(null);
      setMessage("Usage deleted — stock restored.");
      await Promise.all([
        loadFertilizers(),
        loadApplications(selectedCrop || undefined),
      ]);
    } catch (err: any) {
      play("error");
      setError(err?.message || "Delete failed");
      setConfirmDeleteApp(null);
    } finally {
      setSaving(false);
    }
  }

  async function seedCropSchedule(
    kind:
      | "auto"
      | "pepper"
      | "turmeric_premium"
      | "turmeric_chemical"
      | "from_rates"
  ) {
    if (!isAdmin) return;
    if (!selectedCrop) {
      play("error");
      setError("Pick a crop first to create a schedule for that crop only.");
      return;
    }
    void unlockAudio();
    play("click");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await apiFetch("/seedDefaultSchedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cropName: selectedCrop, kind }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const schedule = (await res.json()) as Schedule;
      const applyRes = await apiFetch("/applyFertilizerSchedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: schedule.id }),
      });
      const applied = applyRes.ok
        ? ((await applyRes.json()) as Schedule)
        : schedule;
      play("success");
      setMessage(
        `Created “${applied.name}” for ${selectedCrop} and set it as currently working.`
      );
      await loadSchedules(selectedCrop);
      setActiveScheduleId(applied.id);
      fillScheduleForm(applied);
    } catch (err: any) {
      play("error");
      setError(err?.message || "Seed failed");
    } finally {
      setSaving(false);
    }
  }

  function startNewSchedule() {
    if (!isAdmin || !selectedCrop) return;
    void unlockAudio();
    play("click");
    setActiveScheduleId(null);
    setSchedName(selectedCrop ? `${selectedCrop} cycle` : "Custom cycle");
    setSchedDesc("");
    setSchedSteps([
      {
        step_order: 1,
        week_number: 1,
        title: "",
        instructions: "",
        suggested_fertilizer_id: null,
        suggested_amount: null,
        unit: "g",
        interval_days: null,
      },
    ]);
  }

  function updateStep(index: number, patch: Partial<ScheduleStep>) {
    if (!isAdmin) return;
    setSchedSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  }

  function addStepRow() {
    if (!isAdmin) return;
    setSchedSteps((prev) => [
      ...prev,
      {
        step_order: prev.length + 1,
        week_number: prev.length + 1,
        title: "",
        instructions: "",
        suggested_fertilizer_id: null,
        suggested_amount: null,
        unit: "g",
        interval_days: null,
      },
    ]);
  }

  function removeStepRow(index: number) {
    if (!isAdmin) return;
    setSchedSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, step_order: i + 1 }))
    );
  }

  async function saveScheduleForm(e: FormEvent, applyWorking = saveAndApply) {
    e.preventDefault();
    if (!isAdmin) return;
    if (!selectedCrop && !activeSchedule?.crop_name) {
      // allow saving template edits when active is template
    }
    void unlockAudio();
    play("click");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const cropForSave =
        activeSchedule?.crop_name === null && activeScheduleId
          ? null
          : selectedCrop || activeSchedule?.crop_name || null;

      const res = await apiFetch("/saveSchedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeScheduleId,
          cropName: cropForSave,
          name: schedName.trim(),
          description: schedDesc.trim() || null,
          applyWorking: Boolean(applyWorking && cropForSave),
          steps: schedSteps.map((s, i) => ({
            stepOrder: i + 1,
            weekNumber: s.week_number,
            title: s.title,
            instructions: s.instructions,
            suggestedFertilizerId: s.suggested_fertilizer_id,
            suggestedAmount: s.suggested_amount,
            unit: s.unit,
            intervalDays: s.interval_days,
          })),
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const saved = (await res.json()) as Schedule;
      play("save");
      setMessage(
        saved.is_working
          ? `Saved and set as currently working schedule for ${saved.crop_name || selectedCrop}.`
          : "Schedule saved."
      );
      setActiveScheduleId(saved.id);
      await loadSchedules(selectedCrop || undefined);
      fillScheduleForm(saved);
    } catch (err: any) {
      play("error");
      setError(err?.message || "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  async function applyWorkingSchedule(id: number) {
    if (!isAdmin) return;
    void unlockAudio();
    play("click");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await apiFetch("/applyFertilizerSchedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const saved = (await res.json()) as Schedule;
      play("success");
      setMessage(
        `“${saved.name}” is now the currently working schedule for ${saved.crop_name}.`
      );
      setActiveScheduleId(saved.id);
      await loadSchedules(selectedCrop || undefined);
      fillScheduleForm(saved);
    } catch (err: any) {
      play("error");
      setError(err?.message || "Failed to apply schedule");
    } finally {
      setSaving(false);
    }
  }

  async function removeSchedule(id: number) {
    if (!isAdmin) return;
    void unlockAudio();
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/deleteFertilizerSchedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) throw new Error(await readError(res));
      play("delete");
      setConfirmDeleteSched(null);
      setMessage("Schedule deleted.");
      if (activeScheduleId === id) {
        setActiveScheduleId(null);
        clearScheduleForm();
      }
      setSelectedSchedIds((prev) => prev.filter((x) => x !== id));
      await loadSchedules(selectedCrop || undefined);
    } catch (err: any) {
      play("error");
      setError(err?.message || "Delete failed");
      setConfirmDeleteSched(null);
    } finally {
      setSaving(false);
    }
  }

  async function removeSchedulesBulk(ids: number[]) {
    if (!isAdmin || !ids.length) return;
    void unlockAudio();
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/deleteFertilizerSchedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { deleted?: number };
      play("delete");
      setConfirmBulkDeleteSched(false);
      setMessage(
        `Deleted ${data.deleted ?? ids.length} schedule${
          (data.deleted ?? ids.length) === 1 ? "" : "s"
        }.`
      );
      if (activeScheduleId && ids.includes(activeScheduleId)) {
        setActiveScheduleId(null);
        clearScheduleForm();
      }
      setSelectedSchedIds([]);
      await loadSchedules(selectedCrop || undefined);
    } catch (err: any) {
      play("error");
      setError(err?.message || "Bulk delete failed");
      setConfirmBulkDeleteSched(false);
    } finally {
      setSaving(false);
    }
  }

  function onCropChange(crop: string) {
    setSelectedCrop(crop);
    setUseCrop(crop);
    setSelectedSchedIds([]);
    if (crop) {
      setSearchParams({ crop });
    } else {
      setSearchParams({});
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "apply", label: "Apply week" },
    { id: "inventory", label: "Inventory" },
    { id: "schedules", label: "Schedules" },
    { id: "usage", label: "Log usage" },
    ...(isAdmin ? [{ id: "rates" as const, label: "Edit rates" }] : []),
  ];

  const editingRates = ratesDraft || rateConfig;

  return (
    <div className="page-container min-h-screen animate-rise">
      <header className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <p className="eyebrow">Crop nutrition</p>
          <h1 className="font-display text-3xl md:text-4xl text-gold glow-text">
            Fertilizer
          </h1>
          <p className="text-gold-muted text-sm mt-2 max-w-xl">
            Purchase pack → apply weekly doses → stock updates live. Works for
            any crop. Logging usage deducts stock.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <SoundToggle />
          <button className="glass-btn" onClick={() => navigate("/dashboard")}>
            ← Dashboard
          </button>
        </div>
      </header>

      {isObserve && (
        <div className="observe-banner mb-4">
          Observe mode — unit prices are blurred; view only (no edits, apply,
          sync, or deletes).
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`glass-btn ${tab === t.id ? "gold-btn" : ""}`}
            onClick={() => {
              play("click");
              setTab(t.id);
              if (t.id === "rates") {
                if (!selectedCrop && applyCrop) {
                  setSelectedCrop(applyCrop);
                }
                // Draft is loaded by the rates-tab effect for selectedCrop.
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(error || message) && (
        <div className="mb-4 space-y-2">
          {error && <p className="text-red-300 text-sm">{error}</p>}
          {message && <p className="text-emerald-300 text-sm">{message}</p>}
        </div>
      )}

      {loading ? (
        <p className="text-gold-muted">Loading…</p>
      ) : (
        <>
          {tab === "apply" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="glass-card gold-sheen space-y-4">
                <div>
                  <p className="eyebrow">Rescue plan</p>
                  <h2 className="font-display text-xl text-gold">
                    Apply week & sync stock
                  </h2>
                  <p className="text-sm text-gold-muted mt-2 leading-relaxed">
                    Rates are per crop. Crop plant count auto-fills vines. Each
                    week shows per-plant (or per-tank) rates and the total for
                    all plants before you log — shared inventory deducts
                    automatically (g → kg).
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        className="glass-btn gold-btn"
                        disabled={saving}
                        onClick={() => void importPurchasePack("add")}
                        title="Adds purchase pack quantities onto current stock; updates unit prices"
                      >
                        Add purchases to stock
                      </button>
                      <button
                        type="button"
                        className="glass-btn text-sm"
                        disabled={saving}
                        onClick={() => void importPurchasePack("set")}
                        title="Admin only: replace stock with pack quantities"
                      >
                        Reset stock to pack
                      </button>
                    </>
                  )}
                </div>
                {isAdmin && (
                  <p className="text-xs text-gold-muted leading-relaxed">
                    Sync adds these quantities to current inventory (does not
                    replace stock). Use Reset only if you need to overwrite.
                  </p>
                )}

                <form onSubmit={applyRescueWeek} className="space-y-3">
                  <label className="block">
                    <span className="eyebrow mb-1 block">Crop</span>
                    <select
                      className="glass-input"
                      value={applyCrop}
                      onChange={(e) => {
                        setApplyCrop(e.target.value);
                        if (e.target.value) setSelectedCrop(e.target.value);
                      }}
                      required
                    >
                      <option value="">Select crop…</option>
                      {crops.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>

                  {!applyCrop ? (
                    <div className="rounded-xl border border-amber-400/35 bg-amber-950/25 px-4 py-6 text-center space-y-2">
                      <p className="font-display text-lg text-gold">
                        Select a crop
                      </p>
                      <p className="text-sm text-gold-muted leading-relaxed">
                        Choose a crop above to see that crop&apos;s weeks, rates,
                        and totals. Nothing is shown until a crop is selected
                        (or opened via a crop link).
                      </p>
                    </div>
                  ) : (
                  <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="block">
                      <span className="eyebrow mb-1 flex items-center gap-2 flex-wrap">
                        Total plants on crop
                        {applyCropMeta && applyCropMeta.plant_count > 0 ? (
                          <span
                            className="plant-count-badge"
                            title="Crop plant count"
                          >
                            <span className="plant-count-badge__value">
                              {applyCropMeta.plant_count}
                            </span>
                            <span className="plant-count-badge__label">
                              saved
                            </span>
                          </span>
                        ) : null}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="glass-input"
                        value={vineCount}
                        onChange={(e) => {
                          setVineCount(e.target.value);
                          // If treated was matching old total, keep in sync
                          if (
                            treatedCount === vineCount ||
                            Number(treatedCount) > Number(e.target.value)
                          ) {
                            setTreatedCount(e.target.value);
                          }
                        }}
                      />
                    </label>
                    <label className="block">
                      <span className="eyebrow mb-1 block">
                        Treated today (vines)
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="glass-input"
                        value={treatedCount}
                        onChange={(e) => setTreatedCount(e.target.value)}
                        required
                      />
                      <span className="text-[11px] text-gold-muted mt-1 block">
                        Partial OK — e.g. 30 of {vinesN || "…"} over a few days.
                        Grams below = rate × treated today.
                      </span>
                    </label>
                    <label className="block">
                      <span className="eyebrow mb-1 block">Date</span>
                      <input
                        type="date"
                        className="glass-input date-input"
                        value={applyDate}
                        onChange={(e) => setApplyDate(e.target.value)}
                        required
                      />
                    </label>
                  </div>

                  {unfinishedLines.length > 0 && (
                    <div className="rounded-xl border border-amber-400/45 bg-amber-950/35 px-3 py-3 space-y-3">
                      <p className="text-sm font-semibold text-amber-100">
                        Finish the rest of the plants
                        {cycleProgress.focusName
                          ? ` — ${cycleProgress.focusName}`
                          : ""}
                      </p>
                      <p className="text-xs text-gold-muted leading-relaxed">
                        Each fertilizer has its own target. Apply products on
                        different days in this week/phase — enable only what you
                        are putting on today.
                      </p>
                      {unfinishedLines.length > 1 && (
                        <ul className="text-xs text-amber-100/90 space-y-1">
                          {unfinishedLines.map((u) => (
                            <li
                              key={u.name}
                              className="flex justify-between gap-2 tabular-nums"
                            >
                              <span>{u.name}</span>
                              <span>
                                {u.treated}/{u.total} · {u.remaining} left
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-gold-muted tabular-nums">
                          <span>
                            {treatedSoFar}/{cycleProgress.total} done so far
                          </span>
                          <span className="text-amber-200 font-semibold">
                            {vinesLeft} still need it
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-black/40 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-500/80 to-emerald-400/80 transition-all"
                            style={{
                              width: `${
                                cycleProgress.total > 0
                                  ? Math.min(
                                      100,
                                      (treatedSoFar / cycleProgress.total) *
                                        100
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>

                      {treatedN > 0 && treatedN <= vinesLeft && (
                        <p className="text-sm text-emerald-200/95 tabular-nums leading-relaxed">
                          This step{" "}
                          <strong className="text-emerald-100">
                            −{treatedN}
                          </strong>
                          {" → "}
                          then{" "}
                          <strong className="text-amber-100">
                            {progressAfterThisStep}/{cycleProgress.total} done
                          </strong>
                          {" · "}
                          <strong className="text-amber-200">
                            {remainingAfterThisStep} vines still need it
                          </strong>
                          {remainingAfterThisStep === 0
                            ? " — round complete after Log apply"
                            : ""}
                        </p>
                      )}

                      {cycleProgress.lastStepTreated > 0 && (
                        <p className="text-xs text-gold-muted tabular-nums">
                          Last logged step was −{cycleProgress.lastStepTreated}{" "}
                          vines
                        </p>
                      )}

                      {cycleProgress.steps.length > 0 && (
                        <ul className="text-xs text-gold-muted space-y-1 max-h-28 overflow-y-auto">
                          {cycleProgress.steps.map((s, i) => (
                            <li
                              key={`${s.at}-${i}`}
                              className="flex justify-between gap-2 tabular-nums"
                            >
                              <span>
                                Step {i + 1}: −{s.treated} vines
                                <span className="opacity-70">
                                  {" "}
                                  · {String(s.at).slice(0, 10)}
                                </span>
                              </span>
                              <span>{s.remainingAfter} left</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <p className="text-xs text-gold-muted leading-relaxed">
                        Example: 105 left and you enter 10 → after Log apply it
                        becomes 95 left (inventory updates too). Keep stepping
                        until the goal is done.
                        {cycleProgress.intervalDays > 0 && (
                          <>
                            {" "}
                            Round window: {cycleProgress.intervalDays} days
                            {cycleDueLabel ? ` (by ${cycleDueLabel})` : ""}.
                          </>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {[10, 20, 25, 50]
                          .filter((n) => n < vinesLeft)
                          .map((n) => (
                            <button
                              key={n}
                              type="button"
                              className="glass-btn text-sm"
                              onClick={() => {
                                play("click");
                                setTreatedCount(String(n));
                              }}
                            >
                              Treat {n}
                              <span className="opacity-70">
                                {" "}
                                → {vinesLeft - n} left
                              </span>
                            </button>
                          ))}
                        <button
                          type="button"
                          className="glass-btn gold-btn text-sm"
                          onClick={() => {
                            play("click");
                            setTreatedCount(String(vinesLeft));
                          }}
                        >
                          Treat remaining {vinesLeft}
                        </button>
                      </div>
                    </div>
                  )}

                  {unfinishedLines.length === 0 &&
                    (treatedSoFar > 0 || isPartialApply) && (
                      <div className="rounded-lg border border-amber-400/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-100/95">
                        {isPartialApply && (
                          <p className="text-xs text-gold-muted">
                            This log treats {treatedN}/{vinesN} — a reminder todo
                            will ask you to finish the rest.
                          </p>
                        )}
                      </div>
                    )}

                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-[#34d399] mt-0.5"
                      checked={
                        markWeekComplete ||
                        (vinesN > 0 && treatedN >= vinesN)
                      }
                      onChange={(e) => setMarkWeekComplete(e.target.checked)}
                      disabled={vinesN > 0 && treatedN >= vinesN}
                    />
                    <span className="text-gold-muted">
                      Mark this week complete for past-due
                      {vinesN > 0 && treatedN >= vinesN
                        ? " (auto — treated ≥ total plants)"
                        : " (use when the remaining vines are done / skipped)"}
                    </span>
                  </label>

                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wide text-gold-muted">
                      Season weeks
                      {currentSeasonWeek != null ? (
                        <span className="text-emerald-300/90 normal-case tracking-normal">
                          {" "}
                          · on now:{" "}
                          {weekScheduleButtonLabel(
                            rateWeeks.find((w) => w.week === currentSeasonWeek) ||
                              activeRescueWeek
                          )}
                        </span>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {rateWeeks.map((w) => {
                        const st = seasonWeekStatus.find(
                          (s) => s.week === w.week
                        );
                        const onNow = Boolean(st?.isCurrent);
                        const selected = applyWeek === w.week;
                        return (
                          <button
                            key={w.week}
                            type="button"
                            className={`glass-btn relative ${
                              selected ? "gold-btn" : ""
                            } ${
                              onNow && !selected
                                ? "ring-2 ring-emerald-400/70 border-emerald-400/50"
                                : onNow && selected
                                  ? "ring-2 ring-emerald-300/80"
                                  : ""
                            }`}
                            onClick={() => {
                              play("click");
                              setApplyWeek(w.week);
                              if (!isPepperMixturesWeek(w)) setExtraRound(false);
                            }}
                          >
                            {onNow && (
                              <span className="absolute -top-1.5 -right-1.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-950">
                                On
                              </span>
                            )}
                            {weekScheduleButtonLabel(w)}
                            {rateConfig.intervals?.[String(w.week)]
                              ? ` · ${rateConfig.intervals[String(w.week)]}d`
                              : ""}
                            {st?.complete ? (
                              <span className="opacity-70"> · done</span>
                            ) : st?.hasIncompleteLine ? (
                              <span className="text-amber-200"> · mid</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {pepperMixturesActive && (
                    <div className="space-y-3 rounded-xl border border-emerald-400/25 bg-emerald-950/20 p-3">
                      <p className="text-xs text-emerald-200/90">
                        {PEPPER_MIXTURE.composition}
                      </p>
                      <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-amber-400/30 bg-amber-950/25 px-3 py-2">
                        <input
                          type="checkbox"
                          className="accent-[#fbbf24] mt-0.5"
                          checked={extraRound}
                          onChange={(e) => setExtraRound(e.target.checked)}
                        />
                        <span>
                          <span className="text-amber-200 font-medium">
                            Extra round
                          </span>
                          <span className="block text-xs text-gold-muted mt-0.5 leading-relaxed">
                            Log an additional Pepper Fertilizer Mixtures application
                            beyond the usual monsoon cycle. Uses the same age /
                            monsoon rates (or edit grams below). History is labeled
                            “Extra round”.
                          </span>
                        </span>
                      </label>
                      <label className="block">
                        <span className="eyebrow mb-1 block">Plant age</span>
                        <select
                          className="glass-input"
                          value={plantAge}
                          onChange={(e) =>
                            setPlantAge(e.target.value as PlantAge)
                          }
                        >
                          {(Object.keys(PEPPER_MIXTURE.ageLabels) as PlantAge[]).map(
                            (k) => (
                              <option key={k} value={k}>
                                {PEPPER_MIXTURE.ageLabels[k]}
                              </option>
                            )
                          )}
                        </select>
                      </label>
                      <label className="block">
                        <span className="eyebrow mb-1 block">
                          {extraRound ? "Rate basis (monsoon table)" : "Monsoon"}
                        </span>
                        <select
                          className="glass-input"
                          value={monsoon}
                          onChange={(e) =>
                            setMonsoon(e.target.value as Monsoon)
                          }
                        >
                          {(
                            Object.keys(PEPPER_MIXTURE.monsoonLabels) as Monsoon[]
                          ).map((k) => (
                            <option key={k} value={k}>
                              {PEPPER_MIXTURE.monsoonLabels[k]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-[#34d399]"
                          checked={halveWithGliricidia}
                          onChange={(e) =>
                            setHalveWithGliricidia(e.target.checked)
                          }
                        />
                        <span className="text-gold-muted">
                          Halve dose (Gliricidia mulch 10–15 kg/vine, 4×/year)
                        </span>
                      </label>
                      <div className="rounded-lg border border-emerald-400/35 bg-emerald-950/35 px-3 py-2.5">
                        <p className="text-[11px] uppercase tracking-wide text-emerald-200/80 mb-1">
                          {extraRound ? "Extra round · " : ""}
                          Total needed this week
                        </p>
                        <p className="text-sm text-emerald-100 font-medium leading-snug">
                          {halveWithGliricidia ? (
                            <>
                              {gramsFromConfig(
                                rateConfig,
                                plantAge,
                                monsoon
                              )} →{" "}
                              {mixturePerPlant} g/plant (halved)
                            </>
                          ) : (
                            <>{mixturePerPlant} g/plant</>
                          )}
                        </p>
                        <p className="text-base text-emerald-200 font-semibold mt-1 tabular-nums">
                          {fmtScaledDose(
                            mixturePerPlant,
                            "g/plant",
                            vinesN,
                            vinesN === 1 ? "plant" : "plants"
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {activeHasPerTank && (
                    <label className="block">
                      <span className="eyebrow mb-1 block">
                        {rateConfig.tankLiters || 10} L spray tanks
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="glass-input"
                        value={tankCount}
                        onChange={(e) => setTankCount(e.target.value)}
                      />
                      <span className="text-[11px] text-gold-muted mt-1 block">
                        Foliar lines scale by tanks. Vine-based lines (if any)
                        still use plant count above ({vinesN.toLocaleString()}{" "}
                        {vinesN === 1 ? "plant" : "plants"}
                        {applyCropIsTurmeric ? " / bags" : ""}).
                      </span>
                    </label>
                  )}

                  <div className="rounded-xl border border-[var(--glass-border)] bg-black/20 p-3">
                    <p className="font-medium text-gold text-sm">
                      {pepperMixturesActive && extraRound
                        ? `Extra round — ${activeRescueWeek.title}`
                        : activeRescueWeek.title}
                    </p>
                    <p className="text-xs text-gold-muted mt-1 leading-relaxed">
                      {activeRescueWeek.summary}
                    </p>
                  </div>

                  {!pepperMixturesActive &&
                    activeRescueWeek.lines.length > 0 && (
                    <div className="rounded-lg border border-amber-400/30 bg-amber-950/25 px-3 py-2.5 space-y-1.5">
                      <p className="text-[11px] uppercase tracking-wide text-amber-200/85">
                        Total needed this week
                        {vinesN > 0
                          ? ` · ${vinesN.toLocaleString()} ${
                              vinesN === 1 ? "plant" : "plants"
                            }`
                          : ""}
                        {activeHasPerTank && tanksN > 0
                          ? ` · ${tanksN.toLocaleString()} ${
                              tanksN === 1 ? "tank" : "tanks"
                            }`
                          : ""}
                      </p>
                      {activeRescueWeek.lines.map((line) => {
                        if (line.mode === "per_plant") {
                          const per = line.gramsPerPlant || 0;
                          return (
                            <p
                              key={line.fertilizerName}
                              className="text-sm text-amber-100/95 tabular-nums leading-snug"
                            >
                              <button
                                type="button"
                                className="text-gold-muted hover:text-emerald-200 hover:underline underline-offset-2"
                                onClick={() => {
                                  play("click");
                                  openFertilizerNote(
                                    line.fertilizerName,
                                    line.tip
                                  );
                                }}
                              >
                                {line.fertilizerName}
                                {line.optional ? " (opt)" : ""}
                              </button>
                              :{" "}
                              {fmtScaledDose(
                                per,
                                "g/plant",
                                vinesN,
                                vinesN === 1 ? "plant" : "plants"
                              )}
                            </p>
                          );
                        }
                        if (line.mode === "per_tank") {
                          const per = line.gramsPerTank || 0;
                          return (
                            <p
                              key={line.fertilizerName}
                              className="text-sm text-amber-100/95 tabular-nums leading-snug"
                            >
                              <button
                                type="button"
                                className="text-gold-muted hover:text-emerald-200 hover:underline underline-offset-2"
                                onClick={() => {
                                  play("click");
                                  openFertilizerNote(
                                    line.fertilizerName,
                                    line.tip
                                  );
                                }}
                              >
                                {line.fertilizerName}
                                {line.optional ? " (opt)" : ""}
                              </button>
                              :{" "}
                              {fmtScaledDose(
                                per,
                                "g/tank",
                                tanksN,
                                tanksN === 1 ? "tank" : "tanks"
                              )}
                            </p>
                          );
                        }
                        return (
                          <p
                            key={line.fertilizerName}
                            className="text-sm text-amber-100/95 tabular-nums leading-snug"
                          >
                            <button
                              type="button"
                              className="text-gold-muted hover:text-emerald-200 hover:underline underline-offset-2"
                              onClick={() => {
                                play("click");
                                openFertilizerNote(
                                  line.fertilizerName,
                                  line.tip
                                );
                              }}
                            >
                              {line.fertilizerName}
                            </button>
                            : {fmtGramsTotal(line.gramsFixed || 0)} (fixed)
                          </p>
                        );
                      })}
                    </div>
                  )}

                  {activeRescueWeek.lines.length === 0 ? (
                    <p className="text-sm text-gold-muted">
                      No stock lines for this phase/week — use as a checklist
                      {/flush|curing|phase 5/i.test(
                        activeRescueWeek.title + activeRescueWeek.summary
                      )
                        ? " (water flush / curing only)."
                        : " — log disease products under Log usage if needed."}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activeRescueWeek.lines.map((line) => {
                        const fert = fertilizers.find(
                          (f) => f.name === line.fertilizerName
                        );
                        const grams = Number(
                          lineAmounts[line.fertilizerName] || 0
                        );
                        const needKg = grams / 1000;
                        const short =
                          fert != null && needKg > fert.stock_qty + 1e-9;
                        const lp = lineProgressByName[line.fertilizerName];
                        const showBar =
                          vinesN > 0 &&
                          (line.mode === "per_plant" ||
                            pepperMixturesActive ||
                            Boolean(lp?.incomplete) ||
                            Boolean(lp && lp.treated > 0));
                        const cropNote = cropFertNotes[line.fertilizerName];
                        const rateHint =
                          pepperMixturesActive
                            ? fmtScaledDose(
                                mixturePerPlant,
                                "g/plant",
                                treatedN,
                                treatedN === 1 ? "plant treated" : "plants treated"
                              )
                            : line.mode === "per_plant"
                              ? fmtScaledDose(
                                  line.gramsPerPlant || 0,
                                  "g/plant",
                                  treatedN,
                                  treatedN === 1
                                    ? "plant treated"
                                    : "plants treated"
                                )
                              : line.mode === "per_tank"
                                ? fmtScaledDose(
                                    line.gramsPerTank || 0,
                                    "g/tank",
                                    tanksN,
                                    tanksN === 1 ? "tank" : "tanks"
                                  )
                                : fmtGramsTotal(line.gramsFixed || 0);
                        return (
                          <div
                            key={line.fertilizerName}
                            className={`rounded-xl border px-3 py-2 ${
                              short
                                ? "border-red-400/40 bg-red-950/20"
                                : lp?.incomplete
                                  ? "border-amber-400/35 bg-amber-950/15"
                                  : "border-[var(--glass-border)] bg-black/15"
                            }`}
                          >
                            <label className="flex flex-wrap items-center gap-3">
                              <input
                                type="checkbox"
                                className="accent-[#d4af37]"
                                checked={Boolean(
                                  lineEnabled[line.fertilizerName]
                                )}
                                onChange={(e) =>
                                  setLineEnabled((prev) => ({
                                    ...prev,
                                    [line.fertilizerName]: e.target.checked,
                                  }))
                                }
                              />
                              <button
                                type="button"
                                className="flex-1 min-w-[120px] text-left text-sm font-medium hover:text-emerald-200 underline-offset-2 hover:underline"
                                title="Why this fertilizer is used for this crop"
                                onClick={(e) => {
                                  e.preventDefault();
                                  play("click");
                                  openFertilizerNote(
                                    line.fertilizerName,
                                    line.tip
                                  );
                                }}
                              >
                                {line.fertilizerName}
                                {line.optional ? (
                                  <span className="text-gold-muted font-normal no-underline">
                                    {" "}
                                    (optional)
                                  </span>
                                ) : null}
                              </button>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                className="glass-input w-28"
                                disabled={!lineEnabled[line.fertilizerName]}
                                value={lineAmounts[line.fertilizerName] || ""}
                                onChange={(e) =>
                                  setLineAmounts((prev) => ({
                                    ...prev,
                                    [line.fertilizerName]: e.target.value,
                                  }))
                                }
                              />
                              <span className="text-xs text-gold-muted w-8">g</span>
                            </label>
                            {showBar && lp && (
                              <div className="mt-2 pl-7 space-y-1">
                                <div className="flex justify-between text-[11px] text-gold-muted tabular-nums">
                                  <span>
                                    {lp.doneThisRound
                                      ? "Round done"
                                      : lp.incomplete
                                        ? `${lp.treated}/${lp.total} plants`
                                        : lp.neverStarted
                                          ? `0/${vinesN || lp.total || "…"} plants`
                                          : `${lp.treated}/${lp.total} plants`}
                                  </span>
                                  <span
                                    className={
                                      lp.incomplete
                                        ? "text-amber-200 font-semibold"
                                        : lp.doneThisRound
                                          ? "text-emerald-300"
                                          : ""
                                    }
                                  >
                                    {lp.doneThisRound
                                      ? "complete"
                                      : lp.incomplete
                                        ? `${lp.remaining} left`
                                        : vinesN > 0
                                          ? `${vinesN} to do`
                                          : ""}
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      lp.doneThisRound
                                        ? "bg-emerald-400/80"
                                        : "bg-gradient-to-r from-amber-500/80 to-emerald-400/80"
                                    }`}
                                    style={{
                                      width: `${
                                        lp.doneThisRound
                                          ? 100
                                          : lp.total > 0
                                            ? Math.min(
                                                100,
                                                (lp.treated / lp.total) * 100
                                              )
                                            : 0
                                      }%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                            {(cropNote || line.tip) && (
                              <p className="text-[11px] text-sky-200/85 mt-1.5 pl-7 leading-relaxed">
                                {cropNote || line.tip}
                              </p>
                            )}
                            <p className="text-[11px] text-emerald-200/90 mt-1 pl-7 tabular-nums">
                              Put on plants: {rateHint}
                            </p>
                            <p className="text-[11px] text-gold-muted mt-0.5 pl-7">
                              Logging {fmtGramsTotal(grams)}
                              {fert
                                ? ` · stock ${fert.stock_qty} ${fert.unit}`
                                : " · not in inventory — import pack first"}
                              {fert && Number(fert.unit_price) > 0
                                ? ` · est. ${lineCostFromGrams(
                                    grams,
                                    fert.unit_price,
                                    fert.unit
                                  ).toLocaleString()}`
                                : " · set unit price for estimates"}
                              {short ? " · SHORT STOCK" : ""}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {applyLivePreview.rows.length > 0 && (
                    <div className="rounded-xl border border-emerald-400/35 bg-emerald-950/30 px-3 py-3 space-y-2">
                      <p className="text-[11px] uppercase tracking-wide text-emerald-200/85">
                        Live — put on plants / dissolve
                        {treatedN > 0
                          ? ` · ${treatedN.toLocaleString()} treated today`
                          : ""}
                        {isPartialApply ? ` of ${vinesN}` : ""}
                      </p>
                      {applyLivePreview.rows.map((r) => (
                        <p
                          key={r.name}
                          className="text-sm text-emerald-100/95 tabular-nums leading-snug"
                        >
                          <span className="text-gold-muted">{r.name}: </span>
                          {r.equation}
                          {r.hasPrice ? (
                            <span className="text-amber-200/90">
                              {" "}
                              → est.{" "}
                              <Money value={r.cost} />
                            </span>
                          ) : (
                            <span className="text-gold-muted">
                              {" "}
                              → price not set
                            </span>
                          )}
                        </p>
                      ))}
                      <p className="text-base font-semibold text-emerald-200 tabular-nums pt-1 border-t border-emerald-400/20">
                        Total to apply: {fmtGramsTotal(applyLivePreview.totalGrams)}
                        {applyLivePreview.totalCost > 0 ? (
                          <>
                            {" "}
                            · est. value{" "}
                            <Money value={applyLivePreview.totalCost} />
                            <span className="block text-xs font-normal text-gold-muted mt-1">
                              Display only — apply updates stock, not the expense
                              list (purchases are logged when you buy).
                            </span>
                          </>
                        ) : applyLivePreview.unpriced > 0 ? (
                          <span className="text-sm font-normal text-gold-muted">
                            {" "}
                            · set prices on Inventory to see estimates
                          </span>
                        ) : null}
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    className={`glass-btn gold-btn w-full ${
                      saving || !applyCrop || !isAdmin ? "opacity-50" : ""
                    }`}
                    disabled={
                      saving ||
                      !applyCrop ||
                      !isAdmin ||
                      activeRescueWeek.lines.length === 0
                    }
                  >
                    {saving
                      ? "Logging…"
                      : !isAdmin
                        ? "Observe — view only"
                        : pepperMixturesActive
                        ? extraRound
                          ? "Log Extra round & update stock"
                          : "Log Mixtures & update stock"
                        : `Log ${weekScheduleButtonLabel(activeRescueWeek)} & update stock`}
                  </button>
                  </>
                  )}
                </form>
              </section>

              <section className="glass-card space-y-4">
                <div>
                  <p className="eyebrow">From plant count</p>
                  <h2 className="font-display text-xl text-gold">
                    How much each week
                  </h2>
                  <p className="text-sm text-gold-muted mt-2 leading-relaxed">
                    {applyCrop ? (
                      <>
                        For <span className="text-gold">{applyCrop}</span>
                        {vinesN > 0 ? (
                          <>
                            :{" "}
                            <span className="text-emerald-300 tabular-nums">
                              {vinesN.toLocaleString()} plants
                            </span>
                            {applyCropMeta &&
                            applyCropMeta.plant_count > 0 &&
                            applyCropMeta.plant_count === vinesN
                              ? " (from crop plant count)"
                              : applyCropMeta && applyCropMeta.plant_count > 0
                                ? ` (crop has ${applyCropMeta.plant_count}; override above)`
                                : " (vine count above)"}
                            . Each line = per-plant (or per-tank) rate × that
                            count.
                          </>
                        ) : (
                          <> — set vines / plant count above to see totals.</>
                        )}
                      </>
                    ) : (
                      <>Select a crop to see that crop&apos;s week totals.</>
                    )}
                  </p>
                </div>

                {!applyCrop ? (
                  <p className="text-amber-200/90 text-sm rounded-lg border border-amber-400/30 bg-amber-950/20 px-3 py-4 text-center">
                    Select a crop — no rates or totals are shown until then.
                  </p>
                ) : vinesN <= 0 ? (
                  <p className="text-amber-200/90 text-sm rounded-lg border border-amber-400/30 bg-amber-950/20 px-3 py-2">
                    Set vines / plant count to see week totals.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[55vh] overflow-y-auto custom-scroll pr-1">
                    {scheduleNeedsWithCost.map((block) => {
                      const selected = applyWeek === block.week;
                      return (
                        <button
                          key={block.week}
                          type="button"
                          onClick={() => {
                            play("click");
                            setApplyWeek(block.week);
                            const weekDef = rateWeeks.find(
                              (w) => w.week === block.week
                            );
                            if (!isPepperMixturesWeek(weekDef))
                              setExtraRound(false);
                          }}
                          className={`w-full text-left rounded-xl border px-3 py-2.5 transition ${
                            selected
                              ? "border-emerald-400/45 bg-emerald-950/30"
                              : "border-white/10 bg-black/20 hover:border-[var(--glass-border)]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <p className="font-medium text-gold text-sm">
                              {weekScheduleButtonLabel({
                                week: block.week,
                                title: block.title,
                                summary: "",
                                lines: [],
                              })}
                              <span className="text-gold-muted font-normal">
                                {" "}
                                —{" "}
                                {block.title
                                  .replace(/^Phase \d+\s*[—–-]\s*/i, "")
                                  .replace(/^Week \d+\s*[—–-]\s*/i, "")}
                              </span>
                            </p>
                            {selected && (
                              <span className="text-[10px] uppercase tracking-wide text-emerald-300">
                                selected
                              </span>
                            )}
                          </div>
                          {block.note && (
                            <p className="text-[11px] text-gold-muted mb-1.5 leading-snug">
                              {block.note}
                            </p>
                          )}
                          {block.lines.length === 0 ? (
                            <p className="text-xs text-gold-muted">
                              No bag mix this week
                            </p>
                          ) : (
                            <ul className="space-y-1">
                              {block.lines.map((line) => (
                                <li
                                  key={line.fertilizerName}
                                  className="text-xs tabular-nums leading-snug"
                                >
                                  <span className="text-gold-muted">
                                    {line.fertilizerName}
                                    {line.optional ? " (opt)" : ""}:{" "}
                                  </span>
                                  <span className="text-emerald-200/95">
                                    {fmtScaledDose(
                                      line.perUnit,
                                      line.unitSuffix,
                                      line.count,
                                      line.countLabel
                                    )}
                                  </span>
                                  {line.hasPrice && line.estCost > 0 ? (
                                    <span className="text-amber-200/90">
                                      {" "}
                                      · <Money value={line.estCost} />
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                          {block.weekCost > 0 && (
                            <p className="text-xs text-amber-200/90 mt-1.5 tabular-nums">
                              Week total est. <Money value={Number(block.weekCost.toFixed(2))} />
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="border-t border-white/10 pt-3">
                  <p className="eyebrow mb-2">Live stock</p>
                  {fertilizers.length === 0 ? (
                    <p className="text-gold-muted text-sm">
                      Import your purchase pack to start tracking.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-[28vh] overflow-y-auto custom-scroll">
                      {fertilizers.map((f) => (
                        <div
                          key={f.id}
                          className="flex justify-between gap-3 text-sm border-b border-white/10 py-1.5"
                        >
                          <span className="text-gold truncate">{f.name}</span>
                          <span
                            className={
                              f.stock_qty <= 0
                                ? "text-red-300"
                                : "text-emerald-300"
                            }
                          >
                            {f.stock_qty} {f.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {tab === "inventory" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
              <section className="glass-card gold-sheen">
                <p className="eyebrow">Catalog</p>
                <h2 className="font-display text-xl text-gold mb-4">
                  {isAdmin
                    ? editId
                      ? "Edit fertilizer"
                      : "Add fertilizer"
                    : "Product catalog"}
                </h2>
                {isAdmin && (
                  <div className="flex flex-wrap gap-2 mb-4 items-center">
                    <button
                      type="button"
                      className="glass-btn gold-btn text-sm"
                      disabled={saving}
                      onClick={() => void importPurchasePack("add")}
                      title="Adds purchase pack quantities onto current stock; updates unit prices"
                    >
                      Add purchases to stock
                    </button>
                    <button
                      type="button"
                      className="glass-btn text-sm"
                      disabled={saving}
                      onClick={() => void importPurchasePack("set")}
                      title="Admin only: replace stock with pack quantities"
                    >
                      Reset stock to pack
                    </button>
                  </div>
                )}
                <p className="text-xs text-gold-muted mb-4 leading-relaxed">
                  Sync adds purchase-pack quantities to current inventory (does
                  not replace stock).
                  {!isAdmin &&
                    " Admins use Add purchases to stock / Reset stock to pack."}
                </p>
                {isAdmin ? (
                  <form onSubmit={saveFertilizer} className="space-y-3">
                    <label className="block">
                      <span className="eyebrow mb-1 block">Name</span>
                      <input
                        className="glass-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. NPK 15-15-15"
                        required
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="eyebrow mb-1 block">Unit</span>
                        <input
                          className="glass-input"
                          value={unit}
                          onChange={(e) => setUnit(e.target.value)}
                          placeholder="kg / g / L"
                          required
                        />
                      </label>
                      <label className="block">
                        <span className="eyebrow mb-1 block">Stock qty</span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="glass-input"
                          value={stockQty}
                          onChange={(e) => setStockQty(e.target.value)}
                          required
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="eyebrow mb-1 block">Unit price</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="glass-input"
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(e.target.value)}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="eyebrow mb-1 block">Notes</span>
                      <textarea
                        className="glass-input min-h-[72px] resize-y"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        className={`glass-btn gold-btn ${saving ? "opacity-50" : ""}`}
                        disabled={saving}
                      >
                        {saving ? "Saving…" : editId ? "Update" : "Add"}
                      </button>
                      {editId && (
                        <button
                          type="button"
                          className="glass-btn"
                          onClick={() => {
                            play("click");
                            resetFertForm();
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                ) : fertilizers.length === 0 ? (
                  <p className="text-gold-muted text-sm">
                    No catalog products yet. Stock list appears on the right when
                    products are added.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-[40vh] overflow-y-auto custom-scroll">
                    {fertilizers.map((f) => (
                      <div
                        key={f.id}
                        className="flex justify-between gap-3 text-sm border-b border-white/10 py-1.5"
                      >
                        <span className="text-gold truncate">{f.name}</span>
                        <span className="text-gold-muted whitespace-nowrap">
                          {f.unit}
                          {f.notes ? ` · ${f.notes}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="glass-card gold-sheen space-y-3">
                <div>
                  <p className="eyebrow">Purchases</p>
                  <h2 className="font-display text-xl text-gold">
                    {isAdmin ? "Edit purchase pack" : "Purchase pack"}
                  </h2>
                  <p className="text-sm text-gold-muted mt-2 leading-relaxed">
                    {isAdmin ? (
                      <>
                        Enter this purchase’s qty (kg) and unit price (/kg). Save
                        the pack, then use{" "}
                        <strong>Add purchases to stock</strong> — that adds these
                        quantities to current inventory and updates prices (does
                        not replace stock).
                      </>
                    ) : (
                      <>
                        Read-only view of the saved purchase pack. Admins save
                        the pack, then use{" "}
                        <strong>Add purchases to stock</strong> to add these
                        quantities to inventory (does not replace stock).
                      </>
                    )}
                  </p>
                </div>
                <div className="space-y-3 max-h-[50vh] overflow-y-auto custom-scroll pr-1">
                  {purchasePack.length === 0 ? (
                    <p className="text-gold-muted text-sm">
                      No purchase pack products saved yet.
                    </p>
                  ) : (
                    purchasePack.map((row, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-[var(--glass-border)] bg-black/20 p-3 space-y-2"
                      >
                        <div className="flex flex-wrap gap-2 items-start">
                          <label className="block flex-1 min-w-[140px]">
                            <span className="eyebrow mb-1 block">Product</span>
                            <input
                              className="glass-input"
                              value={row.name}
                              readOnly={!isAdmin}
                              disabled={!isAdmin}
                              onChange={(e) =>
                                setPurchasePack((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? { ...r, name: e.target.value }
                                      : r
                                  )
                                )
                              }
                            />
                          </label>
                          {isAdmin && (
                            <button
                              type="button"
                              className="glass-btn text-xs text-red-300 mt-5"
                              onClick={() => {
                                play("click");
                                setPurchasePack((prev) =>
                                  prev.filter((_, i) => i !== idx)
                                );
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <label className="block">
                            <span className="eyebrow mb-1 block">Qty</span>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              className="glass-input"
                              value={row.stock_qty}
                              readOnly={!isAdmin}
                              disabled={!isAdmin}
                              onChange={(e) =>
                                setPurchasePack((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? { ...r, stock_qty: e.target.value }
                                      : r
                                  )
                                )
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="eyebrow mb-1 block">Unit</span>
                            <input
                              className="glass-input"
                              value={row.unit}
                              readOnly={!isAdmin}
                              disabled={!isAdmin}
                              onChange={(e) =>
                                setPurchasePack((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? { ...r, unit: e.target.value }
                                      : r
                                  )
                                )
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="eyebrow mb-1 block">
                              Price / unit
                            </span>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              className="glass-input"
                              value={row.unit_price}
                              readOnly={!isAdmin}
                              disabled={!isAdmin}
                              onChange={(e) =>
                                setPurchasePack((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? { ...r, unit_price: e.target.value }
                                      : r
                                  )
                                )
                              }
                            />
                          </label>
                        </div>
                        <label className="block">
                          <span className="eyebrow mb-1 block">Notes</span>
                          <input
                            className="glass-input"
                            value={row.notes}
                            readOnly={!isAdmin}
                            disabled={!isAdmin}
                            onChange={(e) =>
                              setPurchasePack((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? { ...r, notes: e.target.value }
                                    : r
                                )
                              )
                            }
                          />
                        </label>
                      </div>
                    ))
                  )}
                </div>
                {isAdmin && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="glass-btn"
                      onClick={() => {
                        play("click");
                        setPurchasePack((prev) => [
                          ...prev,
                          {
                            name: "",
                            unit: "kg",
                            stock_qty: "0",
                            unit_price: "0",
                            notes: "",
                          },
                        ]);
                      }}
                    >
                      + Product
                    </button>
                    <button
                      type="button"
                      className={`glass-btn gold-btn ${
                        purchasePackSaving ? "opacity-50" : ""
                      }`}
                      disabled={purchasePackSaving}
                      onClick={() => void savePurchasePack()}
                    >
                      {purchasePackSaving ? "Saving…" : "Save purchase pack"}
                    </button>
                    <button
                      type="button"
                      className="glass-btn gold-btn"
                      disabled={saving || purchasePackSaving}
                      onClick={() => void importPurchasePack("add")}
                      title="Adds purchase pack quantities onto current stock; updates unit prices"
                    >
                      Add purchases to stock
                    </button>
                    <button
                      type="button"
                      className="glass-btn text-sm"
                      disabled={saving || purchasePackSaving}
                      onClick={() => void importPurchasePack("set")}
                      title="Admin only: replace stock with pack quantities"
                    >
                      Reset stock to pack
                    </button>
                  </div>
                )}
                <p className="text-xs text-gold-muted leading-relaxed">
                  Sync adds these quantities to current inventory (does not
                  replace stock).
                </p>
              </section>
              </div>

              <section className="glass-card">
                <p className="eyebrow">Stock & prices</p>
                <h2 className="font-display text-xl text-gold mb-4">
                  Inventory
                </h2>
                {fertilizers.length === 0 ? (
                  <p className="text-gold-muted text-sm">
                    {isAdmin
                      ? "No fertilizers yet. Add your first product."
                      : "No fertilizers in stock yet."}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {fertilizers.map((f) => (
                      <li
                        key={f.id}
                        className="rounded-xl border border-[var(--glass-border)] bg-black/20 p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-gold">{f.name}</p>
                            <p className="text-sm text-gold-muted mt-1">
                              Stock{" "}
                              <span
                                className={
                                  f.stock_qty <= 0
                                    ? "text-red-300"
                                    : "text-emerald-300"
                                }
                              >
                                {f.stock_qty}
                              </span>{" "}
                              {f.unit} ·{" "}
                              <span className="text-white/90">
                                <Money value={f.unit_price} /> / {f.unit}
                              </span>
                            </p>
                            {f.notes && (
                              <p className="text-xs text-gold-muted mt-1">
                                {f.notes}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {isAdmin && (
                              <>
                                <button
                                  type="button"
                                  className="glass-btn text-xs"
                                  onClick={() => startEdit(f)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="glass-btn text-xs"
                                  onClick={() => {
                                    play("click");
                                    setRestockId(f.id);
                                    setRestockAmount("");
                                  }}
                                >
                                  Restock
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              className="glass-btn text-xs"
                              onClick={() => void showPriceHistory(f.id)}
                            >
                              Prices
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                className="glass-btn text-xs text-red-300"
                                onClick={() => {
                                  play("click");
                                  setConfirmDeleteFert(f.id);
                                }}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                        {restockId === f.id && (
                          <div className="mt-3 flex flex-wrap items-end gap-2">
                            <label className="block flex-1 min-w-[120px]">
                              <span className="eyebrow mb-1 block">
                                Add amount ({f.unit})
                              </span>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                className="glass-input"
                                value={restockAmount}
                                onChange={(e) =>
                                  setRestockAmount(e.target.value)
                                }
                              />
                            </label>
                            <button
                              type="button"
                              className="glass-btn gold-btn"
                              onClick={() => void doRestock()}
                              disabled={saving}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="glass-btn"
                              onClick={() => setRestockId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {historyFor === f.id && (
                          <div className="mt-3 text-xs text-gold-muted">
                            <p className="eyebrow mb-1">Price history</p>
                            {priceHistory.length === 0 ? (
                              <p>No price history yet.</p>
                            ) : (
                              <ul className="space-y-1">
                                {priceHistory.map((p) => (
                                  <li key={p.id}>
                                    <Money value={p.price} /> —{" "}
                                    {fmtDate(String(p.recorded_at))}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {tab === "schedules" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="glass-card gold-sheen space-y-4">
                <div>
                  <p className="eyebrow">Timetable</p>
                  <h2 className="font-display text-xl text-gold">
                    Crop schedules
                  </h2>
                  <p className="text-sm text-gold-muted mt-2">
                    Editable calendar for the selected crop only — not shared
                    with other crops. Apply week still handles stock; this tab
                    is the crop&apos;s step timetable.
                  </p>
                </div>

                <label className="block">
                  <span className="eyebrow mb-1 block">Crop</span>
                  <select
                    className="glass-input"
                    value={selectedCrop}
                    onChange={(e) => onCropChange(e.target.value)}
                  >
                    <option value="">Select crop…</option>
                    {crops.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                {!selectedCrop ? (
                  <div className="rounded-xl border border-amber-400/35 bg-amber-950/25 px-4 py-6 text-center space-y-2">
                    <p className="font-display text-lg text-gold">
                      Select a crop
                    </p>
                    <p className="text-sm text-gold-muted leading-relaxed">
                      Pick a crop to view or create that crop&apos;s own
                      schedule set (pepper, turmeric, etc. stay separate).
                    </p>
                  </div>
                ) : (
                  <>
                    {isAdmin && (
                      <div className="flex flex-wrap gap-2">
                        {isTurmericCropName(selectedCrop) ? (
                          <>
                            <button
                              type="button"
                              className="glass-btn gold-btn"
                              disabled={saving}
                              onClick={() =>
                                void seedCropSchedule("turmeric_premium")
                              }
                            >
                              Seed premium Phase 1–5
                            </button>
                            <button
                              type="button"
                              className="glass-btn"
                              disabled={saving}
                              onClick={() =>
                                void seedCropSchedule("turmeric_chemical")
                              }
                            >
                              Seed chemical Urea/TSP/MOP
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="glass-btn gold-btn"
                            disabled={saving}
                            onClick={() => void seedCropSchedule("pepper")}
                          >
                            Seed pepper rescue weeks
                          </button>
                        )}
                        <button
                          type="button"
                          className="glass-btn"
                          disabled={saving}
                          onClick={() => void seedCropSchedule("from_rates")}
                          title="Copy this crop’s current Apply-week / Edit rates plan into a timetable"
                        >
                          Seed from Apply-week plan
                        </button>
                        <button
                          type="button"
                          className="glass-btn"
                          onClick={startNewSchedule}
                        >
                          New blank schedule
                        </button>
                      </div>
                    )}

                    <p className="text-xs text-gold-muted leading-relaxed">
                      {isTurmericCropName(selectedCrop)
                        ? "Turmeric seed options create a timetable for this crop only (premium phases or chemical stages). "
                        : "Pepper seed creates the Mixtures + Week 1–4 rescue timetable for this crop only. "}
                      You can keep several schedules per crop and delete ones
                      you do not need. Day-to-day stock still uses{" "}
                      <strong>Apply week</strong>.
                    </p>

                    {cropSchedules.length > 0 ? (
                      <div className="space-y-3">
                        {workingSchedule && (
                          <div className="rounded-xl border border-emerald-400/45 bg-emerald-950/30 px-3 py-3">
                            <p className="text-[10px] uppercase tracking-wider text-emerald-300/90 mb-1">
                              Currently working schedule
                            </p>
                            <p className="font-display text-lg text-gold">
                              {workingSchedule.name}
                            </p>
                            <p className="text-xs text-gold-muted mt-1">
                              {workingSchedule.steps.length} step
                              {workingSchedule.steps.length === 1 ? "" : "s"} ·{" "}
                              {selectedCrop}
                            </p>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="eyebrow">
                            Schedules for {selectedCrop} only
                          </p>
                          {isAdmin && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="glass-btn text-xs"
                                onClick={() => {
                                  play("click");
                                  if (
                                    selectedSchedIds.length ===
                                    cropSchedules.length
                                  ) {
                                    setSelectedSchedIds([]);
                                  } else {
                                    setSelectedSchedIds(
                                      cropSchedules.map((s) => s.id)
                                    );
                                  }
                                }}
                              >
                                {selectedSchedIds.length ===
                                cropSchedules.length
                                  ? "Clear selection"
                                  : "Select all"}
                              </button>
                              <button
                                type="button"
                                className="glass-btn text-xs text-red-300"
                                disabled={
                                  saving || selectedSchedIds.length === 0
                                }
                                onClick={() => {
                                  play("click");
                                  setConfirmBulkDeleteSched(true);
                                }}
                              >
                                Delete selected ({selectedSchedIds.length})
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          {cropSchedules.map((s) => (
                            <div
                              key={s.id}
                              className={`flex items-stretch gap-2 rounded-xl border p-1 ${
                                s.is_working
                                  ? "border-emerald-400/50 bg-emerald-950/25 ring-1 ring-emerald-400/30"
                                  : activeScheduleId === s.id
                                    ? "border-[var(--gold)]/40 bg-[var(--gold)]/10"
                                    : "border-[var(--glass-border)] bg-black/20"
                              }`}
                            >
                              {isAdmin && (
                                <label className="flex items-center pl-2 shrink-0">
                                  <input
                                    type="checkbox"
                                    className="accent-[var(--gold)]"
                                    checked={selectedSchedIds.includes(s.id)}
                                    onChange={(e) => {
                                      setSelectedSchedIds((prev) =>
                                        e.target.checked
                                          ? [...prev, s.id]
                                          : prev.filter((id) => id !== s.id)
                                      );
                                    }}
                                  />
                                </label>
                              )}
                              <button
                                type="button"
                                className="flex-1 text-left glass-btn border-0 bg-transparent rounded-xl py-2"
                                onClick={() => {
                                  play("click");
                                  setActiveScheduleId(s.id);
                                  fillScheduleForm(s);
                                }}
                              >
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-gold">
                                    {s.name}
                                  </span>
                                  {s.is_working && (
                                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-200 border border-emerald-400/40">
                                      Currently working
                                    </span>
                                  )}
                                </span>
                                <span className="text-xs text-gold-muted block mt-0.5">
                                  {s.steps.length} step
                                  {s.steps.length === 1 ? "" : "s"}
                                  {s.crop_name ? ` · ${s.crop_name}` : ""}
                                </span>
                              </button>
                              {isAdmin && (
                                <div className="flex flex-col gap-1 self-center pr-2 shrink-0">
                                  {!s.is_working && (
                                    <button
                                      type="button"
                                      className="glass-btn text-xs gold-btn"
                                      disabled={saving}
                                      title="Set as currently working schedule"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        void applyWorkingSchedule(s.id);
                                      }}
                                    >
                                      Apply
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="glass-btn text-xs text-red-300"
                                    disabled={saving}
                                    title={`Delete “${s.name}”`}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      play("click");
                                      setConfirmDeleteSched(s.id);
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-gold-muted text-sm">
                        No schedules for {selectedCrop} yet
                        {isAdmin
                          ? " — seed a crop-matched plan or create a blank one."
                          : "."}
                      </p>
                    )}
                  </>
                )}
              </section>

              <section className="glass-card">
                <p className="eyebrow">Editor</p>
                <h2 className="font-display text-xl text-gold mb-4">
                  {activeScheduleId
                    ? isAdmin
                      ? "Edit schedule"
                      : "Schedule details"
                    : "Schedule details"}
                </h2>

                {!selectedCrop ? (
                  <p className="text-gold-muted text-sm">
                    Select a crop to view its schedules.
                  </p>
                ) : schedSteps.length === 0 && !schedName ? (
                  <p className="text-gold-muted text-sm">
                    {isAdmin
                      ? "Select a schedule above, or seed a plan matched to this crop / start a blank schedule."
                      : "Select a schedule above to view steps."}
                  </p>
                ) : (
                  <form onSubmit={saveScheduleForm} className="space-y-3">
                    <label className="block">
                      <span className="eyebrow mb-1 block">Name</span>
                      <input
                        className="glass-input"
                        value={schedName}
                        onChange={(e) => setSchedName(e.target.value)}
                        required
                        readOnly={!isAdmin}
                        disabled={!isAdmin}
                      />
                    </label>
                    <label className="block">
                      <span className="eyebrow mb-1 block">Description</span>
                      <textarea
                        className="glass-input min-h-[80px] resize-y"
                        value={schedDesc}
                        onChange={(e) => setSchedDesc(e.target.value)}
                        readOnly={!isAdmin}
                        disabled={!isAdmin}
                      />
                    </label>

                    <div className="space-y-3">
                      {schedSteps.map((step, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-[var(--glass-border)] bg-black/20 p-3 space-y-2"
                        >
                          <div className="flex justify-between items-center gap-2">
                            <p className="text-sm text-gold">
                              Step {idx + 1}
                              {step.week_number != null
                                ? ` · Week ${step.week_number}`
                                : ""}
                            </p>
                            {isAdmin && (
                              <button
                                type="button"
                                className="glass-btn text-xs text-red-300"
                                onClick={() => removeStepRow(idx)}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                              <span className="eyebrow mb-1 block">Week #</span>
                              <input
                                type="number"
                                className="glass-input"
                                value={step.week_number ?? ""}
                                onChange={(e) =>
                                  updateStep(idx, {
                                    week_number: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  })
                                }
                                disabled={!isAdmin}
                              />
                            </label>
                            <label className="block">
                              <span className="eyebrow mb-1 block">
                                Interval (days)
                              </span>
                              <input
                                type="number"
                                className="glass-input"
                                value={step.interval_days ?? ""}
                                onChange={(e) =>
                                  updateStep(idx, {
                                    interval_days: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  })
                                }
                                disabled={!isAdmin}
                              />
                            </label>
                          </div>
                          <label className="block">
                            <span className="eyebrow mb-1 block">Title</span>
                            <input
                              className="glass-input"
                              value={step.title}
                              onChange={(e) =>
                                updateStep(idx, { title: e.target.value })
                              }
                              required
                              disabled={!isAdmin}
                            />
                          </label>
                          <label className="block">
                            <span className="eyebrow mb-1 block">
                              Instructions
                            </span>
                            <textarea
                              className="glass-input min-h-[64px] resize-y"
                              value={step.instructions || ""}
                              onChange={(e) =>
                                updateStep(idx, {
                                  instructions: e.target.value,
                                })
                              }
                              disabled={!isAdmin}
                            />
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            <label className="block col-span-1">
                              <span className="eyebrow mb-1 block">Amount</span>
                              <input
                                type="number"
                                step="any"
                                className="glass-input"
                                value={step.suggested_amount ?? ""}
                                onChange={(e) =>
                                  updateStep(idx, {
                                    suggested_amount: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  })
                                }
                                disabled={!isAdmin}
                              />
                            </label>
                            <label className="block">
                              <span className="eyebrow mb-1 block">Unit</span>
                              <input
                                className="glass-input"
                                value={step.unit || ""}
                                onChange={(e) =>
                                  updateStep(idx, { unit: e.target.value })
                                }
                                disabled={!isAdmin}
                              />
                            </label>
                            <label className="block">
                              <span className="eyebrow mb-1 block">
                                Fertilizer
                              </span>
                              <select
                                className="glass-input"
                                value={step.suggested_fertilizer_id ?? ""}
                                onChange={(e) =>
                                  updateStep(idx, {
                                    suggested_fertilizer_id: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  })
                                }
                                disabled={!isAdmin}
                              >
                                <option value="">—</option>
                                {fertilizers.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>

                    {isAdmin && (
                      <div className="flex flex-wrap gap-2 items-center">
                        <button
                          type="button"
                          className="glass-btn"
                          onClick={addStepRow}
                        >
                          + Step
                        </button>
                        <label className="flex items-center gap-2 text-sm text-gold-muted px-1">
                          <input
                            type="checkbox"
                            className="accent-[var(--gold)]"
                            checked={saveAndApply}
                            onChange={(e) => setSaveAndApply(e.target.checked)}
                          />
                          Apply as currently working when saving
                        </label>
                        <button
                          type="submit"
                          className={`glass-btn gold-btn ${saving ? "opacity-50" : ""}`}
                          disabled={saving}
                        >
                          {saving
                            ? "Saving…"
                            : saveAndApply
                              ? "Save & apply"
                              : "Save schedule"}
                        </button>
                        {activeScheduleId &&
                          selectedCrop &&
                          !activeSchedule?.is_working && (
                            <button
                              type="button"
                              className="glass-btn"
                              disabled={saving}
                              onClick={() =>
                                void applyWorkingSchedule(activeScheduleId)
                              }
                            >
                              Apply as working
                            </button>
                          )}
                        {activeScheduleId && (
                          <button
                            type="button"
                            className="glass-btn text-red-300"
                            onClick={() => {
                              play("click");
                              setConfirmDeleteSched(activeScheduleId);
                            }}
                          >
                            Delete schedule
                          </button>
                        )}
                      </div>
                    )}
                  </form>
                )}
              </section>
            </div>
          )}

          {tab === "usage" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {isAdmin && (
              <section className="glass-card gold-sheen">
                <p className="eyebrow">Apply</p>
                <h2 className="font-display text-xl text-gold mb-4">
                  Log usage
                </h2>
                <form onSubmit={logUsage} className="space-y-3">
                  <label className="block">
                    <span className="eyebrow mb-1 block">Crop</span>
                    <select
                      className="glass-input"
                      value={useCrop}
                      onChange={(e) => {
                        setUseCrop(e.target.value);
                        onCropChange(e.target.value);
                      }}
                      required
                    >
                      <option value="">Select crop…</option>
                      {crops.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="eyebrow mb-1 block">Fertilizer</span>
                    <select
                      className="glass-input"
                      value={useFertId}
                      onChange={(e) => {
                        setUseFertId(e.target.value);
                        const f = fertilizers.find(
                          (x) => x.id === Number(e.target.value)
                        );
                        if (f) setUseUnit(f.unit);
                      }}
                      required
                    >
                      <option value="">Select…</option>
                      {fertilizers.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.stock_qty} {f.unit})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="eyebrow mb-1 block">Amount</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="glass-input"
                        value={useAmount}
                        onChange={(e) => setUseAmount(e.target.value)}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="eyebrow mb-1 block">Unit</span>
                      <input
                        className="glass-input"
                        value={useUnit}
                        onChange={(e) => setUseUnit(e.target.value)}
                        required
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="eyebrow mb-1 block">Date</span>
                    <input
                      type="date"
                      className="glass-input"
                      value={useDate}
                      onChange={(e) => setUseDate(e.target.value)}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="eyebrow mb-1 block">
                      Schedule step (optional)
                    </span>
                    <select
                      className="glass-input"
                      value={useStepId}
                      onChange={(e) => setUseStepId(e.target.value)}
                    >
                      <option value="">—</option>
                      {stepOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="eyebrow mb-1 block">Notes</span>
                    <textarea
                      className="glass-input min-h-[72px] resize-y"
                      value={useNotes}
                      onChange={(e) => setUseNotes(e.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    className={`glass-btn gold-btn ${saving ? "opacity-50" : ""}`}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Log & deduct stock"}
                  </button>
                </form>
              </section>
              )}

              <section className="glass-card">
                <p className="eyebrow">History</p>
                <h2 className="font-display text-xl text-gold mb-4">
                  Applications
                  {selectedCrop ? ` · ${selectedCrop}` : ""}
                </h2>
                {applications.length === 0 ? (
                  <p className="text-gold-muted text-sm">No usage logged yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gold-muted border-b border-[var(--glass-border)]">
                          <th className="py-2 pr-2 font-normal">Date</th>
                          <th className="py-2 pr-2 font-normal">Crop</th>
                          <th className="py-2 pr-2 font-normal">Product</th>
                          <th className="py-2 pr-2 font-normal">Amount</th>
                          <th className="py-2 font-normal" />
                        </tr>
                      </thead>
                      <tbody>
                        {applications.map((a) => (
                          <tr
                            key={a.id}
                            className="border-b border-[var(--glass-border)]/50"
                          >
                            <td className="py-2 pr-2 whitespace-nowrap">
                              {fmtDate(String(a.applied_at))}
                            </td>
                            <td className="py-2 pr-2">{a.crop_name}</td>
                            <td className="py-2 pr-2">
                              {a.fertilizer_name || `#${a.fertilizer_id}`}
                              {a.notes && (
                                <span className="block text-xs text-gold-muted">
                                  {a.notes}
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-2 whitespace-nowrap">
                              {a.amount} {a.unit}
                            </td>
                            <td className="py-2 text-right">
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="glass-btn text-xs text-red-300"
                                  onClick={() => {
                                    play("click");
                                    setConfirmDeleteApp(a.id);
                                  }}
                                >
                                  Undo
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === "rates" && isAdmin && (
            <section className="glass-card gold-sheen space-y-5 max-w-3xl">
              <div>
                <p className="eyebrow">Admin</p>
                <h2 className="font-display text-xl text-gold">
                  Edit fertilizer rates
                </h2>
                <p className="text-sm text-gold-muted mt-2 leading-relaxed">
                  Rates are specific to one crop (not shared). Inventory stock
                  stays shared. Apply week and past-due todos use this crop&apos;s
                  values. Interval days drive missed-apply reminders when plant
                  count &gt; 1. New crops auto-seed a template by name: turmeric /
                  කහ get the Extra-Premium Turmeric Plan (Phase 1–5) by default;
                  use Load premium plan / Load chemical schedule to switch.
                  Others get the pepper Mixtures + Week 1–4 rescue plan. Edit and
                  Save to customize.
                </p>
              </div>

              <label className="block max-w-xs">
                <span className="eyebrow mb-1 block">Crop</span>
                <select
                  className="glass-input"
                  value={selectedCrop}
                  onChange={(e) => {
                    const crop = e.target.value;
                    setSelectedCrop(crop);
                    if (crop) {
                      setApplyCrop(crop);
                      setSearchParams({ crop });
                    } else {
                      setSearchParams({});
                    }
                    play("click");
                  }}
                >
                  <option value="">Select crop…</option>
                  {crops.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              {!selectedCrop ? (
                <p className="text-sm text-amber-100/95 rounded-xl border border-amber-400/35 bg-amber-950/25 px-3 py-3">
                  Select a crop to view or edit its fertilizer rates.
                </p>
              ) : !ratesDraft ? (
                <p className="text-sm text-gold-muted">Loading rates…</p>
              ) : (
                <>
                  <label className="block max-w-xs">
                    <span className="eyebrow mb-1 block">
                      Dissolve volume (liters / tank)
                    </span>
                    <input
                      type="number"
                      min={1}
                      step="any"
                      className="glass-input"
                      value={editingRates.tankLiters}
                      onChange={(e) =>
                        setRatesDraft({
                          ...editingRates,
                          tankLiters: Number(e.target.value) || 10,
                        })
                      }
                    />
                  </label>

                  <div className="space-y-3">
                    {!ratesCropIsTurmeric && (
                      <>
                    <p className="eyebrow">
                      Pepper Fertilizer Mixtures (g / plant)
                    </p>
                    {(
                      Object.keys(PEPPER_MIXTURE.ageLabels) as PlantAge[]
                    ).map((age) => (
                      <div
                        key={age}
                        className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end"
                      >
                        <p className="text-sm text-gold-muted sm:col-span-1">
                          {PEPPER_MIXTURE.ageLabels[age]}
                        </p>
                        {(["first", "second"] as Monsoon[]).map((mon) => (
                          <label key={mon} className="block">
                            <span className="text-[11px] text-gold-muted">
                              {PEPPER_MIXTURE.monsoonLabels[mon]}
                            </span>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              className="glass-input mt-1"
                              value={editingRates.mixtureRates[age][mon]}
                              onChange={(e) =>
                                setRatesDraft({
                                  ...editingRates,
                                  mixtureRates: {
                                    ...editingRates.mixtureRates,
                                    [age]: {
                                      ...editingRates.mixtureRates[age],
                                      [mon]: Number(e.target.value) || 0,
                                    },
                                  },
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    ))}
                      </>
                    )}
                    {ratesCropIsTurmeric && (
                      <p className="text-sm text-gold-muted rounded-lg border border-emerald-400/25 bg-emerald-950/20 px-3 py-2">
                        {isTurmericChemicalRateConfig(editingRates)
                          ? "Turmeric Chemical schedule — Stage 1–3 (Urea / Superphosphate·TSP / MOP). No pepper monsoon mixtures table."
                          : "Turmeric Extra-Premium plan — Phase 1–5 below (no pepper monsoon mixtures table)."}
                      </p>
                    )}
                  </div>

                  {editingRates.weeks.map((w, wi) => (
                    <div
                      key={w.week}
                      className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3"
                    >
                      <div className="flex flex-wrap items-end gap-3 justify-between">
                        <div>
                          <p className="font-medium text-gold text-sm">
                            {weekScheduleButtonLabel(w)} — {w.title}
                          </p>
                        </div>
                        <label className="block w-36">
                          <span className="eyebrow mb-1 block">
                            Interval (days)
                          </span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="glass-input"
                            value={editingRates.intervals[String(w.week)] ?? ""}
                            onChange={(e) =>
                              setRatesDraft({
                                ...editingRates,
                                intervals: {
                                  ...editingRates.intervals,
                                  [String(w.week)]: Math.max(
                                    1,
                                    Math.floor(Number(e.target.value) || 1)
                                  ),
                                },
                              })
                            }
                          />
                        </label>
                      </div>
                      {w.lines.length === 0 ? (
                        <p className="text-xs text-gold-muted">
                          No bag products (checklist / disease week).
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {w.lines.map((line, li) => (
                            <div
                              key={`${w.week}-${line.fertilizerName}`}
                              className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end"
                            >
                              <p className="text-sm text-gold truncate">
                                {line.fertilizerName}
                                {line.optional ? " (opt)" : ""}
                                <span className="block text-[11px] text-gold-muted">
                                  {line.mode === "per_tank"
                                    ? `g / ${editingRates.tankLiters}L tank`
                                    : line.mode === "per_plant"
                                      ? "g / plant"
                                      : "g fixed"}
                                </span>
                              </p>
                              <label className="block sm:col-span-2">
                                <span className="eyebrow mb-1 block">
                                  Amount
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  className="glass-input"
                                  value={
                                    line.mode === "per_tank"
                                      ? line.gramsPerTank ?? 0
                                      : line.mode === "fixed"
                                        ? line.gramsFixed ?? 0
                                        : line.gramsPerPlant ?? 0
                                  }
                                  onChange={(e) => {
                                    const val = Number(e.target.value) || 0;
                                    const weeks = editingRates.weeks.map(
                                      (ww, wwi) => {
                                        if (wwi !== wi) return ww;
                                        const lines = ww.lines.map(
                                          (ll, lli) => {
                                            if (lli !== li) return ll;
                                            if (ll.mode === "per_tank") {
                                              return {
                                                ...ll,
                                                gramsPerTank: val,
                                              };
                                            }
                                            if (ll.mode === "fixed") {
                                              return {
                                                ...ll,
                                                gramsFixed: val,
                                              };
                                            }
                                            return {
                                              ...ll,
                                              gramsPerPlant: val,
                                            };
                                          }
                                        );
                                        return { ...ww, lines };
                                      }
                                    );
                                    setRatesDraft({ ...editingRates, weeks });
                                  }}
                                />
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="glass-btn gold-btn"
                      disabled={ratesSaving || !ratesDraft || !selectedCrop}
                      onClick={() => void saveRateConfig()}
                    >
                      {ratesSaving
                        ? "Saving…"
                        : `Save rates for ${selectedCrop}`}
                    </button>
                    <button
                      type="button"
                      className="glass-btn"
                      disabled={ratesSaving || !selectedCrop}
                      onClick={() => {
                        void loadRateConfig(selectedCrop).then((cfg) => {
                          if (cfg) setRatesDraft(structuredClone(cfg));
                        });
                        play("click");
                      }}
                    >
                      Reset draft to saved
                    </button>
                    {ratesCropIsTurmeric ? (
                      <>
                        <button
                          type="button"
                          className="glass-btn"
                          disabled={ratesSaving || !selectedCrop}
                          onClick={() => {
                            setConfirmTurmericTemplate("premium");
                            play("click");
                          }}
                        >
                          Load premium plan
                        </button>
                        <button
                          type="button"
                          className="glass-btn"
                          disabled={ratesSaving || !selectedCrop}
                          onClick={() => {
                            setConfirmTurmericTemplate("chemical");
                            play("click");
                          }}
                        >
                          Load chemical schedule
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="glass-btn"
                        disabled={ratesSaving || !selectedCrop}
                        onClick={() => {
                          setRatesDraft(
                            defaultFertilizerRateConfigForCrop(selectedCrop)
                          );
                          play("click");
                        }}
                      >
                        Load defaults
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}

      <ConfirmModal
        open={confirmDeleteFert != null}
        title="Delete fertilizer?"
        message="This removes the catalog item. Blocked if usage logs still reference it."
        confirmLabel="Delete"
        onCancel={() => setConfirmDeleteFert(null)}
        onConfirm={() => {
          if (confirmDeleteFert != null) void removeFertilizer(confirmDeleteFert);
        }}
      />
      <ConfirmModal
        open={confirmDeleteApp != null}
        title="Undo this usage?"
        message="Stock will be restored by the logged amount."
        confirmLabel="Undo"
        onCancel={() => setConfirmDeleteApp(null)}
        onConfirm={() => {
          if (confirmDeleteApp != null) void removeApplication(confirmDeleteApp);
        }}
      />
      <ConfirmModal
        open={confirmDeleteSched != null}
        title="Delete schedule?"
        message={
          confirmDeleteSched != null
            ? `Remove “${
                schedules.find((s) => s.id === confirmDeleteSched)?.name ||
                "this schedule"
              }” and all its steps for ${
                schedules.find((s) => s.id === confirmDeleteSched)?.crop_name ||
                selectedCrop ||
                "this crop"
              } only? This cannot be undone.`
            : "All timetable steps for this schedule will be removed."
        }
        confirmLabel="Delete"
        onCancel={() => setConfirmDeleteSched(null)}
        onConfirm={() => {
          if (confirmDeleteSched != null)
            void removeSchedule(confirmDeleteSched);
        }}
      />
      <ConfirmModal
        open={confirmBulkDeleteSched}
        title="Delete selected schedules?"
        message={`Permanently delete ${selectedSchedIds.length} schedule${
          selectedSchedIds.length === 1 ? "" : "s"
        } for ${selectedCrop || "this crop"}? This cannot be undone.`}
        confirmLabel="Delete all selected"
        onCancel={() => setConfirmBulkDeleteSched(false)}
        onConfirm={() => void removeSchedulesBulk(selectedSchedIds)}
      />
      <ConfirmModal
        open={confirmTurmericTemplate != null}
        title={
          confirmTurmericTemplate === "chemical"
            ? "Load chemical schedule?"
            : "Load premium plan?"
        }
        message={
          confirmTurmericTemplate === "chemical"
            ? `Replace the draft rates for ${selectedCrop || "this crop"} with the Urea / TSP / MOP three-stage chemical schedule? Unsaved edits will be lost. Save afterward to persist and seed chemical stage notes.`
            : `Replace the draft rates for ${selectedCrop || "this crop"} with the Extra-Premium Phase 1–5 plan? Unsaved edits will be lost. Save afterward to persist.`
        }
        confirmLabel="Load template"
        danger={false}
        onCancel={() => setConfirmTurmericTemplate(null)}
        onConfirm={() => {
          if (confirmTurmericTemplate === "chemical") {
            setRatesDraft(defaultTurmericChemicalFertilizerRateConfig());
          } else if (confirmTurmericTemplate === "premium") {
            setRatesDraft(defaultTurmericFertilizerRateConfig());
          }
          setConfirmTurmericTemplate(null);
          play("click");
        }}
      />

      {noteEditor &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="confirm-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fert-note-title"
            onClick={() => !noteSaving && setNoteEditor(null)}
          >
            <div
              className="confirm-panel glass-card animate-rise max-w-md w-[min(100%,28rem)]"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="fert-note-title" className="text-lg font-semibold text-gold">
                Why {noteEditor.fertilizerName}?
              </h2>
              <p className="text-xs text-gold-muted mt-1 leading-relaxed">
                Note for{" "}
                <span className="text-emerald-200">{applyCrop || "this crop"}</span>
                {" — "}
                why this fertilizer is used here (not shared with other crops).
              </p>
              <textarea
                className="glass-input mt-3 min-h-[120px] w-full text-sm"
                value={noteEditor.draft}
                readOnly={!isAdmin}
                disabled={noteSaving}
                placeholder="e.g. Raises soil pH and supplies Ca/Mg before monsoon feed…"
                onChange={(e) =>
                  setNoteEditor((prev) =>
                    prev ? { ...prev, draft: e.target.value } : prev
                  )
                }
              />
              <div className="flex flex-wrap gap-2 mt-4 justify-end">
                <button
                  type="button"
                  className="glass-btn"
                  disabled={noteSaving}
                  onClick={() => setNoteEditor(null)}
                >
                  {isAdmin ? "Cancel" : "Close"}
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    className="glass-btn gold-btn"
                    disabled={noteSaving || !applyCrop}
                    onClick={() => void saveFertilizerCropNote()}
                  >
                    {noteSaving ? "Saving…" : "Save note"}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
