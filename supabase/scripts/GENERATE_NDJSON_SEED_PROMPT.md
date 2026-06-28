# Prompt: Generate XYVOO HMS hotel NDJSON seed (schema-aligned)

Copy everything below the line into your data-generation AI. Replace bracketed placeholders first.

---

You are generating **six NDJSON seed files** for the XYVOO HMS (Next.js + Supabase) project. Files must live at the **workspace root** (the folder that contains `xyvoo-next/`), **not** inside `xyvoo-next/`, with these exact names:

- `seed_part_1.ndjson` … `seed_part_6.ndjson`

After generation, the developer will run (from `xyvoo-next/`):

1. `node supabase/scripts/fix-seed-ndjson.mjs` — normalizes and re-buckets rows into the six parts (optional if you already match schema exactly).
2. `node supabase/scripts/load-seed-ndjson.mjs --wipe-first <TENANT_UUID>` — inserts into `hotel` schema.

Use placeholder tenant id **`{{TENANT_UUID}}`** on every row that has `tenant_id` (the loader replaces it).

---

## Firefly (slug `firefly`) — use this inventory exactly

**Tenant (for reference; still use `{{TENANT_UUID}}` in files):**  
`41604dc6-9ce1-49bd-a0bb-5aa777ec7463` · name `firefly` · display **Firefly** · subdomain `firefly`.

**Total keys N = 71** (must match floor plan target).

**Floors and key counts (assign `room_units.floor` + one row per key; `room_code` unique per tenant):**

| Floor | Room count |
|------:|-----------:|
| 1 | 18 |
| 2 | 18 |
| 3 | 18 |
| 4 | 17 |

**`room_type_code` on every `room_unit` and on every `reservation`:** must equal **`public.tenants.room_types[].id`** for Firefly (same string the UI uses). Use these ids and **physical counts** (sorted by numeric `room_code`, then assign in blocks — totals must sum to 71):

| Display name (tenant `room_types`) | `id` (`room_type_code`) | Key count |
|------------------------------------|-------------------------|----------:|
| Standard | `3395f8e0-a192-4048-801a-fd28114b0bdd` | 14 |
| Super Standard | `e957016a-5bfe-4822-aad1-d06926850cc2` | 18 |
| Queen | `9c7846c8-f51f-4013-8e09-bfab4a202429` | 11 |
| King | `bd94f32a-0d1b-498d-b020-97440a375571` | 16 |
| Suite | `246f11af-e886-421b-a3c4-dec34e46b8be` | 12 |

When `reservations.room_unit_id` is set, **`room_type_code` must exactly match** that row’s `room_units.room_type_code`. For unassigned reservations, pick a valid `id` from the table above.

**Reference SQL:** `xyvoo-next/supabase/seed.firefly.sql` (after `node supabase/scripts/patch-firefly-seed-room-type-ids.mjs`) matches this model.

**Pricing / rates:** align `rate_per_night` with the chosen type’s `baseRate` where helpful (NGN).

---

## File layout (each file)

First lines are a **header** (exact pattern):

```
TENANT_ID_PLACEHOLDER: {{TENANT_UUID}}

--- PART N of 6 — <short label> ---
```

Then **one JSON object per line** (newline-delimited JSON). No JSON arrays wrapping the file.

**Suggested content split** (loader re-classifies by row shape; this split matches the existing toolchain):

| Part | Contents |
|------|----------|
| 1 | All `room_units` + all `guests` |
| 2–4 | All `reservations` (split roughly in thirds across files) |
| 5 | `reservation_guests` + first half of `folio_transactions` |
| 6 | Second half of `folio_transactions` |

---

## How rows are classified (must match these shapes)

The Node loader **infers table** from object keys:

1. **`hotel.folio_transactions`** — object has `kind` equal to one of: `charge`, `payment`, `discount`, `refund`, `transfer`.
2. **`hotel.room_units`** — object has both `room_code` and `floor` (integers). Do **not** put `confirmation_code` on room rows.
3. **`hotel.reservations`** — object has `confirmation_code`.
4. **`hotel.reservation_guests`** — object has `reservation_id`, `guest_id`, and boolean `is_primary` (and **no** `confirmation_code`, **no** `kind`).
5. **`hotel.guests`** — object has `id_type` and `first_name` (and is not classified as folio / room / reservation / reservation_guest above).

