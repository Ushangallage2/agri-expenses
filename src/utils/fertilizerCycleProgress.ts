/**
 * Plant-coverage progress for a fertilizer week (and optionally one product).
 * Matches tags written by Apply week: [week:N] [batch:…] [treated:N/M]
 */

export type CycleApp = {
  crop_name?: string | null;
  fertilizer_name?: string | null;
  applied_at?: string | null;
  notes?: string | null;
};

export type CycleStep = {
  treated: number;
  at: string;
  remainingAfter: number;
};

export type CycleProgress = {
  treated: number;
  total: number;
  remaining: number;
  intervalDays: number;
  cycleStartedAt: Date | null;
  cycleDueAt: Date | null;
  incomplete: boolean;
  /** Finished a full plant round and still inside the interval window. */
  doneThisRound: boolean;
  neverStarted: boolean;
  steps: CycleStep[];
  lastStepTreated: number;
};

function weekNotesMatch(
  notes: string,
  applyWeek: number,
  pepperMixturesWeek: boolean
): boolean {
  if (notes.includes(`[week:${applyWeek}]`)) return true;
  if (
    applyWeek > 0 &&
    (notes.includes(`Week ${applyWeek}`) || notes.includes(`Phase ${applyWeek}`))
  ) {
    return true;
  }
  if (
    pepperMixturesWeek &&
    /Pepper Fertilizer Mixtures|Extra round/i.test(notes)
  ) {
    return true;
  }
  return false;
}

