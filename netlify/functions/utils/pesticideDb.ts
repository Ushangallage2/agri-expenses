import pool from "../db";
import { toNum } from "./fertilizerDb";

let ensured = false;

export async function ensurePesticideTables() {
  if (ensured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pesticide_sets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      created_by VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_pesticide_sets_name (name)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pesticide_set_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      set_id INT NOT NULL,
      fertilizer_id INT NOT NULL,
      amount DECIMAL(14, 3) NOT NULL DEFAULT 0,
      unit VARCHAR(32) NOT NULL DEFAULT 'ml',
      sort_order INT NOT NULL DEFAULT 0,
      INDEX idx_psi_set (set_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pesticide_use_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      batch_id VARCHAR(64) NOT NULL,
      set_id INT NULL,
      set_name VARCHAR(255) NULL,
      description TEXT NULL,
      note TEXT NULL,
      crop_name VARCHAR(255) NULL,
      applied_at DATETIME NOT NULL,
      created_by VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pul_batch (batch_id),
      INDEX idx_pul_applied (applied_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pesticide_use_lines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      batch_id VARCHAR(64) NOT NULL,
      fertilizer_id INT NOT NULL,
      fertilizer_name VARCHAR(255) NOT NULL,
      amount DECIMAL(14, 3) NOT NULL,
      unit VARCHAR(32) NOT NULL,
      stock_deducted DECIMAL(14, 3) NOT NULL DEFAULT 0,
      stock_unit VARCHAR(32) NULL,
      unit_price DECIMAL(14, 2) NOT NULL DEFAULT 0,
      line_cost DECIMAL(14, 2) NOT NULL DEFAULT 0,
      INDEX idx_pline_batch (batch_id)
    )
  `);

  ensured = true;
}

export type PesticideSetItem = {
  id?: number;
  fertilizer_id: number;
  fertilizer_name?: string | null;
  amount: number;
  unit: string;
  sort_order: number;
  stock_qty?: number;
  unit_price?: number;
  stock_unit?: string;
};

export type PesticideSet = {
  id: number;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  items: PesticideSetItem[];
};

export type PesticideUseLog = {
  id: number;
  batch_id: string;
  set_id: number | null;
  set_name: string | null;
  description: string | null;
  note: string | null;
  crop_name: string | null;
  applied_at: string;
  created_by: string | null;
  created_at: string;
  lines: {
    id: number;
    fertilizer_id: number;
    fertilizer_name: string;
    amount: number;
    unit: string;
    stock_deducted: number;
    stock_unit: string | null;
    unit_price: number;
    line_cost: number;
  }[];
  total_cost: number;
};

export function mapSetItem(row: Record<string, unknown>): PesticideSetItem {
  return {
    id: row.id != null ? Number(row.id) : undefined,
    fertilizer_id: Number(row.fertilizer_id),
    fertilizer_name:
      row.fertilizer_name != null ? String(row.fertilizer_name) : null,
    amount: toNum(row.amount),
    unit: String(row.unit || "ml"),
    sort_order: Number(row.sort_order) || 0,
    stock_qty: row.stock_qty != null ? toNum(row.stock_qty) : undefined,
    unit_price: row.unit_price != null ? toNum(row.unit_price) : undefined,
    stock_unit: row.stock_unit != null ? String(row.stock_unit) : undefined,
  };
}

export function mapSet(
  row: Record<string, unknown>,
  items: PesticideSetItem[]
): PesticideSet {
  return {
    id: Number(row.id),
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    created_by: row.created_by != null ? String(row.created_by) : null,
    created_at: String(row.created_at),
    items,
  };
}

export async function listPesticideSets(): Promise<PesticideSet[]> {
  await ensurePesticideTables();
  const sets = await pool.query(
    `SELECT id, name, description, created_by, created_at
     FROM pesticide_sets
     ORDER BY name ASC, id ASC`
  );
  const out: PesticideSet[] = [];
  for (const row of sets.rows) {
    const items = await pool.query(
      `SELECT i.id, i.set_id, i.fertilizer_id, i.amount, i.unit, i.sort_order,
              f.name AS fertilizer_name, f.stock_qty, f.unit_price, f.unit AS stock_unit
       FROM pesticide_set_items i
       LEFT JOIN fertilizers f ON f.id = i.fertilizer_id
       WHERE i.set_id = $1
       ORDER BY i.sort_order ASC, i.id ASC`,
      [row.id]
    );
    out.push(
      mapSet(
        row as Record<string, unknown>,
        items.rows.map((r) => mapSetItem(r as Record<string, unknown>))
      )
    );
  }
  return out;
}

export async function listPesticideUseLogs(
  limit = 80
): Promise<PesticideUseLog[]> {
  await ensurePesticideTables();
  const safeLimit = Math.min(200, Math.max(1, Math.floor(Number(limit) || 80)));
  const logs = await pool.query(
    `SELECT id, batch_id, set_id, set_name, description, note, crop_name,
            applied_at, created_by, created_at
     FROM pesticide_use_logs
     ORDER BY applied_at DESC, id DESC
     LIMIT ${safeLimit}`
  );

  const out: PesticideUseLog[] = [];
  for (const row of logs.rows) {
    const batchId = String(row.batch_id);
    const linesRes = await pool.query(
      `SELECT id, fertilizer_id, fertilizer_name, amount, unit,
              stock_deducted, stock_unit, unit_price, line_cost
       FROM pesticide_use_lines
       WHERE batch_id = $1
       ORDER BY id ASC`,
      [batchId]
    );
    const lines = linesRes.rows.map((r: any) => ({
      id: Number(r.id),
      fertilizer_id: Number(r.fertilizer_id),
      fertilizer_name: String(r.fertilizer_name),
      amount: toNum(r.amount),
      unit: String(r.unit),
      stock_deducted: toNum(r.stock_deducted),
      stock_unit: r.stock_unit != null ? String(r.stock_unit) : null,
      unit_price: toNum(r.unit_price),
      line_cost: toNum(r.line_cost),
    }));
    const total_cost = Number(
      lines.reduce((s, l) => s + l.line_cost, 0).toFixed(2)
    );
    out.push({
      id: Number(row.id),
      batch_id: batchId,
      set_id: row.set_id != null ? Number(row.set_id) : null,
      set_name: row.set_name != null ? String(row.set_name) : null,
      description: row.description != null ? String(row.description) : null,
      note: row.note != null ? String(row.note) : null,
      crop_name: row.crop_name != null ? String(row.crop_name) : null,
      applied_at: String(row.applied_at),
      created_by: row.created_by != null ? String(row.created_by) : null,
      created_at: String(row.created_at),
      lines,
      total_cost,
    });
  }
  return out;
}
