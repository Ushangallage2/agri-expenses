/** Newest first — matches ledger table + charts by calendar time. */
export function sortExpensesByDate<T extends { created_at: string; id?: string | number }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (tb !== ta) return tb - ta;
    return Number(b.id ?? 0) - Number(a.id ?? 0);
  });
}

/** Format MySQL-friendly datetime from a Date. */
export function toMysqlDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