export function computeCycleProgress(opts: {
  applications: CycleApp[];
  cropName: string;
  week: number;
  vinesTotal: number;
  intervalDays: number;
  pepperMixturesWeek?: boolean;
  /** When set, only count rows for this fertilizer product. */
  fertilizerName?: string | null;
}): CycleProgress {
  const {
    applications,
    cropName,
    week,
    vinesTotal,
    intervalDays,
    pepperMixturesWeek = false,
    fertilizerName = null,
  } = opts;

  const cropLc = cropName.toLowerCase();
  const fertLc = fertilizerName?.trim().toLowerCase() || null;
  const seen = new Set<string>();
  const batches: { treated: number; total: number; at: string }[] = [];

  for (const a of applications) {
    if (a.crop_name?.toLowerCase() !== cropLc) continue;
    if (fertLc) {
      const name = String(a.fertilizer_name || "").trim().toLowerCase();
      if (name !== fertLc) continue;
    }
    const notes = String(a.notes || "");
    if (!weekNotesMatch(notes, week, pepperMixturesWeek)) continue;
    const m = notes.match(/\[treated:(\d+)(?:\/(\d+))?\]/i);
    if (!m) continue;
    const batch = notes.match(/\[batch:([^\]]+)\]/i)?.[1]?.trim();
    const key = batch
      ? `batch:${batch}`
      : `legacy:${String(a.applied_at).slice(0, 19)}:${m[1]}:${m[2] || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    batches.push({
      at: String(a.applied_at),
      treated: Number(m[1]) || 0,
      total: Number(m[2]) || vinesTotal || 0,
    });
  }
  batches.sort((a, b) => a.at.localeCompare(b.at));

  let treated = 0;
  let total = vinesTotal;
  let cycleStartedAt: Date | null = null;
  let cycleDueAt: Date | null = null;
  let lastCompletedAt: Date | null = null;
  const steps: CycleStep[] = [];
  let lastStepTreated = 0;
  const dayMs = 24 * 60 * 60 * 1000;

  for (const b of batches) {
    const atDate = new Date(String(b.at).replace(" ", "T"));
    const validAt = Number.isNaN(atDate.getTime()) ? null : atDate;
    if (
      validAt &&
      cycleDueAt &&
      intervalDays > 0 &&
      validAt.getTime() > cycleDueAt.getTime() &&
      treated > 0 &&
      total > 0 &&
      treated < total
    ) {
      treated = 0;
      cycleStartedAt = null;
      cycleDueAt = null;
      steps.length = 0;
      lastStepTreated = 0;
    }
    if (validAt && !cycleStartedAt) {
      cycleStartedAt = validAt;
      cycleDueAt = new Date(validAt.getTime() + intervalDays * dayMs);
      steps.length = 0;
    }
    if (b.total > 0) total = b.total;
    treated += b.treated;
    lastStepTreated = b.treated;
    const remainingAfter = total > 0 ? Math.max(0, total - treated) : 0;
    steps.push({
      treated: b.treated,
      at: b.at,
      remainingAfter,
    });
    if (total > 0 && treated >= total) {
      lastCompletedAt = validAt || cycleStartedAt;
      treated = 0;
      cycleStartedAt = null;
      cycleDueAt = null;
      steps.length = 0;
      lastStepTreated = 0;
    }
  }

  if (
    cycleDueAt &&
    intervalDays > 0 &&
    treated > 0 &&
    total > 0 &&
    treated < total &&
    Date.now() > cycleDueAt.getTime()
  ) {
    treated = 0;
    cycleStartedAt = null;
    cycleDueAt = null;
    steps.length = 0;
    lastStepTreated = 0;
  }

  const remaining = total > 0 ? Math.max(0, total - treated) : 0;
  const doneThisRound =
    lastCompletedAt != null &&
    treated === 0 &&
    (intervalDays <= 0 ||
      Date.now() < lastCompletedAt.getTime() + intervalDays * dayMs);

  return {
    treated,
    total,
    remaining,
    intervalDays,
    cycleStartedAt,
    cycleDueAt,
    incomplete: treated > 0 && remaining > 0,
    doneThisRound,
    neverStarted: !doneThisRound && treated === 0,
    steps,
    lastStepTreated,
  };
}

export type WeekSeasonStatus = {
  week: number;
  isCurrent: boolean;
  complete: boolean;
  hasIncompleteLine: boolean;
  remainingPlants: number;
};

type WeekLike = {
  week: number;
  title?: string;
  lines: {
    fertilizerName: string;
    optional?: boolean;
    mode: string;
  }[];
};

/**
 * Which week the season is "on": first week with unfinished required products.
 */
export function computeSeasonWeekStatus(opts: {
  weeks: WeekLike[];
  applications: CycleApp[];
  cropName: string;
  vinesTotal: number;
  intervals: Record<string, number>;
  isPepperMixturesWeek: (w: WeekLike) => boolean;
}): WeekSeasonStatus[] {
  const {
    weeks,
    applications,
    cropName,
    vinesTotal,
    intervals,
    isPepperMixturesWeek,
  } = opts;

  const rows: WeekSeasonStatus[] = weeks.map((w) => {
    const pepper = isPepperMixturesWeek(w);
    const intervalDays = Number(intervals?.[String(w.week)]) || 0;
    const trackLines = w.lines.filter((l) => !l.optional);

    if (trackLines.length === 0) {
      return {
        week: w.week,
        isCurrent: false,
        complete: true,
        hasIncompleteLine: false,
        remainingPlants: 0,
      };
    }

    let hasIncompleteLine = false;
    let allDone = true;
    let remainingPlants = 0;

    for (const line of trackLines) {
      const p = computeCycleProgress({
        applications,
        cropName,
        week: w.week,
        vinesTotal,
        intervalDays,
        pepperMixturesWeek: pepper,
        fertilizerName: line.fertilizerName,
      });

      if (line.mode === "per_plant" || pepper) {
        if (p.incomplete) {
          hasIncompleteLine = true;
          allDone = false;
          remainingPlants += p.remaining;
        } else if (p.doneThisRound) {
          /* finished this interval */
        } else {
          allDone = false;
          remainingPlants += vinesTotal > 0 ? vinesTotal : 0;
        }
        continue;
      }

      // Foliar / fixed: done if any tagged apply exists and not mid plant-round
      const anyApp = applications.some((a) => {
        if (a.crop_name?.toLowerCase() !== cropName.toLowerCase()) return false;
        if (
          String(a.fertilizer_name || "").toLowerCase() !==
          line.fertilizerName.toLowerCase()
        ) {
          return false;
        }
        return weekNotesMatch(String(a.notes || ""), w.week, pepper);
      });
      if (p.incomplete) {
        hasIncompleteLine = true;
        allDone = false;
      } else if (!anyApp && !p.doneThisRound) {
        allDone = false;
      }
    }

    return {
      week: w.week,
      isCurrent: false,
      complete: allDone && !hasIncompleteLine,
      hasIncompleteLine,
      remainingPlants,
    };
  });

  const firstOpen = rows.find((r) => !r.complete) || rows.find((r) => r.hasIncompleteLine);
  const currentWeek = firstOpen?.week ?? rows[0]?.week;
  return rows.map((r) => ({
    ...r,
    isCurrent: currentWeek != null && r.week === currentWeek,
  }));
}
