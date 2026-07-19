import type { LedgerSummary, NamedTotals } from "./buildSummaryData";

const GOLD = "#d4af37";
const GOLD_BRIGHT = "#f5d76e";
const INK = "#f7f1e4";
const MUTED = "#c9b896";
const BG = "#070706";
const CARD = "#12100c";
const BORDER = "rgba(212,175,55,0.28)";
const EMERALD = "#6ee7b7";
const ROSE = "#fca5a5";

function money(n: number) {
  return n.toLocaleString("en-LK", { maximumFractionDigits: 2 });
}

function profitColor(n: number) {
  return n >= 0 ? GOLD_BRIGHT : ROSE;
}

function rowsTable(title: string, rows: NamedTotals[]) {
  if (!rows.length) {
    return `
      <tr><td colspan="4" style="padding:14px 18px;color:${MUTED};font-size:13px;">
        No ${title.toLowerCase()} activity in this period.
      </td></tr>`;
  }
  return rows
    .map(
      (r) => `
      <tr>
        <td style="padding:10px 18px;border-top:1px solid ${BORDER};color:${INK};font-size:13px;">${escapeHtml(r.name)}</td>
        <td style="padding:10px 12px;border-top:1px solid ${BORDER};color:${EMERALD};font-size:13px;text-align:right;">+${money(r.income)}</td>
        <td style="padding:10px 12px;border-top:1px solid ${BORDER};color:${ROSE};font-size:13px;text-align:right;">−${money(r.expense)}</td>
        <td style="padding:10px 18px;border-top:1px solid ${BORDER};color:${profitColor(r.profit)};font-weight:700;font-size:13px;text-align:right;">${money(r.profit)}</td>
      </tr>`
    )
    .join("");
}

