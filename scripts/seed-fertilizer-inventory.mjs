/**
 * Seed fertilizer inventory from the purchase pack into MySQL.
 *
 *   node scripts/seed-fertilizer-inventory.mjs
 *   node scripts/seed-fertilizer-inventory.mjs --mode set
 *
 * --mode set        → force stock to pack amounts (default)
 * --mode add_if_zero → only fill when stock is 0 / create missing
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const STARTER_PURCHASE_PACK = [
  {
    name: "Pepper fertilizer",
    unit: "kg",
    stock_qty: 25,
    unit_price: 0,
    notes:
      "BASE feed — usual pepper special mix. Apply every 6–8 weeks. Stock: 25 kg remaining.",
  },
  {
    name: "Dolomite",
    unit: "kg",
    stock_qty: 3,
    unit_price: 0,
    notes: "Bought — 3 kg (soil calcium / pH)",
  },
  {
    name: "Superphosphate",
    unit: "kg",
    stock_qty: 3,
    unit_price: 0,
    notes: "Bought — 3 kg",
  },
  {
    name: "Urea",
    unit: "kg",
    stock_qty: 2,
    unit_price: 0,
    notes: "Bought — 2 kg (prefer root drench)",
  },
  {
    name: "Sulfate of Potash (SOP)",
    unit: "kg",
    stock_qty: 2,
    unit_price: 0,
    notes: "Bought — 2 kg (use SOP, avoid MOP)",
  },
  {
    name: "NPK 19:19:19",
    unit: "kg",
    stock_qty: 2,
    unit_price: 0,
    notes: "Bought — 2 kg",
  },
  {
    name: "Compost",
    unit: "kg",
    stock_qty: 20,
    unit_price: 0,
    notes: "Bought — 20 kg",
  },
  {
    name: "Albert solution",
    unit: "kg",
    stock_qty: 2,
    unit_price: 0,
    notes: "Bought — 2 kg",
  },
  {
    name: "MgSO4 (Epsom salt)",
    unit: "kg",
    stock_qty: 0,
    unit_price: 0,
    notes: "Foliar: 150 g / 10 L — restock when bought",
  },
  {
    name: "ZnSO4",
    unit: "kg",
    stock_qty: 0,
    unit_price: 0,
    notes: "Micronutrient foliar: 5 g / 10 L",
  },
  {
    name: "FeSO4",
    unit: "kg",
    stock_qty: 0,
    unit_price: 0,
    notes: "Micronutrient foliar: 5 g / 10 L",
  },
  {
    name: "Borax",
    unit: "kg",
    stock_qty: 0,
    unit_price: 0,
    notes: "Micronutrient foliar: 1 g / 10 L",
  },
];

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseDatabaseUrl(url) {
  const cleaned = url
    .replace(/[?&]ssl-mode=[^&]*/gi, "")
    .replace(/\?$/, "")
    .trim();
  const u = new URL(cleaned);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    ssl: { rejectUnauthorized: false },
  };
}

async function main() {
  loadEnvFile();
  const mode = process.argv.includes("--mode")
    ? process.argv[process.argv.indexOf("--mode") + 1]
    : "set";

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL missing in .env");
    process.exit(1);
  }

  const conn = await mysql.createConnection(parseDatabaseUrl(databaseUrl));
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS fertilizers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        unit VARCHAR(32) NOT NULL DEFAULT 'kg',
        stock_qty DECIMAL(14, 3) NOT NULL DEFAULT 0,
        unit_price DECIMAL(14, 2) NOT NULL DEFAULT 0,
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_fertilizers_name (name)
      )
    `);

    console.log(`Seeding fertilizer inventory (mode=${mode})…\n`);

    for (const item of STARTER_PURCHASE_PACK) {
      const [rows] = await conn.execute(
        "SELECT id, stock_qty FROM fertilizers WHERE name = ?",
        [item.name]
      );

      if (rows.length) {
        const id = rows[0].id;
        const current = Number(rows[0].stock_qty) || 0;
        let next = current;
        if (mode === "set") next = item.stock_qty;
        else if (mode === "add_if_zero" && current <= 0) next = item.stock_qty;

        await conn.execute(
          "UPDATE fertilizers SET stock_qty = ?, unit = ?, notes = ? WHERE id = ?",
          [next, item.unit, item.notes, id]
        );
        console.log(`  updated  ${item.name.padEnd(28)} → ${next} ${item.unit}`);
      } else {
        await conn.execute(
          "INSERT INTO fertilizers (name, unit, stock_qty, unit_price, notes) VALUES (?, ?, ?, ?, ?)",
          [item.name, item.unit, item.stock_qty, item.unit_price, item.notes]
        );
        console.log(
          `  created  ${item.name.padEnd(28)} → ${item.stock_qty} ${item.unit}`
        );
      }
    }

    console.log("\nDone. Inventory matches your purchase note + 25 kg pepper fertilizer.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