**Foreign keys (strict):**

- Every `reservations.room_unit_id` (if not null) must reference an existing `room_units.id`.
- Every `reservation_guests.reservation_id` / `guest_id` must exist.
- Every `folio_transactions.reservation_id` must exist.

**Uniqueness per tenant** (enforce with distinct values):

- `room_units`: unique `(tenant_id, room_code)`.
- `reservations`: unique `(tenant_id, confirmation_code)`, `(tenant_id, folio_number)`, `(tenant_id, registration_number)`.
- `reservation_guests`: unique `(reservation_id, guest_id)`.

Use **v4 UUIDs** for all `id` fields.

---

## Enum and field constraints (PostgreSQL `hotel` schema)

### `hotel.room_units`

- `status` ∈ `occupied` | `vacant_clean` | `dirty` | `inspected` | `maintenance` | `out_of_order` | `cleaning_in_progress` | `ready_for_occupancy`
- `floor` int, `room_code` text, **`room_type_code`** = a `public.tenants.room_types[].id` for the tenant (Firefly: use the five UUIDs and counts in the Firefly section above).

### `hotel.guests`

- `id_type` ∈ `passport` | `national_id` | `drivers_license`
- `nationality`: **2-letter** ISO code (e.g. `NG`, `US`)
- `preferred_channel` ∈ `email` | `phone` | `whatsapp` | `sms`
- `gender` null or ∈ `female` | `male` | `other` | `unspecified`
- `tags`: JSON array (can be `[]`)

### `hotel.reservations`

- `status` ∈ `confirmed` | `checked_in` | `checked_out` | `cancelled` | `no_show`
- `purpose_of_visit` ∈ `leisure` | `business` | `transit`
- `rate_type` ∈ `rack` | `corporate` | `walk_in_bar` | `promotional`
- `settlement_method` ∈ `cash` | `card` | `split` | `direct_bill`
- `market_segment` ∈ `transient` | `corporate` | `group` | `government` | `wholesale`
- `source` ∈ `walk_in` | `phone` | `referral` | `ota` | `website` | `travel_agent`
- `children_json`: JSON array (e.g. `[]`)
- `arrival_at`, `departure_at`: ISO-8601 **timestamptz** strings; `nights` consistent with dates
- In-house stays: `status: "checked_in"`, set `checked_in_at`, `departure_at` **in the future** relative to “today” (**use a fixed anchor date** e.g. `2026-05-27` as “today” and document it in a comment line only if needed — **comments are not allowed inside NDJSON**; instead bake dates into JSON so arrivals for “current” stays are ≤ anchor and departures > anchor)
- Past stays: `status: "checked_out"`, `checked_out_at` ≤ anchor, `departure_at` ≤ `checked_out_at`
- Upcoming (“coming soon”): `status: "confirmed"`, `arrival_at` **> anchor** (e.g. next 3–21 days), `checked_in_at` null

### `hotel.folio_transactions`

- `kind` ∈ `charge` | `payment` | `discount` | `refund` | `transfer`
- `method` ∈ `cash` | `card` | `split` | `direct_bill` | `refund` | `system`
- `status` ∈ `posted` | `pending` | `failed` | `refund_pending`
- `split_leg` ∈ `guest` | `company` (never null — use `guest` if unsure)
- `amount` numeric; **charges/discounts** positive/negative per your convention — match existing app expectations: **payments** typically negative, **charges** positive (see migration `20260602120000_folio_phase10.sql` in repo)
- `currency_code` default `NGN`, `metadata` object `{}` if empty

---

## Business mix (required)

Let **N** = total number of `room_units` rows (inventory). For Firefly, **N = 71** (fixed).

### A) Current in-house occupancy (**63% of N**)