function section(title: string, rows: NamedTotals[]) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:${CARD};border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
    <tr>
      <td style="padding:16px 18px 8px;color:${GOLD};font-size:11px;letter-spacing:0.28em;text-transform:uppercase;font-family:Georgia,'Times New Roman',serif;">
        ${escapeHtml(title)}
      </td>
    </tr>
    <tr>
      <td style="padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <th align="left" style="padding:6px 18px 10px;color:${MUTED};font-size:11px;font-weight:500;">Name</th>
            <th align="right" style="padding:6px 12px 10px;color:${MUTED};font-size:11px;font-weight:500;">Income</th>
            <th align="right" style="padding:6px 12px 10px;color:${MUTED};font-size:11px;font-weight:500;">Expense</th>
            <th align="right" style="padding:6px 18px 10px;color:${MUTED};font-size:11px;font-weight:500;">Profit</th>
          </tr>
          ${rowsTable(title, rows)}
        </table>
      </td>
    </tr>
  </table>`;
}

function metricCard(label: string, value: string, color: string) {
  return `
  <td width="33%" valign="top" style="padding:6px;">
    <div style="background:${CARD};border:1px solid ${BORDER};border-radius:14px;padding:18px 14px;text-align:center;">
      <div style="color:${MUTED};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;margin-bottom:8px;">${label}</div>
      <div style="color:${color};font-size:22px;font-weight:700;font-family:Georgia,'Times New Roman',serif;">${value}</div>
    </div>
  </td>`;
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function activityRows(summary: LedgerSummary) {
  if (!summary.periodRows.length) {
    return `<tr><td colspan="5" style="padding:14px 18px;color:${MUTED};font-size:13px;">No ledger entries in this period.</td></tr>`;
  }
  return summary.periodRows
    .map((r) => {
      const amt = Number(r.amount);
      const color = amt >= 0 ? EMERALD : ROSE;
      const sign = amt >= 0 ? "+" : "−";
      const when = new Date(r.created_at).toISOString().slice(0, 10);
      return `
      <tr>
        <td style="padding:9px 18px;border-top:1px solid ${BORDER};color:${MUTED};font-size:12px;white-space:nowrap;">${when}</td>
        <td style="padding:9px 10px;border-top:1px solid ${BORDER};color:${INK};font-size:12px;">${escapeHtml(r.expender)}</td>
        <td style="padding:9px 10px;border-top:1px solid ${BORDER};color:${INK};font-size:12px;">${escapeHtml(r.crop || "—")}</td>
        <td style="padding:9px 10px;border-top:1px solid ${BORDER};color:${MUTED};font-size:12px;">${escapeHtml(r.reason)}</td>
        <td style="padding:9px 18px;border-top:1px solid ${BORDER};color:${color};font-size:12px;font-weight:700;text-align:right;">${sign}${money(Math.abs(amt))}</td>
      </tr>`;
    })
    .join("");
}

export function buildSummaryEmailHtml(summary: LedgerSummary, appUrl?: string) {
  const link = appUrl || "https://agriexpenses.netlify.app";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agri Ledger Summary</title>
</head>
<body style="margin:0;padding:0;background:${BG};color:${INK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(160deg,#070706 0%,#12100c 45%,#0a0907 100%);padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">
          <tr>
            <td style="padding:8px 8px 22px;text-align:center;">
              <div style="color:${GOLD};font-size:11px;letter-spacing:0.32em;text-transform:uppercase;margin-bottom:10px;">Operations · Official summary</div>
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.15;color:${GOLD_BRIGHT};text-shadow:0 0 24px rgba(212,175,55,0.35);">
                Agri Ledger
              </div>
              <div style="margin-top:10px;color:${MUTED};font-size:14px;">
                ${escapeHtml(summary.periodLabel)}
              </div>
              <div style="margin-top:4px;color:rgba(201,184,150,0.65);font-size:12px;">
                ${summary.periodStart} → ${summary.periodEnd} · ${summary.period.count} entries
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 8px;">
              <div style="color:${GOLD};font-size:11px;letter-spacing:0.28em;text-transform:uppercase;padding:0 8px 10px;">This period</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  ${metricCard("Income", money(summary.period.income), EMERALD)}
                  ${metricCard("Expenses", money(summary.period.expense), ROSE)}
                  ${metricCard("Profit", money(summary.period.profit), profitColor(summary.period.profit))}
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:12px 0 8px;">
              <div style="color:${GOLD};font-size:11px;letter-spacing:0.28em;text-transform:uppercase;padding:0 8px 10px;">All time to date</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  ${metricCard("Income", money(summary.allTime.income), EMERALD)}
                  ${metricCard("Expenses", money(summary.allTime.expense), ROSE)}
                  ${metricCard("Profit", money(summary.allTime.profit), profitColor(summary.allTime.profit))}
                </tr>
              </table>
            </td>
          </tr>

          <tr><td style="padding-top:10px;">${section("By crop", summary.byCrop)}</td></tr>
          <tr><td>${section("By user", summary.byUser)}</td></tr>
          <tr><td>${section("By reason", summary.byReason)}</td></tr>

          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:${CARD};border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 18px 8px;color:${GOLD};font-size:11px;letter-spacing:0.28em;text-transform:uppercase;font-family:Georgia,'Times New Roman',serif;">
                    Period activity
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <th align="left" style="padding:6px 18px 10px;color:${MUTED};font-size:11px;font-weight:500;">Date</th>
                        <th align="left" style="padding:6px 10px 10px;color:${MUTED};font-size:11px;font-weight:500;">User</th>
                        <th align="left" style="padding:6px 10px 10px;color:${MUTED};font-size:11px;font-weight:500;">Crop</th>
                        <th align="left" style="padding:6px 10px 10px;color:${MUTED};font-size:11px;font-weight:500;">Reason</th>
                        <th align="right" style="padding:6px 18px 10px;color:${MUTED};font-size:11px;font-weight:500;">Amount</th>
                      </tr>
                      ${activityRows(summary)}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:8px;text-align:center;">
              <a href="${link}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:linear-gradient(135deg,#f5d76e,#d4af37 50%,#a8892d);color:#070706;text-decoration:none;font-weight:700;font-size:13px;">
                Open Agri Ledger
              </a>
              <div style="margin-top:18px;color:rgba(201,184,150,0.55);font-size:11px;line-height:1.6;">
                Official ledger summary from Uni Soft · ${escapeHtml(link)}<br/>
                You receive this because your address is saved for automated reports.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildSummarySubject(summary: LedgerSummary) {
  return `Agri Ledger · ${summary.periodLabel} · profit ${money(summary.period.profit)}`;
}
