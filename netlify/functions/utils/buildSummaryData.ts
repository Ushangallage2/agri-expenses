import pool from "../db";

export type ExpenseRow = {
  id: number;
  expender: string;
  reason: string;
  crop: string;
  amount: number;
  created_at: string;
};

export type BucketTotals = {
  income: number;
  expense: number;
  profit: number;
  count: number;
};

export type NamedTotals = BucketTotals & { name: string };

export type LedgerSummary = {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  period: BucketTotals;
  allTime: BucketTotals;
  byCrop: NamedTotals[];
  byUser: NamedTotals[];
  byReason: NamedTotals[];
  periodRows: ExpenseRow[];
};

function emptyBucket(): BucketTotals {
  return { income: 0, expense: 0, profit: 0, count: 0 };
}

function accumulate(bucket: BucketTotals, amount: number) {
  bucket.count += 1;
  if (amount > 0) bucket.income += amount;
  else bucket.expense += Math.abs(amount);
  bucket.profit = bucket.income - bucket.expense;
}

function groupBy(
  rows: ExpenseRow[],
  keyOf: (r: ExpenseRow) => string
): NamedTotals[] {
  const map = new Map<string, BucketTotals>();
  for (const r of rows) {
    const key = keyOf(r) || "—";
    if (!map.has(key)) map.set(key, emptyBucket());
    accumulate(map.get(key)!, Number(r.amount));
  }
  return [...map.entries()]
    .map(([name, t]) => ({ name, ...t }))
    .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit));
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeekMonday(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function endOfWeekSunday(start: Date) {
  const x = new Date(start);
  x.setUTCDate(x.getUTCDate() + 6);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

export function periodBounds(
  frequency: "weekly" | "monthly",
  now = new Date()
): { start: Date; end: Date; key: string; label: string } {
  if (frequency === "monthly") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
    );
    const label = start.toLocaleString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const key = `m-${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
    return { start, end, key, label };
  }

  const start = startOfWeekMonday(now);
  const end = endOfWeekSunday(start);
  const key = `w-${isoDate(start)}`;
  const label = `Week of ${isoDate(start)} → ${isoDate(end)}`;
  return { start, end, key, label };
}

/** Previous completed period (for scheduled sends on Monday / 1st). */
export function previousPeriodBounds(
  frequency: "weekly" | "monthly",
  now = new Date()
) {
  if (frequency === "monthly") {
    const ref = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    return periodBounds("monthly", ref);
  }
  const ref = new Date(now);
  ref.setUTCDate(ref.getUTCDate() - 7);
  return periodBounds("weekly", ref);
}

export async function buildLedgerSummary(
  frequency: "weekly" | "monthly",
  opts?: { usePreviousPeriod?: boolean; now?: Date }
): Promise<LedgerSummary> {
  const now = opts?.now ?? new Date();
  const bounds = opts?.usePreviousPeriod
    ? previousPeriodBounds(frequency, now)
    : periodBounds(frequency, now);

  const allRes = await pool.query(
    `SELECT id, expender, reason, crop, amount, created_at
     FROM expenses
     ORDER BY created_at DESC`
  );
  const allRows = allRes.rows.map((r: any) => ({
    ...r,
    amount: Number(r.amount),
  })) as ExpenseRow[];

  const periodRows = allRows.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return t >= bounds.start.getTime() && t <= bounds.end.getTime();
  });

  const period = emptyBucket();
  const allTime = emptyBucket();
  for (const r of periodRows) accumulate(period, r.amount);
  for (const r of allRows) accumulate(allTime, r.amount);

  return {
    periodLabel: bounds.label,
    periodStart: isoDate(bounds.start),
    periodEnd: isoDate(bounds.end),
    period,
    allTime,
    byCrop: groupBy(periodRows, (r) => r.crop),
    byUser: groupBy(periodRows, (r) => r.expender),
    byReason: groupBy(periodRows, (r) => r.reason),
    periodRows: periodRows.slice(0, 40),
  };
}

export function periodKeyFor(
  frequency: "weekly" | "monthly",
  opts?: { usePreviousPeriod?: boolean; now?: Date }
) {
  const now = opts?.now ?? new Date();
  return (opts?.usePreviousPeriod
    ? previousPeriodBounds(frequency, now)
    : periodBounds(frequency, now)
  ).key;
}
