import {
  formatIssued,
  formatRowDate,
  money,
  signedMoney,
  type ExportStatement,
} from "./ledgerExport";

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 42;

function pdfEscape(s: string) {
  return String(s)
    .replace(/[^\x20-\x7E]/g, (ch) => {
      const map: Record<string, string> = {
        "–": "-",
        "—": "-",
        "’": "'",
        "‘": "'",
        "“": '"',
        "”": '"',
        "·": "-",
        "×": "x",
      };
      return map[ch] || "?";
    })
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function rgb(r: number, g: number, b: number) {
  return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)}`;
}

const GOLD = rgb(168, 137, 45);
const INK = rgb(28, 25, 23);
const MUTED = rgb(87, 83, 78);
const RULE = rgb(214, 201, 168);
const CREAM = rgb(247, 241, 228);
const HEADER = rgb(18, 16, 12);
const EMERALD = rgb(4, 120, 87);
const ROSE = rgb(185, 28, 28);

class PdfDoc {
  private pages: string[] = [];
  private buf: string[] = [];
  y = 0;

  constructor() {
    this.newPage();
  }

  newPage() {
    if (this.buf.length) this.pages.push(this.buf.join("\n"));
    this.buf = [];
    this.y = A4_H - MARGIN;
    this.rect(0, 0, A4_W, A4_H, CREAM, true);
  }

  ensure(space: number) {
    if (this.y - space < MARGIN + 28) this.newPage();
  }

  ty(fromTop: number) {
    return fromTop;
  }

  rect(
    x: number,
    yBottom: number,
    w: number,
    h: number,
    color: string,
    fill: boolean
  ) {
    this.buf.push(
      `${color} ${fill ? "rg" : "RG"} ${x.toFixed(2)} ${yBottom.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill ? "f" : "S"}`
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, color = RULE) {
    this.buf.push(
      `${color} RG 0.6 w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`
    );
  }

  text(
    x: number,
    y: number,
    str: string,
    size: number,
    color = INK,
    font: "F1" | "F2" = "F1"
  ) {
    this.buf.push(
      `BT /${font} ${size} Tf ${color} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscape(str)}) Tj ET`
    );
  }

  finish(): Buffer {
    if (this.buf.length) this.pages.push(this.buf.join("\n"));
    let nextId = 3;
    const pageObjIds: number[] = [];
    const contentObjIds: number[] = [];
    for (let i = 0; i < this.pages.length; i++) {
      pageObjIds.push(nextId++);
      contentObjIds.push(nextId++);
    }
    const fontReg = nextId;
    const fontBold = nextId + 1;
    const catalog = "<< /Type /Catalog /Pages 2 0 R >>";
    const pagesObj = `<< /Type /Pages /Kids [${pageObjIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] /Count ${this.pages.length} >>`;
    const ordered: string[] = [catalog, pagesObj];
    for (let i = 0; i < this.pages.length; i++) {
      ordered.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] /Resources << /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentObjIds[i]} 0 R >>`
      );
      const stream = this.pages[i];
      ordered.push(
        `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`
      );
    }
    ordered.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    ordered.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

    let offset = 0;
    const chunks: string[] = ["%PDF-1.4\n"];
    offset = Buffer.byteLength(chunks[0], "utf8");
    const xref: number[] = [0];
    for (let i = 0; i < ordered.length; i++) {
      xref.push(offset);
      const body = `${i + 1} 0 obj\n${ordered[i]}\nendobj\n`;
      chunks.push(body);
      offset += Buffer.byteLength(body, "utf8");
    }
    const xrefStart = offset;
    let xrefTable = `xref\n0 ${ordered.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= ordered.length; i++) {
      xrefTable += `${String(xref[i]).padStart(10, "0")} 00000 n \n`;
    }
    const trailer = `trailer\n<< /Size ${ordered.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    chunks.push(xrefTable);
    chunks.push(trailer);
    return Buffer.concat(chunks.map((c) => Buffer.from(c, "utf8")));
  }
}

function clip(s: string, max: number) {
  const t = String(s || "");
  return t.length > max ? `${t.slice(0, max - 1)}...` : t;
}

