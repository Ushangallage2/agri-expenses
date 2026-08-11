import pool from "../db";
import { toNum } from "./fertilizerDb";

let ensured = false;

export async function ensureFertilizerStockMutationsTable() {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fertilizer_stock_mutations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fertilizer_id INT NOT NULL,
      reason VARCHAR(64) NOT NULL DEFAULT 'purchase',
      delta_qty DECIMAL(14, 3) NOT NULL,
      prev_qty DECIMAL(14, 3) NOT NULL,
      next_qty DECIMAL(14, 3) NOT NULL,
      prev_price DECIMAL(14, 2) NULL,
      next_price DECIMAL(14, 2) NULL,
      notes TEXT NULL,
      created_by VARCHAR(255) NULL,
      undone TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_fsm_undone_created (undone, created_at DESC),
      INDEX idx_fsm_fertilizer (fertilizer_id)
    )
  `);
  ensured = true;
}

export type StockMutationInput = {
  fertilizerId: number;
  reason: string;
  deltaQty: number;
  prevQty: number;
  nextQty: number;
  prevPrice?: number | null;
  nextPrice?: number | null;
  notes?: string | null;
  createdBy?: string | null;
};

export async function recordStockMutation(
  input: StockMutationInput
): Promise<number> {
  await ensureFertilizerStockMutationsTable();
  const res = await pool.query(
    `INSERT INTO fertilizer_stock_mutations
      (fertilizer_id, reason, delta_qty, prev_qty, next_qty,
       prev_price, next_price, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.fertilizerId,
      input.reason.slice(0, 64),
      input.deltaQty,
      input.prevQty,
      input.nextQty,
      input.prevPrice ?? null,
      input.nextPrice ?? null,
      input.notes ?? null,
      input.createdBy ?? null,
    ]
  );
  return Number(res.rows[0]?.id) || 0;
}

export type UndoResult = {
  id: number;
  fertilizer_id: number;
  fertilizer_name: string;
  reason: string;
  restored_qty: number;
  restored_price: number | null;
};

/**
 * Undo the newest non-undone stock mutation (LIFO).
 * Restores previous qty/price on that fertilizer.
 */
export async function undoLastStockMutation(): Promise<UndoResult | null> {
  await ensureFertilizerStockMutationsTable();

  const latest = await pool.query(
    `SELECT id, fertilizer_id, reason, delta_qty, prev_qty, next_qty,
            prev_price, next_price, notes
     FROM fertilizer_stock_mutations
     WHERE undone = 0
     ORDER BY created_at DESC, id DESC
     LIMIT 1`
  );
  if (!latest.rows[0]) return null;

  const row = latest.rows[0] as {
    id: number;
    fertilizer_id: number;
    reason: string;
    prev_qty: unknown;
    prev_price: unknown;
    next_price: unknown;
  };

  const fert = await pool.query(
    `SELECT id, name, stock_qty, unit_price FROM fertilizers WHERE id = $1`,
    [row.fertilizer_id]
  );
  if (!fert.rows[0]) {
    await pool.query(
      `UPDATE fertilizer_stock_mutations SET undone = 1 WHERE id = $1`,
      [row.id]
    );
    return null;
  }

  const prevQty = toNum(row.prev_qty);
  const prevPrice =
    row.prev_price != null && Number.isFinite(Number(row.prev_price))
      ? toNum(row.prev_price)
      : null;

  if (prevPrice != null) {
    await pool.query(
      `UPDATE fertilizers SET stock_qty = $1, unit_price = $2 WHERE id = $3`,
      [prevQty, prevPrice, row.fertilizer_id]
    );
  } else {
    await pool.query(`UPDATE fertilizers SET stock_qty = $1 WHERE id = $2`, [
      prevQty,
      row.fertilizer_id,
    ]);
  }

  await pool.query(
    `UPDATE fertilizer_stock_mutations SET undone = 1 WHERE id = $1`,
    [row.id]
  );

  return {
    id: Number(row.id),
    fertilizer_id: Number(row.fertilizer_id),
    fertilizer_name: String(fert.rows[0].name),
    reason: String(row.reason),
    restored_qty: prevQty,
    restored_price: prevPrice,
  };
}

export async function countUndoableStockMutations(): Promise<number> {
  await ensureFertilizerStockMutationsTable();
  const res = await pool.query(
    `SELECT COUNT(*) AS c FROM fertilizer_stock_mutations WHERE undone = 0`
  );
  return Number(res.rows[0]?.c) || 0;
}
