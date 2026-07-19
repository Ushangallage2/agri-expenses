import pool from "../db";

let ensured = false;

export async function ensureExpenseReceiptColumns() {
  if (ensured) return;
  try {
    await pool.query(
      `ALTER TABLE expenses ADD COLUMN receipt_data MEDIUMTEXT NULL`
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(msg)) throw err;
  }
  try {
    await pool.query(
      `ALTER TABLE expenses ADD COLUMN receipt_mime VARCHAR(64) NULL`
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(msg)) throw err;
  }
  ensured = true;
}

export function normalizeReceipt(
  receiptData: unknown,
  receiptMime: unknown
): { data: string; mime: string } | null {
  if (typeof receiptData !== "string" || !receiptData.startsWith("data:")) {
    return null;
  }
  if (receiptData.length > 1_500_000) {
    throw new Error("Receipt image too large");
  }
  const mime =
    typeof receiptMime === "string" && receiptMime.startsWith("image/")
      ? receiptMime
      : "image/jpeg";
  return { data: receiptData, mime };
}