- Select **⌊0.63 × N⌋** rooms (or **round** — state which; prefer closest integer summing with other buckets to **N**).
- For each such room:
  - `room_units.status` = **`occupied`**
  - One **`checked_in`** reservation with `room_unit_id` = that room’s `id`, `arrival_at` before anchor “today”, `departure_at` after “today”, `checked_in_at` set, `digital_key_issued` true/false consistently.
- Each such reservation needs at least one **`reservation_guest`** row and realistic **`folio_transactions`** (room charges + a payment or balance).

### B) Upcoming reservations — “coming soon” (**20% of N**)

- Use **disjoint** rooms from the 63% occupied set (pick from the remaining **~37%** of keys).
- Create **⌊0.20 × N⌋** (or rounded) reservations with `status: "confirmed"`, `arrival_at` **after** anchor “today”, realistic `departure_at`, assign **`room_unit_id`** to those rooms.
- For those rooms, **`room_units.status`** should remain turn-ready until arrival — use **`vacant_clean`**, **`ready_for_occupancy`**, or **`inspected`** (not `occupied`).

### C) Remaining keys (~**17% of N** unless rounding adjusts)

- Distribute `room_units.status` across **`dirty`**, **`vacant_clean`**, **`inspected`**, **`cleaning_in_progress`**, **`maintenance`**, **`out_of_order`** with a believable housekeeping mix (majority vacant_clean/dirty/inspected; few maintenance/OOS).
- No conflicting overlapping reservations on the same `room_unit_id` for overlapping nights.

### D) Historic depth — **150 past stays**

- At least **150** distinct reservations with `status: "checked_out"` (and a few `cancelled` / `no_show` optional), **all** with `departure_at` and `checked_out_at` **before** anchor “today”.
- Spread check-out dates over the **last 180–365 days**.
- Each should have `reservation_guests` + multiple `folio_transactions` where reasonable (room charge, tax line, payment).
- Past stays may use **`room_unit_id`** that still exists (historical) or null if your model allows — **prefer assigned `room_unit_id`** for realism, with dates that do not overlap other reservations on the same room.

---

## Volume checklist

- `room_units`: **N** rows  
- `guests`: enough unique guests for in-house + upcoming + historic (reuse guests only if the schema allows multiple reservations per guest over time — **same guest can appear on many reservations** via different `reservation_guests` rows).  
- `reservations`: **150+** historic checked_out + in-house + upcoming + optional extras  
- `reservation_guests`: ≥ 1 primary per reservation (`is_primary: true` for exactly one guest per reservation recommended)  
- `folio_transactions`: proportional; every `checked_in` and `checked_out` should have folio activity  

---

## Consistency rules the app cares about

- **In-house** reservations: `checked_in_at` not null, `status === "checked_in"`, linked `room_unit` **occupied** when the UI expects key-level occupancy.
- **Upcoming**: `confirmed`, no `checked_in_at`.
- **Room type alignment**: when `reservations.room_unit_id` is set, `reservations.room_type_code` must **exactly match** that room’s `room_type_code` (same `room_types[].id` string).
- Use stable **confirmation_code** (unique), **folio_number**, **registration_number** strings per reservation.

---

## Output

Produce the **raw contents** of `seed_part_1.ndjson` … `seed_part_6.ndjson` as six separate code blocks or files, each starting with the header lines above, `tenant_id: "{{TENANT_UUID}}"` on all tenant-scoped rows.

Do not invent columns that are not in the loader’s `pick*` functions unless they are optional and JSON-compatible; prefer the **minimal superset** that `fix-seed-ndjson.mjs` and `load-seed-ndjson.mjs` accept (mirror field names from existing repo seeds if samples are provided).

---

## Placeholder for the human

- **`[ANCHOR_DATE_ISO]`** — e.g. `2026-05-27T12:00:00.000Z` as “today” for all relative dates (paste once at the top of your message to the generator).

Firefly tenant id, slug, floor mix, and **STD / DLX / JST / STE** counts are already specified above — no other room-type list is required for NDJSON.

---

_End of prompt._
