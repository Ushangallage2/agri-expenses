import pool from "../db";
import { ensureCropNotesTable } from "./cropNotesDb";
import { ensureCropPlantCountColumn } from "./cropPlantCountDb";
import { ensureFertilizerTables } from "./fertilizerDb";
import { getFertilizerRateConfig } from "./fertilizerRateConfigDb";

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

type AppRow = { applied_at: unknown; notes: unknown };

export type WeekTreatmentProgress = {
  treatedInCycle: number;
  totalPlants: number;
  remaining: number;
  lastAt: Date | null;
  /** True when current cycle still has untreated vines. */
  incomplete: boolean;
};

/**
 * Sum [treated:N/M] batches for a week. When a cycle reaches `total`,
 * accumulator resets (next monsoon / next round).
 */
export async function getWeekTreatmentProgress(
  cropName: string,
  week: number,
  fallbackTotal: number
): Promise<WeekTreatmentProgress> {
  const tag = `%[week:${week}]%`;
  let res;
  if (week === 0) {
    res = await pool.query(
      `SELECT applied_at, notes
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
      `SELECT applied_at, notes
       FROM fertilizer_applications
       WHERE crop_name = ?
         AND (notes LIKE ? OR notes LIKE ?)
       ORDER BY applied_at ASC, id ASC`,
      [cropName, tag, `%Week ${week}%`]
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
    const key = `${at.toISOString().slice(0, 16)}:${treated}:${total}`;
    if (seen.has(key)) continue;
    seen.add(key);
    batches.push({ at, treated, total });
  }

  let cycleTreated = 0;
  let cycleTotal = fallbackTotal || 0;
  let lastAt: Date | null = null;

  for (const b of batches) {
    lastAt = b.at;
    if (b.total > 0) cycleTotal = b.total;
    cycleTreated += b.treated;
    if (cycleTotal > 0 && cycleTreated >= cycleTotal) {
      // Cycle finished — start fresh for next round
      cycleTreated = 0;
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
    lastAt,
    incomplete,
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
  await ensureFertilizerTables();

  const config = await getFertilizerRateConfig();
  const crops = await pool.query(
    `SELECT name, plant_count FROM crops WHERE plant_count > 1`
  );

  const now = new Date();

  for (const crop of crops.rows as { name: string; plant_count: number }[]) {
    const cropName = String(crop.name);
    const plantCount = Number(crop.plant_count) || 0;

    for (const weekDef of config.weeks) {
      const week = weekDef.week;
      const interval = Number(config.intervals[String(week)]);
      if (!(interval > 0)) continue;

      const source = fertDueSource(cropName, week);
      const progress = await getWeekTreatmentProgress(
        cropName,
        week,
        plantCount
      );
      const title =
        week === 0
          ? weekDef.title || "Pepper Fertilizer Mixtures"
          : weekDef.title || `Week ${week}`;

      // 1) Partial cycle in progress — always encourage finishing the rest
      if (progress.incomplete) {
        const note =
          `FINISH REST: ${title} — ${progress.treatedInCycle}/${progress.totalPlants} vines done · ` +
          `${progress.remaining} vines still need fertilizer · open Apply week and treat the rest`;
        await upsertOpenTodo(cropName, source, note);
        continue;
      }

      const pastDue =
        !progress.lastAt || addDays(progress.lastAt, interval) < now;

      if (pastDue) {
        const dueNote = progress.lastAt
          ? `PAST DUE: ${title} — last finished ${String(progress.lastAt).slice(0, 10)} · every ${interval} days · ${plantCount} plants · start Apply week`
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
  const progress = await getWeekTreatmentProgress(
    cropName,
    week,
    totalPlants
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
    `${progress.remaining} vines still need fertilizer · open Apply week and treat the rest`;

  await upsertOpenTodo(cropName, source, note);
}
