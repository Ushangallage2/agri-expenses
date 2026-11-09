# Agri Ledger → multi-farmer product (`sellerProduction`)

This branch turns the single-owner Agri Ledger into a product multiple farmers can
sign up for. Two ideas drive it:

1. **Self-service accounts** — a farmer can create their own login without an
   admin provisioning them.
2. **"Generalisation"** — separate *shared knowledge* (what fertilizers/pesticides
   are, what they do, and the cycles for applying them) from *private data* (a
   farm's own inventory amounts, prices, ledger and photos). Everyone shares the
   knowledge; nobody sees anyone else's numbers.

Everything is organised around a **tenant** we call a `farm`.

---

## What this increment delivers (Phase 1)

### Multi-tenant foundation
- New `farms` table (one row per tenant).
- `users.farm_id` column; every user belongs to one farm. Legacy rows are
  backfilled to a stable **Default Farm** (`id = 1`) so the existing app keeps
  working.
- JWTs now carry `farmId` (added in `login` and `signup`), and `AuthUser`
  exposes `farmId`, so per-request code can tell which tenant is calling.
- `netlify/functions/utils/farmsDb.ts` — schema bootstrap + `createFarm`.

### Self-service signup
- `netlify/functions/signup.ts` — public endpoint that creates a **new farm +
  its first admin user** and logs them in (same cookie as `login`).
- `src/pages/Signup.tsx` at `/signup`, linked from the login page.

### Shared Knowledge Base (global, NOT per-farm)
- `netlify/functions/utils/knowledgeBaseDb.ts` — `kb_fertilizers`,
  `kb_pesticides`, `kb_schedules`, `kb_schedule_steps`, with an **idempotent
  seed** derived from the existing recipes in `fertilizerRecipes.ts` plus curated
  fertilizer/pesticide references. The seed stores **knowledge only** — names,
  composition, what-it-does, how-to-use and recommended per-plant/per-tank cycles
  — and deliberately omits stock quantities, prices and purchase notes.
- `netlify/functions/getKnowledgeBase.ts` — read API for any signed-in user.
- `src/pages/KnowledgeBase.tsx` at `/knowledge`, linked from the dashboard nav.

---

## Shared vs. private — table classification

**Shared (global, same for all farms) — the knowledge:**
`kb_fertilizers`, `kb_pesticides`, `kb_schedules`, `kb_schedule_steps`.

**Private (must be scoped by `farm_id`) — the farmer's own data:**
`expenses`, `crops`, `reasons`, `saved_amounts`, `crop_notes`,
`crop_fertilizer_notes`, `crop_images`, `crop_plant_count_history`,
`fertilizers` (inventory amounts/prices), `fertilizer_price_history`,
`fertilizer_schedules`, `fertilizer_schedule_steps`, `fertilizer_applications`,
`fertilizer_stock_mutations`, `fertilizer_rate_config`, `purchase_pack_items`,
`pesticide_sets`, `pesticide_set_items`, `pesticide_use_logs`,
`pesticide_use_lines`, `summary_emails`, `summary_settings`.

Note the symmetry: the **catalog** of a fertilizer (its name and what it does)
is shared knowledge; a **farm's stock and price** for that fertilizer is private.

---

## Phase 2 — remaining work to reach true isolation

Phase 1 establishes the tenant model and the shared/private split, but the
per-farm data tables above are **not yet filtered by `farm_id`**. Until that
lands, multiple farms still read/write the same rows. The rollout:

1. **Schema:** add `farm_id INT NOT NULL DEFAULT 1` to each private table (with an
   index), backfilling existing rows to the Default Farm. Do this in the same
   `ensure*` helpers that already create these tables.
2. **Reads:** add `WHERE farm_id = :farmId` to every `get*` query, taking
   `farmId` from `resolveAuthUser(event).farmId`.
3. **Writes:** stamp `farm_id = :farmId` on every `INSERT`, and add
   `AND farm_id = :farmId` to every `UPDATE`/`DELETE` so one farm can never touch
   another's row by id.
4. **Uniqueness:** change global unique keys to be per-farm — e.g.
   `users.username`, `crops.name`, `fertilizers.name`, `reasons.reason` become
   `UNIQUE (farm_id, …)`. This also lets two farms use the same username.
5. **"Copy from knowledge":** add an action that turns a `kb_fertilizer` into a
   row in the farm's private `fertilizers` inventory (the farmer then fills in
   their own stock and price).
6. **Roles/billing (later):** per-farm roles, invites, and a subscription/billing
   layer for the hosted product.

A central helper (e.g. `withFarmScope(event)`) returning the caller's `farmId`
plus small query builders will keep step 2–3 consistent across the ~70 functions.

---

## Testing notes

- `signup` → creates a farm + admin and logs in; `login` continues to work and
  now embeds `farmId`.
- `getKnowledgeBase` returns the seeded fertilizers, pesticides and cycles and is
  identical regardless of which farm is signed in.
- The KB seed is idempotent (`ON DUPLICATE KEY UPDATE` / rebuild-steps), so cold
  starts converge without duplicating content.
