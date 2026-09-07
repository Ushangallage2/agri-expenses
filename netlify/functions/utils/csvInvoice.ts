import {
  formatIssued,
  formatRowDate,
  money,
  signedMoney,
  type ExportStatement,
} from "./ledgerExport";

function csvCell(v: string | number) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function line(cells: Array<string | number>) {
  return cells.map(csvCell).join(",");
}

export function buildInvoiceCsv(statement: ExportStatement): string {
  const out: string[] = [];
  out.push(line(["Agri Ledger", "Official statement"]));
  out.push(line(["Statement", statement.statementNo]));
  out.push(line(["Issued", formatIssued(statement.issuedAt)]));
  out.push(line(["Prepared by", statement.issuedBy]));
  out.push(line(["Period", statement.periodLabel]));
  out.push("");
  out.push(line(["Filters"]));
  for (const f of statement.filterLines) out.push(line([f]));
  out.push("");
  out.push(line(["Income", "Expenses", "Profit", "Entries"]));
  out.push(
    line([
      money(statement.period.income),
      money(statement.period.expense),
      money(statement.period.profit),
      statement.period.count,
    ])
  );
  out.push("");

  const dump = (title: string, rows: ExportStatement["byCrop"]) => {
    out.push(line([title]));
    out.push(line(["Name", "Income", "Expense", "Profit", "Count"]));
    for (const r of rows) {
      out.push(line([r.name, money(r.income), money(r.expense), money(r.profit), r.count]));
    }
    out.push("");
  };
  dump("Summary by crop", statement.byCrop);
  dump("Summary by user", statement.byUser);
  dump("Summary by reason", statement.byReason);

  out.push(line(["Record table"]));
  out.push(line(["Date", "User", "Crop", "Reason", "Amount"]));
  for (const r of statement.rows) {
    out.push(
      line([
        formatRowDate(r.created_at),
        r.expender,
        r.crop || "",
        r.reason,
        signedMoney(Number(r.amount)),
      ])
    );
  }
  return `${out.join("\n")}\n`;
}
