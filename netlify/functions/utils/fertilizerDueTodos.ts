import pool from "../db";
import { ensureCropNotesTable } from "./cropNotesDb";
import { ensureCropPlantCountColumn } from "./cropPlantCountDb";
import { ensureCropStatusColumns } from "./cropStatusDb";
import { ensureFertilizerTables } from "./fertilizerDb";
import {
  getFertilizerRateConfig,
  hasFertilizerRates,
} from "./fertilizerRateConfigDb";

/** Idempotent source key for auto fertilizer due todos. */
export function fertDueSource(cropName: string, week: number): string {
  return `fert_due:${cropName.toLowerCase()}:${week}`;
}

function parseMysqlDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

type AppRow = { id?: unknown; applied_at: unknown; notes: unknown };

export type WeekTreatmentStep = {
  treated: number;
  at: Date;
  remainingAfter: number;
};

export type WeekTreatmentProgress = {
  treatedInCycle: number;
  totalPlants: number;
  remaining: number;
  /** First apply timestamp of the active cycle (if still in completion window). */
  cycleStartedAt: Date | null;
  /** Last date/time user can finish the active cycle before it expires. */
  cycleDueAt: Date | null;
  lastAt: Date | null;
  /** Last completed full-coverage apply timestamp for this week. */
  lastCompletedAt: Date | null;
  /** True when current cycle still has untreated vines. */
  incomplete: boolean;
  /** Stepwise logs inside the active incomplete cycle (oldest → newest). */
  steps: WeekTreatmentStep[];
  /** Most recent step treated count (for “−10” style UI). */
  lastStepTreated: number;
};

/**
 * Sum [treated:N/M] batches for a week. When a cycle reaches `total`,
 * accumulator resets (next monsoon / next round).
 * Prefers [batch:…] so multi-product lines and same-day repeats count once each.
 */
