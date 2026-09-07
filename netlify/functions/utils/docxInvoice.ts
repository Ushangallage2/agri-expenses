import {
  formatIssued,
  formatRowDate,
  money,
  signedMoney,
  type ExportStatement,
} from "./ledgerExport";
import { zipStore } from "./zipStore";

function xml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function p(text: string, opts?: { bold?: boolean; size?: number; color?: string; align?: string }) {
  const size = (opts?.size || 22) * 1;
  const color = opts?.color || "1C1917";
  const align = opts?.align ? `<w:jc w:val="${opts.align}"/>` : "";
  const bold = opts?.bold ? "<w:b/>" : "";
  return `<w:p>
    <w:pPr>${align}<w:spacing w:after="80"/></w:pPr>
    <w:r>
      <w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:color w:val="${color}"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      </w:rPr>
      <w:t xml:space="preserve">${xml(text)}</w:t>
    </w:r>
  </w:p>`;
}

function cell(text: string, opts?: { bold?: boolean; color?: string; width?: number; align?: string }) {
  const width = opts?.width || 2000;
  const align = opts?.align || "left";
  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${width}" w:type="dxa"/>
      <w:tcBorders>
        <w:top w:val="single" w:sz="4" w:color="D6C9A8"/>
        <w:left w:val="single" w:sz="4" w:color="D6C9A8"/>
        <w:bottom w:val="single" w:sz="4" w:color="D6C9A8"/>
        <w:right w:val="single" w:sz="4" w:color="D6C9A8"/>
      </w:tcBorders>
    </w:tcPr>
    ${p(text, { bold: opts?.bold, size: 18, color: opts?.color, align })}
  </w:tc>`;
}

function table(headers: string[], rows: string[][], widths: number[]) {
  const head = `<w:tr>${headers
    .map((h, i) => cell(h, { bold: true, color: "A8892D", width: widths[i] }))
    .join("")}</w:tr>`;
  const body = rows
    .map(
      (r) =>
        `<w:tr>${r
          .map((c, i) =>
            cell(c, {
              width: widths[i],
              align: i === r.length - 1 ? "right" : "left",
              color: i === r.length - 1 && c.startsWith("-") ? "B91C1C" : "1C1917",
            })
          )
          .join("")}</w:tr>`
    )
    .join("");
  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="10000" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:color="A8892D"/>
        <w:bottom w:val="single" w:sz="6" w:color="A8892D"/>
      </w:tblBorders>
    </w:tblPr>
    ${head}${body}
  </w:tbl>`;
}

export function buildInvoiceDocx(statement: ExportStatement): Buffer {
  const summaryHeaders = ["Name", "Income", "Expense", "Profit"];
  const summaryWidths = [3400, 2200, 2200, 2200];
  const toSummary = (rows: ExportStatement["byCrop"]) =>
    rows.map((r) => [
      r.name,
      money(r.income),
      money(r.expense),
      money(r.profit),
    ]);

  const recordRows = statement.rows.map((r) => [
    formatRowDate(r.created_at),
    r.expender,
    r.crop || "—",
    r.reason,
    signedMoney(Number(r.amount)),
  ]);

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${p("AGRI LEDGER", { bold: true, size: 40, color: "A8892D" })}
    ${p("OFFICIAL STATEMENT  ·  INVOICE", { size: 20, color: "57534E" })}
    ${p(`Statement ${statement.statementNo}`, { bold: true, size: 20 })}
    ${p(`Issued ${formatIssued(statement.issuedAt)}  ·  Prepared by ${statement.issuedBy}`, { size: 18, color: "57534E" })}
    ${p(`Period: ${statement.periodLabel}`, { size: 20 })}
    ${p("Filters applied", { bold: true, size: 22, color: "A8892D" })}
    ${statement.filterLines.map((line) => p(line, { size: 20 })).join("")}
    ${p("Budget totals", { bold: true, size: 24, color: "A8892D" })}
    ${table(
      ["Income", "Expenses", "Profit", "Entries"],
      [[
        money(statement.period.income),
        money(statement.period.expense),
        money(statement.period.profit),
        String(statement.period.count),
      ]],
      [2500, 2500, 2500, 2500]
    )}
    ${p("Summary by crop", { bold: true, size: 22, color: "A8892D" })}
    ${table(summaryHeaders, toSummary(statement.byCrop), summaryWidths)}
    ${p("Summary by user", { bold: true, size: 22, color: "A8892D" })}
    ${table(summaryHeaders, toSummary(statement.byUser), summaryWidths)}
    ${p("Summary by reason", { bold: true, size: 22, color: "A8892D" })}
    ${table(summaryHeaders, toSummary(statement.byReason), summaryWidths)}
    ${p("Record table", { bold: true, size: 22, color: "A8892D" })}
    ${table(
      ["Date", "User", "Crop", "Reason", "Amount"],
      recordRows.length
        ? recordRows
        : [["—", "—", "—", "No records match these filters.", ""]],
      [1600, 1800, 1800, 3200, 1600]
    )}
    ${p("This document is the official Agri Ledger export of the filtered budget record. Confidential farm records · Uni Soft.", { size: 16, color: "78716C" })}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  return zipStore([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rels },
    { name: "word/document.xml", data: document },
  ]);
}
