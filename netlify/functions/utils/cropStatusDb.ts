import pool from "../db";

let ensured = false;

async function addColumn(sql: string) {
  try {
    await pool.query(sql);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(msg)) throw err;
  }
}

/** Soft-close fields on crops — ALTER on read/write like plant_count. */
export async function ensureCropStatusColumns() {
  if (ensured) return;
  await addColumn(
    `ALTER TABLE crops ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'active'`
  );
  await addColumn(`ALTER TABLE crops ADD COLUMN closed_at DATETIME NULL`);
  await addColumn(
    `ALTER TABLE crops ADD COLUMN closed_plant_count INT NULL`
  );
  await addColumn(
    `ALTER TABLE crops ADD COLUMN closed_income DECIMAL(14,2) NULL`
  );
  await addColumn(
    `ALTER TABLE crops ADD COLUMN closed_expense DECIMAL(14,2) NULL`
  );
  await addColumn(
    `ALTER TABLE crops ADD COLUMN closed_profit DECIMAL(14,2) NULL`
  );
  ensured = true;
}

export type CropMoneySnapshot = {
  income: number;
  expense: number;
  profit: number;
};

/** Live P&L from expenses for a crop (income amount>0, expense amount<0). */
export async function cropMoneySnapshot(
  cropName: string
): Promise<CropMoneySnapshot> {
  const res = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expense
     FROM expenses
     WHERE crop = $1`,
    [cropName]
  );
  const row = res.rows[0] || {};
  const income = Number(row.income) || 0;
  const expense = Number(row.expense) || 0;
  return { income, expense, profit: income - expense };
}

export function isCropClosed(status: unknown): boolean {
  return String(status || "active").toLowerCase() === "closed";
}