export async function getWeekTreatmentProgress(
  cropName: string,
  week: number,
  fallbackTotal: number,
  intervalDays: number
): Promise<WeekTreatmentProgress> {
  const tag = `%[week:${week}]%`;
  let res;
  if (week === 0) {
    res = await pool.query(
      `SELECT id, applied_at, notes
       FROM fertilizer_applications
       WHERE crop_name = ?
         AND (
           notes LIKE ?
           OR notes LIKE ?
           OR notes LIKE ?
         )
       ORDER BY applied_at ASC, id ASC`,
      [cropName, tag, "%Pepper Fertilizer Mixtures%", "%Extra round%"]
    );
  } else {
    res = await pool.query(
      `SELECT id, applied_at, notes
       FROM fertilizer_applications
       WHERE crop_name = ?
         AND (notes LIKE ? OR notes LIKE ? OR notes LIKE ?)
       ORDER BY applied_at ASC, id ASC`,
      [cropName, tag, `%Week ${week}%`, `%Phase ${week}%`]
    );
  }

  const seen = new Set<string>();
  const batches: { at: Date; treated: number; total: number }[] = [];

  for (const row of res.rows as AppRow[]) {
    const notes = String(row.notes || "");
    const m = notes.match(/\[treated:(\d+)(?:\/(\d+))?\]/i);
    if (!m) continue;
    const at = parseMysqlDate(row.applied_at);
    if (!at) continue;
    const treated = Number(m[1]) || 0;
    const total = Number(m[2]) || fallbackTotal || 0;
    const batch = notes.match(/\[batch:([^\]]+)\]/i)?.[1]?.trim();
    // One Apply click may insert several fertilizer rows — count once per batch.
    const key = batch
      ? `batch:${batch}`
      : `legacy:${at.toISOString().slice(0, 19)}:${treated}:${total}`;
    if (seen.has(key)) continue;
    seen.add(key);
    batches.push({ at, treated, total });
  }

  let cycleTreated = 0;
  let cycleTotal = fallbackTotal || 0;
  let cycleStartedAt: Date | null = null;
  let cycleDueAt: Date | null = null;
  let lastCompletedAt: Date | null = null;
  let lastAt: Date | null = null;
  let steps: WeekTreatmentStep[] = [];
  let lastStepTreated = 0;

  for (const b of batches) {
    lastAt = b.at;
    if (
      cycleStartedAt &&
      cycleDueAt &&
      intervalDays > 0 &&
      b.at.getTime() > cycleDueAt.getTime() &&
      cycleTreated > 0 &&
      cycleTotal > 0 &&
      cycleTreated < cycleTotal
    ) {
      // Previous partial cycle expired before completion.
      cycleTreated = 0;
      cycleTotal = b.total > 0 ? b.total : fallbackTotal || cycleTotal;
      cycleStartedAt = null;
      cycleDueAt = null;
      steps = [];
      lastStepTreated = 0;
    }

    if (!cycleStartedAt) {
      cycleStartedAt = b.at;
      cycleDueAt =
        intervalDays > 0 ? addDays(cycleStartedAt, intervalDays) : null;
      steps = [];
    }

    if (b.total > 0) cycleTotal = b.total;
    cycleTreated += b.treated;
    lastStepTreated = b.treated;
    const remainingAfter =
      cycleTotal > 0 ? Math.max(0, cycleTotal - cycleTreated) : 0;
    steps.push({
      treated: b.treated,
      at: b.at,
      remainingAfter,
    });

    if (cycleTotal > 0 && cycleTreated >= cycleTotal) {
      // Cycle finished — next apply opens a new round.
      lastCompletedAt = b.at;
      cycleTreated = 0;
      cycleStartedAt = null;
      cycleDueAt = null;
      steps = [];
      lastStepTreated = 0;
    }
  }

  if (
    cycleStartedAt &&
    cycleDueAt &&
    intervalDays > 0 &&
    cycleTreated > 0 &&
    cycleTotal > 0 &&
    cycleTreated < cycleTotal
  ) {
    const now = new Date();
    if (now.getTime() > cycleDueAt.getTime()) {
      // Round window ended with unfinished vines; reset active progress.
      cycleTreated = 0;
      cycleStartedAt = null;
      cycleDueAt = null;
      steps = [];
      lastStepTreated = 0;
    }
  }

  const totalPlants = cycleTotal > 0 ? cycleTotal : fallbackTotal || 0;
  const remaining =
    totalPlants > 0 ? Math.max(0, totalPlants - cycleTreated) : 0;
  const incomplete = cycleTreated > 0 && remaining > 0;

  return {
    treatedInCycle: cycleTreated,
    totalPlants,
    remaining,
    cycleStartedAt,
    cycleDueAt,
    lastAt,
    lastCompletedAt,
    incomplete,
    steps,
    lastStepTreated,
  };
}

async function upsertOpenTodo(
  cropName: string,
  source: string,
  note: string
): Promise<void> {
  const existing = await pool.query(
    `SELECT id, completed FROM crop_notes
     WHERE crop_name = ? AND source = ? AND entry_type = 'todo'
     ORDER BY id DESC LIMIT 1`,
    [cropName, source]
  );

  if (existing.rowCount) {
    await pool.query(
      `UPDATE crop_notes SET completed = 0, note = ? WHERE id = ?`,
      [note, existing.rows[0].id]
    );
  } else {
    await pool.query(
      `INSERT INTO crop_notes (crop_name, note, entry_type, completed, source)
       VALUES (?, ?, 'todo', 0, ?)`,
      [cropName, note, source]
    );
  }
}

/**
 * For crops with plant_count > 1:
 * - Incomplete partial cycles → open “finish remaining vines” todo
 * - Overdue / never done → past-due todo
 * - Fully covered within interval → complete todo
 */
