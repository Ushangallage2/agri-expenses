import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import { buildInvoiceCsv } from "./utils/csvInvoice";
import { buildInvoiceDocx } from "./utils/docxInvoice";
import {
  buildExportStatement,
  loadFilteredExpenses,
  parseExportFilters,
} from "./utils/ledgerExport";
import { buildInvoicePdf } from "./utils/pdfInvoice";

const baseHandler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const format = String(body.format || "pdf").toLowerCase();
  if (format !== "pdf" && format !== "docx" && format !== "csv") {
    return { statusCode: 400, body: "format must be pdf, docx, or csv" };
  }

  const filters = parseExportFilters(body);
  const user = (context as { user?: { username?: string } }).user;
  const issuedBy = user?.username || "admin";

  try {
    const rows = await loadFilteredExpenses(filters);
    const statement = buildExportStatement(rows, filters, issuedBy);
    const day = new Date().toISOString().slice(0, 10);
    const base = `Agri-Ledger-Statement-${day}`;

    if (format === "csv") {
      const csv = buildInvoiceCsv(statement);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: `${base}.csv`,
          mime: "text/csv;charset=utf-8",
          base64: Buffer.from(csv, "utf8").toString("base64"),
          count: rows.length,
          statementNo: statement.statementNo,
        }),
      };
    }

    if (format === "docx") {
      const buf = buildInvoiceDocx(statement);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: `${base}.docx`,
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          base64: buf.toString("base64"),
          count: rows.length,
          statementNo: statement.statementNo,
        }),
      };
    }

    const buf = buildInvoicePdf(statement);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: `${base}.pdf`,
        mime: "application/pdf",
        base64: buf.toString("base64"),
        count: rows.length,
        statementNo: statement.statementNo,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Failed to export statement" };
  }
};

export const handler = requireAdmin(baseHandler);