export function buildInvoicePdf(statement: ExportStatement): Buffer {
  const doc = new PdfDoc();
  const left = MARGIN;
  const width = A4_W - MARGIN * 2;

  function headerBand() {
    doc.rect(0, A4_H - 78, A4_W, 78, HEADER, true);
    doc.rect(0, A4_H - 82, A4_W, 4, GOLD, true);
    doc.text(left, A4_H - 38, "AGRI LEDGER", 16, GOLD, "F2");
    doc.text(left, A4_H - 54, "OFFICIAL STATEMENT  ·  INVOICE", 8, rgb(201, 184, 150), "F1");
    doc.text(A4_W - MARGIN - 170, A4_H - 38, statement.statementNo, 8, GOLD, "F2");
    doc.text(
      A4_W - MARGIN - 170,
      A4_H - 54,
      `Issued ${formatIssued(statement.issuedAt)}`,
      8,
      rgb(201, 184, 150),
      "F1"
    );
    doc.y = A4_H - 102;
  }

  function footerNote() {
    doc.text(
      left,
      28,
      `Agri Ledger  ·  Prepared by ${statement.issuedBy}  ·  Confidential farm records  ·  Uni Soft`,
      7,
      MUTED
    );
  }

  headerBand();
  footerNote();

  doc.text(left, doc.y, "Statement of account", 13, INK, "F2");
  doc.y -= 16;
  doc.text(left, doc.y, `Period: ${statement.periodLabel}`, 9, MUTED);
  doc.y -= 18;

  doc.text(left, doc.y, "Filters applied", 9, GOLD, "F2");
  doc.y -= 14;
  for (const line of statement.filterLines) {
    doc.text(left, doc.y, line, 9, INK);
    doc.y -= 12;
  }
  doc.y -= 8;

  const cardW = (width - 16) / 3;
  const cardH = 48;
  doc.ensure(cardH + 20);
  const cards = [
    ["Income", money(statement.period.income), EMERALD],
    ["Expenses", money(statement.period.expense), ROSE],
    ["Profit", money(statement.period.profit), statement.period.profit >= 0 ? GOLD : ROSE],
  ] as const;
  cards.forEach(([label, value, color], i) => {
    const x = left + i * (cardW + 8);
    doc.rect(x, doc.y - cardH + 10, cardW, cardH, rgb(255, 252, 245), true);
    doc.rect(x, doc.y - cardH + 10, cardW, cardH, RULE, false);
    doc.text(x + 10, doc.y, label.toUpperCase(), 7, MUTED, "F2");
    doc.text(x + 10, doc.y - 20, value, 12, color, "F2");
  });
  doc.y -= cardH + 18;
  doc.text(left, doc.y, `${statement.period.count} line items in this statement`, 8, MUTED);
  doc.y -= 18;

  function summaryTable(title: string, rows: ExportStatement["byCrop"]) {
    doc.ensure(60);
    doc.text(left, doc.y, title, 10, GOLD, "F2");
    doc.y -= 8;
    doc.line(left, doc.y, left + width, doc.y, GOLD);
    doc.y -= 14;
    const cols = [left, left + 170, left + 260, left + 350, left + width];
    doc.text(cols[0], doc.y, "Name", 8, MUTED, "F2");
    doc.text(cols[1], doc.y, "Income", 8, MUTED, "F2");
    doc.text(cols[2], doc.y, "Expense", 8, MUTED, "F2");
    doc.text(cols[3], doc.y, "Profit", 8, MUTED, "F2");
    doc.y -= 12;
    if (!rows.length) {
      doc.text(cols[0], doc.y, "No activity for this breakdown.", 8, MUTED);
      doc.y -= 16;
      return;
    }
    for (const r of rows) {
      doc.ensure(16);
      doc.text(cols[0], doc.y, clip(r.name, 28), 8, INK);
      doc.text(cols[1], doc.y, money(r.income), 8, EMERALD);
      doc.text(cols[2], doc.y, money(r.expense), 8, ROSE);
      doc.text(
        cols[3],
        doc.y,
        money(r.profit),
        8,
        r.profit >= 0 ? INK : ROSE,
        "F2"
      );
      doc.y -= 13;
    }
    doc.y -= 10;
  }

  summaryTable("Summary by crop", statement.byCrop);
  summaryTable("Summary by user", statement.byUser);
  summaryTable("Summary by reason", statement.byReason);

  doc.ensure(70);
  doc.text(left, doc.y, "Record table", 10, GOLD, "F2");
  doc.y -= 8;
  doc.line(left, doc.y, left + width, doc.y, GOLD);
  doc.y -= 14;
  const c = [left, left + 62, left + 132, left + 210, left + 390];
  doc.text(c[0], doc.y, "Date", 8, MUTED, "F2");
  doc.text(c[1], doc.y, "User", 8, MUTED, "F2");
  doc.text(c[2], doc.y, "Crop", 8, MUTED, "F2");
  doc.text(c[3], doc.y, "Reason", 8, MUTED, "F2");
  doc.text(c[4], doc.y, "Amount", 8, MUTED, "F2");
  doc.y -= 12;

  if (!statement.rows.length) {
    doc.text(left, doc.y, "No records match these filters.", 8, MUTED);
  }

  for (const row of statement.rows) {
    doc.ensure(14);
    const amt = Number(row.amount);
    doc.text(c[0], doc.y, formatRowDate(row.created_at), 8, MUTED);
    doc.text(c[1], doc.y, clip(row.expender, 12), 8, INK);
    doc.text(c[2], doc.y, clip(row.crop || "—", 12), 8, INK);
    doc.text(c[3], doc.y, clip(row.reason, 28), 8, INK);
    doc.text(c[4], doc.y, signedMoney(amt), 8, amt >= 0 ? EMERALD : ROSE, "F2");
    doc.y -= 12;
  }

  doc.y -= 16;
  doc.ensure(30);
  doc.line(left, doc.y + 8, left + width, doc.y + 8, RULE);
  doc.text(
    left,
    doc.y,
    "This document is the official Agri Ledger export of the filtered budget record.",
    8,
    MUTED
  );

  return doc.finish();
}