export async function syncFertilizerDueTodos(): Promise<void> {
  await ensureCropNotesTable();
  await ensureCropPlantCountColumn();
  await ensureCropStatusColumns();
  await ensureFertilizerTables();

  // Closed / idle plantations should not keep fertilizer due todos open
  try {
    await pool.query(
      `UPDATE crop_notes cn
       INNER JOIN crops c ON c.name = cn.crop_name
       SET cn.completed = 1
       WHERE cn.entry_type = 'todo'
         AND cn.completed = 0
         AND cn.source LIKE 'fert_due:%'
         AND (c.status = 'closed' OR c.plant_count <= 1)`
    );
  } catch {
    /* ignore if join/columns unavailable mid-migrate */
  }

  const crops = await pool.query(
    `SELECT name, plant_count FROM crops
     WHERE plant_count > 1
       AND COALESCE(status, 'active') <> 'closed'`
  );

  const now = new Date();

  for (const crop of crops.rows as { name: string; plant_count: number }[]) {
    const cropName = String(crop.name);
    const plantCount = Number(crop.plant_count) || 0;
    const config = await getFertilizerRateConfig(cropName);
    // Empty / unset rates for this crop → no due todos (do not fall back).
    if (!hasFertilizerRates(config)) continue;

    for (const weekDef of config.weeks) {
      const week = weekDef.week;
      const interval = Number(config.intervals[String(week)]);
      if (!(interval > 0)) continue;

      const source = fertDueSource(cropName, week);
      const progress = await getWeekTreatmentProgress(
        cropName,
        week,
        plantCount,
        interval
      );
      const title = weekDef.title || (week === 0 ? "Mixtures" : `Week ${week}`);

      // 1) Partial cycle in progress — always encourage finishing the rest
      if (progress.incomplete) {
        const dueTxt = progress.cycleDueAt
          ? ` · finish by ${progress.cycleDueAt.toISOString().slice(0, 10)}`
          : "";
        const lastTxt =
          progress.lastStepTreated > 0
            ? ` · last step −${progress.lastStepTreated}`
            : "";
        const note =
          `FINISH REST: ${title} — ${progress.treatedInCycle}/${progress.totalPlants} vines done · ` +
          `${progress.remaining} vines still need fertilizer${lastTxt}${dueTxt} · open Apply week and treat the rest`;
        await upsertOpenTodo(cropName, source, note);
        continue;
      }

      const baseAt = progress.lastCompletedAt || progress.lastAt;
      const pastDue =
        !baseAt || addDays(baseAt, interval) < now;

      if (pastDue) {
        const dueNote = baseAt
          ? `PAST DUE: ${title} — last finished ${String(baseAt).slice(0, 10)} · every ${interval} days · ${plantCount} plants · start Apply week`
          : `PAST DUE: ${title} — never logged · every ${interval} days · ${plantCount} plants · start Apply week`;
        await upsertOpenTodo(cropName, source, dueNote);
      } else {
        await pool.query(
          `UPDATE crop_notes
           SET completed = 1
           WHERE crop_name = ? AND source = ? AND entry_type = 'todo' AND completed = 0`,
          [cropName, source]
        );
      }
    }
  }
}

/** Mark fertilizer due todo complete after a full-crop apply. */
export async function completeFertilizerDueTodo(
  cropName: string,
  week: number
): Promise<void> {
  await ensureCropNotesTable();
  const source = fertDueSource(cropName, week);
  await pool.query(
    `UPDATE crop_notes
     SET completed = 1
     WHERE crop_name = ? AND source = ? AND entry_type = 'todo' AND completed = 0`,
    [cropName, source]
  );
}

/**
 * After a partial apply: open/update todo with cumulative progress + vines left.
 */
export async function noteFertilizerDueProgress(
  cropName: string,
  week: number,
  _treatedThisLog: number,
  totalPlants: number,
  weekLabel: string
): Promise<void> {
  await ensureCropNotesTable();
  const source = fertDueSource(cropName, week);
  let interval = 0;
  try {
    const cfg = await getFertilizerRateConfig(cropName);
    interval = Number(cfg?.intervals?.[String(week)]) || 0;
  } catch {
    interval = 0;
  }
  const progress = await getWeekTreatmentProgress(
    cropName,
    week,
    totalPlants,
    interval
  );
  const title =
    weekLabel ||
    (week === 0 ? "Pepper Fertilizer Mixtures" : `Week ${week}`);

  if (!progress.incomplete) {
    await completeFertilizerDueTodo(cropName, week);
    return;
  }

  const note =
    `FINISH REST: ${title} — ${progress.treatedInCycle}/${progress.totalPlants} vines done · ` +
    `${progress.remaining} vines still need fertilizer` +
    `${
      progress.lastStepTreated > 0
        ? ` · last step −${progress.lastStepTreated}`
        : ""
    }` +
    `${
      progress.cycleDueAt
        ? ` · finish by ${progress.cycleDueAt.toISOString().slice(0, 10)}`
        : ""
    } · open Apply week and treat the rest`;

  await upsertOpenTodo(cropName, source, note);
}
