import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import { savePurchasePackItems } from "./utils/fertilizerDb";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const raw = Array.isArray(body.items) ? body.items : [];
    const items = raw.map((row: Record<string, unknown>) => ({
      name: String(row.name ?? ""),
      unit: row.unit != null ? String(row.unit) : "kg",
      stock_qty: Number(row.stock_qty ?? row.stockQty ?? 0),
      unit_price: Number(row.unit_price ?? row.unitPrice ?? 0),
      notes: row.notes != null ? String(row.notes) : null,
    }));

    const saved = await savePurchasePackItems(items);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: saved }),
    };
  } catch (err: any) {
    console.error("savePurchasePack:", err?.message || err);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err?.message || "Save failed" }),
    };
  }
};

export const handler = requireAdmin(baseHandler);
