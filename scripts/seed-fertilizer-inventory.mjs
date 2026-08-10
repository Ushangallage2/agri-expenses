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

const LEGACY_PEPPER_NAME = "Pepper fertilizer";
const PEPPER_MIXTURES_NAME = "Pepper Fertilizer Mixtures";

/** Albert covers Fe/B — remove these so they do not clutter inventory. */
const RETIRED_INVENTORY_NAMES = [
  "FeSO4",
  "FeSO₄",
  "Iron sulfate",
  "Iron sulphate",
  "Ferrous sulfate",
  "Ferrous sulphate",
  "Borax",
];

const STARTER_PURCHASE_PACK = [
  {
    name: PEPPER_MIXTURES_NAME,
    unit: "kg",
    stock_qty: 40,
    unit_price: 0,
    notes: "N14-P11-K14-Mg2 · monsoon schedule (g/plant). Stock 40 kg.",
  },
  {
    name: "Dolomite",
    unit: "kg",
    stock_qty: 3,
    unit_price: 30,
    notes: "Bought — 3 kg @ 90/pack → 30/kg",
  },
  {
    name: "Superphosphate",
    unit: "kg",
    stock_qty: 3,
    unit_price: 300,
    notes: "Bought — 3 kg @ 900/pack → 300/kg",
  },
  {
    name: "Urea",
    unit: "kg",
    stock_qty: 2,
    unit_price: 310,
    notes: "Bought — 2 kg @ 620/pack → 310/kg",
  },
  {
    name: "Sulfate of Potash (SOP)",
    unit: "kg",
    stock_qty: 2,
    unit_price: 0,
    notes: "Bought — 2 kg",
  },
  {
    name: "NPK 19:19:19",
    unit: "kg",
    stock_qty: 2,
    unit_price: 600,
    notes: "Bought — 2 kg @ 1200/pack → 600/kg",
  },
  {
    name: "Compost",
    unit: "kg",
    stock_qty: 20,
    unit_price: 40,
    notes: "Bought — 20 kg @ 800/pack → 40/kg",
  },
  {
    name: "Albert solution",
    unit: "kg",
    stock_qty: 2,
    unit_price: 2300,
    notes:
      "Bought — 2 kg @ 2300/kg (1 kg pack = 2300). Water-soluble balanced fertilizer (~N 10.5%, P₂O₅ 9%, K₂O 16%, Ca ~10%, Mg ~1–2%) with micros (Fe, Mn, Zn, Cu, B). Covers Fe/B — no separate FeSO₄/Borax stock.",
  },
  {
    name: "MgSO4 (Epsom salt)",
    unit: "kg",
    stock_qty: 5,
    unit_price: 0,
    notes: "Bought — 5 kg. Foliar: 150 g / 10 L",
  },
  {
    name: "ZnSO4",
    unit: "kg",
    stock_qty: 0,
    unit_price: 0,
    notes: "Micronutrient foliar: 5 g / 10 L (Zn boost; Albert covers Fe/B)",
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

async function migrateLegacyPepperName(conn) {
  const [oldRows] = await conn.execute(
    "SELECT id FROM fertilizers WHERE name = ?",
    [LEGACY_PEPPER_NAME]
  );
  if (!oldRows.length) return;

  const [newRows] = await conn.execute(
    "SELECT id FROM fertilizers WHERE name = ?",
    [PEPPER_MIXTURES_NAME]
  );

  if (!newRows.length) {
    await conn.execute("UPDATE fertilizers SET name = ? WHERE id = ?", [
      PEPPER_MIXTURES_NAME,
      oldRows[0].id,
    ]);
    console.log(`  renamed  ${LEGACY_PEPPER_NAME} → ${PEPPER_MIXTURES_NAME}`);
    return;
  }

  const oldId = oldRows[0].id;
  const newId = newRows[0].id;
  try {
    await conn.execute(
      "UPDATE fertilizer_applications SET fertilizer_id = ? WHERE fertilizer_id = ?",
      [newId, oldId]
    );
  } catch {
    /* table may not exist yet */
  }
  try {
    await conn.execute(
      "UPDATE fertilizer_schedule_steps SET suggested_fertilizer_id = ? WHERE suggested_fertilizer_id = ?",
      [newId, oldId]
    );
  } catch {
    /* ignore */
  }
  try {
    await conn.execute(
      "DELETE FROM fertilizer_price_history WHERE fertilizer_id = ?",
      [oldId]
    );
  } catch {
    /* ignore */
  }
  await conn.execute("DELETE FROM fertilizers WHERE id = ?", [oldId]);
  console.log(
    `  merged   ${LEGACY_PEPPER_NAME} into ${PEPPER_MIXTURES_NAME} (removed duplicate)`
  );
}

async function retireObsoleteInventory(conn) {
  if (!RETIRED_INVENTORY_NAMES.length) return;
  const placeholders = RETIRED_INVENTORY_NAMES.map(() => "?").join(", ");
  const [rows] = await conn.execute(
    `SELECT id, name FROM fertilizers WHERE name IN (${placeholders})`,
    RETIRED_INVENTORY_NAMES
  );

  for (const row of rows) {
    const id = row.id;
    try {
      await conn.execute(
        "UPDATE fertilizer_schedule_steps SET suggested_fertilizer_id = NULL WHERE suggested_fertilizer_id = ?",
        [id]
      );
    } catch {
      /* ignore */
    }
    try {
      await conn.execute(
        "DELETE FROM fertilizer_price_history WHERE fertilizer_id = ?",
        [id]
      );
    } catch {
      /* ignore */
    }
    await conn.execute("DELETE FROM fertilizers WHERE id = ?", [id]);
    console.log(`  retired  ${row.name} (Albert covers Fe/B micros)`);
  }
}

async function syncWeek3MicronutrientInstructions(conn) {
  const instructions =
    "Per 10 L: ZnSO₄ 5 g + Albert solution 5 g (covers Fe, B & other micros) + Teepol/Sandovit 2–5 mL. " +
    "No separate FeSO₄/Borax — Albert provides Fe/B. Dissolve separately, then combine. Spray AM/PM only.";
  try {
    const [result] = await conn.execute(
      `UPDATE fertilizer_schedule_steps
       SET instructions = ?, suggested_amount = ?, unit = ?
       WHERE week_number = 3 AND title LIKE ?`,
      [instructions, 10, "g/10L", "%micronutrient%"]
    );
    const n = result?.affectedRows || 0;
    if (n) console.log(`  synced   week-3 micronutrient instructions (${n} step(s))`);
  } catch {
    /* schedule tables may not exist yet */
  }
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
    await migrateLegacyPepperName(conn);
    await retireObsoleteInventory(conn);
    await syncWeek3MicronutrientInstructions(conn);

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

        if (mode === "set") {
          await conn.execute(
            "UPDATE fertilizers SET stock_qty = ?, unit = ?, unit_price = ?, notes = ? WHERE id = ?",
            [next, item.unit, item.unit_price, item.notes, id]
          );
          if (item.unit_price > 0) {
            try {
              await conn.execute(
                "INSERT INTO fertilizer_price_history (fertilizer_id, price, recorded_at) VALUES (?, ?, NOW())",
                [id, item.unit_price]
              );
            } catch {
              /* history table may not exist */
            }
          }
        } else {
          await conn.execute(
            "UPDATE fertilizers SET stock_qty = ?, unit = ?, notes = ? WHERE id = ?",
            [next, item.unit, item.notes, id]
          );
        }
        console.log(
          `  updated  ${item.name.padEnd(32)} → ${next} ${item.unit}` +
            (mode === "set" ? ` @ ${item.unit_price}/${item.unit}` : "")
        );
      } else {
        await conn.execute(
          "INSERT INTO fertilizers (name, unit, stock_qty, unit_price, notes) VALUES (?, ?, ?, ?, ?)",
          [item.name, item.unit, item.stock_qty, item.unit_price, item.notes]
        );
        console.log(
          `  created  ${item.name.padEnd(32)} → ${item.stock_qty} ${item.unit}` +
            (item.unit_price > 0 ? ` @ ${item.unit_price}/${item.unit}` : "")
        );
      }
    }

    console.log(
      "\nDone. Inventory matches purchase pack + 40 kg Pepper Fertilizer Mixtures + 5 kg MgSO4."
    );
    console.log(
      "FeSO₄ / Borax removed (Albert solution covers Fe, B, and other micros)."
    );
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
