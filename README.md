# Agri Ledger

Private farm bookkeeping for crop seasons — income, expenses, fertilizer, pesticides, and per-plant notes in one place.

Built for pepper, turmeric, and similar field work. Sign in, record money as it moves, and keep the week-by-week field plan next to the ledger.

Live site: [agriexpenses.netlify.app](https://agriexpenses.netlify.app)

---

## Who it is for

- Farm operators who need a clear profit picture per crop
- Admins who enter spending, stock, and field notes
- Observe accounts for demos or read-only review (money figures stay blurred)

---

## What you can do

### Ledger
- Record income and expenses against a **user**, **reason**, **crop**, and date
- Dashboard rings show profit for the whole ledger, each crop, and each user
- Attach receipts, edit or reorder rows, close a plantation when the season ends
- Spent-per-plant KPIs use the live plant count (or the close snapshot)

### Crops
- Notes and todos per crop (including fertilizer due reminders)
- Crop photo gallery
- Plant count history and close / reopen
- Per-crop fertilizer shortcut

### Individual plants
- On a crop page, **Open plant map**
- Cinema-style tiles — one seat per plant
- Click a plant for its own notes, todos, and photos
- Tiles show whether that plant has history or an open todo

### Fertilizer & pesticides
- Inventory, purchases, schedules, and apply logs
- Week plans, partial vine applies, price snapshots
- Pesticide mixes you can save and reuse

### Reports
- **Export statement** (admin): filter the record table by crop, reason, user, type, and date range, then download an official Agri Ledger invoice as **PDF**, **Word (.docx)**, or **CSV** — totals plus summaries by crop, user, and reason
- **Email reports** (admin): weekly or monthly summaries in the same official style

### Access
- **Admin** — full write access
- **Observe** — view only; amounts blurred

---

## How to run locally

You need Node 20, a MySQL database, and a `.env` file.

```bash
cp .env.example .env
# edit DATABASE_URL and JWT_SECRET

npm install
npm run create-admin          # first time: prints a generated admin password
npm run dev                   # http://localhost:8888
```

`npm run dev` starts Vite behind Netlify functions. Restart it after pulling new functions (for example `getPlantMap` or `exportLedger`).

Optional:

```bash
npm run create-observe        # observe / observe123
npm run seed-fertilizer
```

---

## Project shape

| Path | Role |
|------|------|
| `src/pages/` | Screens (dashboard, crop notes, plant map, fertilizer, export) |
| `src/components/` | Shared UI |
| `netlify/functions/` | API + MySQL |
| `scripts/` | Admin user, fertilizer seed |

Stack: React 19, TypeScript, Vite, Tailwind, Netlify Functions, MySQL.

---

## Typical path

1. Sign in as admin
2. Add users, reasons, and crops
3. Enter ledger rows on the dashboard
4. Open a crop → set plant count → plant map for individual plants
5. Use fertilizer for the week plan
6. **Export** a filtered statement as PDF or Word when you need a budget record
