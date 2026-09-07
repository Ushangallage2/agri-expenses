import pool from "../db";
import {
  accumulate,
  emptyBucket,
  groupBy,
  type BucketTotals,
  type ExpenseRow,
  type NamedTotals,
} from "./buildSummaryData";

export type ExportTypeFilter = "all" | "income" | "expense";

export type ExportFilters = {
  crop: string;
  reason: string;
  user: string;
  type: ExportTypeFilter;
  dateFrom: string;
  dateTo: string;
};

export type ExportStatement = {
  title: string;
  subtitle: string;
  statementNo: string;
  issuedAt: string;
  issuedBy: string;
  filterLines: string[];
  periodLabel: string;
  period: BucketTotals;
  byCrop: NamedTotals[];
  byUser: NamedTotals[];
  byReason: NamedTotals[];
  rows: ExpenseRow[];
};

const MAX_ROWS = 2500;

export function parseExportFilters(raw: any): ExportFilters {
  const type = raw?.type;
  return {
    crop: String(raw?.crop || "").trim(),
    reason: String(raw?.reason || "").trim(),
    user: String(raw?.user || "").trim(),
    type: type === "income" || type === "expense" ? type : "all",
    dateFrom: String(raw?.dateFrom || "").trim(),
    dateTo: String(raw?.dateTo || "").trim(),
  };
}

function dayStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function rowMatchesFilters(row: ExpenseRow, filters: ExportFilters) {
  if (filters.crop && String(row.crop || "") !== filters.crop) return false;
  if (filters.reason && String(row.reason || "") !== filters.reason) return false;
  if (filters.user && String(row.expender || "") !== filters.user) return false;
  if (filters.type === "income" && Number(row.amount) <= 0) return false;
  if (filters.type === "expense" && Number(row.amount) >= 0) return false;
  const day = dayStamp(row.created_at);
  if (filters.dateFrom && day && day < filters.dateFrom) return false;
  if (filters.dateTo && day && day > filters.dateTo) return false;
  return true;
}

export function describeFilters(filters: ExportFilters): string[] {
  const lines: string[] = [];
  lines.push(`Crop: ${filters.crop || "All crops"}`);
  lines.push(`Reason: ${filters.reason || "All reasons"}`);
  lines.push(`User: ${filters.user || "All users"}`);
  lines.push(
    `Type: ${
      filters.type === "income"
        ? "Income only"
        : filters.type === "expense"
          ? "Expenses only"
          : "Income & expenses"
    }`
  );
  if (filters.dateFrom || filters.dateTo) {
    lines.push(
      `Dates: ${filters.dateFrom || "start"} → ${filters.dateTo || "today"}`
    );
  } else {
    lines.push("Dates: All recorded dates");
  }
  return lines;
}

function statementNo(filters: ExportFilters, count: number) {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const hm = `${String(now.getUTCHours()).padStart(2, "0")}${String(
    now.getUTCMinutes()
  ).padStart(2, "0")}`;
  const tag = [filters.crop, filters.user, filters.type]
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 12);
  return `AL-${ymd}-${hm}${tag ? `-${tag}` : ""}-${count}`;
}

export function buildExportStatement(
  rows: ExpenseRow[],
  filters: ExportFilters,
  issuedBy: string
): ExportStatement {
  const period = emptyBucket();
  for (const r of rows) accumulate(period, Number(r.amount));

  const dateLabel =
    filters.dateFrom || filters.dateTo
      ? `${filters.dateFrom || "start"} → ${filters.dateTo || "today"}`
      : "All dates";

  return {
    title: "Agri Ledger",
    subtitle: "Official statement",
    statementNo: statementNo(filters, rows.length),
    issuedAt: new Date().toISOString(),
    issuedBy: issuedBy || "admin",
    filterLines: describeFilters(filters),
    periodLabel: dateLabel,
    period,
    byCrop: groupBy(rows, (r) => r.crop),
    byUser: groupBy(rows, (r) => r.expender),
    byReason: groupBy(rows, (r) => r.reason),
    rows,
  };
}

export async function loadFilteredExpenses(
  filters: ExportFilters
): Promise<ExpenseRow[]> {
  const res = await pool.query(
    `SELECT id, expender, reason, crop, amount, created_at
     FROM expenses
     ORDER BY created_at DESC, id DESC`
  );
  const rows = (res.rows as any[]).map((r) => ({
    id: Number(r.id),
    expender: String(r.expender || ""),
    reason: String(r.reason || ""),
    crop: String(r.crop || ""),
    amount: Number(r.amount) || 0,
    created_at: r.created_at,
  })) as ExpenseRow[];

  return rows.filter((r) => rowMatchesFilters(r, filters)).slice(0, MAX_ROWS);
}

export function money(n: number) {
  return n.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function signedMoney(n: number) {
  const abs = money(Math.abs(n));
  return n >= 0 ? `+${abs}` : `-${abs}`;
}

export function formatIssued(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRowDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}
