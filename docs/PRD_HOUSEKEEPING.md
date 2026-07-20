# XYVOO HMS — Housekeeping Module
## Product Requirements Document & Implementation Plan

**Module:** 03 — Housekeeping
**Product:** XYVOO HMS (`xyvoo-next`)
**Status:** Draft v1.2 — for review
**Author:** Engineering (drafted with product input)
**Priority:** P0 — closes the gap between the master platform PRD's target for Housekeeping ("run sheets, mobile attendant tasks, supervisor sign-off, live board" — `docs/XYVOO_FULL_PRD.txt` §1.6.9) and today's `[PARTIAL]` implementation (`docs/XYVOO_MODULES_STATUS.txt` §A9)

---

## 1. Executive summary

### 1.1 Design philosophy

A room is not "ready for guest" because someone wiped it down — it is ready because a specific attendant cleaned it, a specific inspector checked it, and the moment it changed hands is on the record. Housekeeping is the department that turns a vacated room back into sellable inventory, and every other department (Front Desk at check-in, Revenue at forecast time, the GM at month-end) trusts Housekeeping's status without walking the floor to verify it. That trust has to be earned by the data model, not assumed by the UI — and it is earned only if Housekeeping is built as the connective tissue between departments it actually is, not a standalone checklist.

Four principles govern this document:

1. **One task per turnover event, not one row per room forever.** Today's `hotel.housekeeping_tasks` table has a hard `unique(room_unit_id)` constraint — a room cleaned twice in the same week silently overwrites its own history, and `assigned_staff_id` is a column nothing in the app ever sets. This PRD replaces "one row per room, ever" with a real, auditable history: one row per cleaning cycle, matching the audit rigor already established elsewhere in the HMS (`hotel.audit_logs`).
2. **Housekeeping should never have to interpret another department's intent by walking the floor.** Checkouts, stayovers, VIP arrivals, priority-clean requests, and guest service requests (extra towels, turndown, allergy-safe bedding) already exist as real data in this codebase — Housekeeping's job is to turn that data into a daily run sheet automatically, not make an attendant re-derive it from memory or a phone call.
3. **Inspection is a separation of duties, not a status label.** A task should not reach `ready` because the same person who cleaned it also clicked "inspected" — a real supervisor sign-off, enforced server-side, is what makes the status meaningful to Front Desk and to an ownership/franchisor audit.
4. **Housekeeping is a hub, not an island.** A room-status change must reach Front Desk (and the GM dashboard) in real time, in both directions. Supply consumption must post through Inventory's real stock ledger — never a shadow number Housekeeping keeps to itself. This is the section of the document that the first draft under-specified, and it is corrected throughout §4.2, §4.3, §4.8, and §7 below.

### 1.2 Scope (v1)

In scope, per the master platform PRD's target for this module and the department head's operational expectations:

- Daily run-sheet auto-generation from checkouts, stayovers, existing priority/VIP flags, and guest-service requests
- Task types (checkout clean, stayover, deep clean, turndown, reinspection) with full history per room
- **Bidirectional, real-time room-status synchronization with Front Desk** — not merely Housekeeping reading Front Desk's data, but Front Desk (and the GM dashboard) always reflecting Housekeeping's current state, and vice versa
- Guest-request awareness: turndown and special-service instructions surfaced on the attendant's task card, with fulfillment written back to the same request record Front Desk already tracks
- Attendant assignment and a mobile-first "my tasks" view
- Supervisor inspection and sign-off, enforced as a distinct role action
- A live, floor/zone-grouped housekeeping board (replacing today's flat, unsorted task list)
- Linen/amenity par-per-room-type tracking and consumption posting against Inventory's real stock ledger, plus a supply-shortage path into Inventory's existing requisition mechanism
- Lost & found logging
- Real, functioning Settings (SLA targets, inspection policy, escalation window, room-type pars) — replacing today's static placeholder checklist
- Productivity and quality reporting

Out of scope for v1 (see §12 for v2 candidates):

- A native/GPS-tracked mobile attendant app — this is a marketing claim (`docs/XYVOO_MODULES_STATUS.txt` §A9) with no native app shell anywhere in this codebase; v1 delivers a mobile-first **responsive web** experience instead
- Payroll, time-clock, or shift-roster mechanics — that is HR's module, not Housekeeping's (see §9 for the interim state this implies)
- A dedicated linen/laundry sub-ledger — v1 tracks linen as ordinary Inventory items (§4.8); a physical laundry-cycle sub-ledger is a v2 candidate (§12)
- Guest-facing DND messaging beyond the existing Front Desk flag, which Housekeeping reads but does not re-implement (§7)

### 1.3 Why now

`hotel.housekeeping_tasks` already has `priority_level` (`normal`/`high`/`urgent`/`vip`) and `due_by` columns, added by migration `20260604120000_rooms_workbench.sql` and actively written today every time Front Desk uses its `/hms/[slug]/frontdesk/rooms` → **Priority clean** action (`POST /api/hotel/frontdesk/rooms/[id]/priority-clean`). But **no Housekeeping surface reads either column** — the module's own dashboard (`HousekeepingTaskList`) selects `id,status,room_unit_id,started_at,completed_at,inspected_at,assigned_staff_id` only, and shows the last 50 tasks *ever created*, ordered by original creation date rather than urgency, with no filtering, no sorting, and no priority visibility at all.

The same pattern repeats at the department-integration level, which is the focus of this revision: `hotel.guest_requests` already exists, is staff-logged via Front Desk's Guest Services module (there is no guest-facing self-service form anywhere in the app), and already auto-routes a "Housekeeping" category request to `department: 'housekeeping'` on creation. `guest-services-rbac.ts` even already scopes view/update rights on that table to the `Housekeeping` department role. None of it is reachable, because `department-access.ts` never gives Housekeeping's role a route that reaches it. The same "already built, never wired up" shape shows up again with `hotel.shift_notes` (shift handoff) and Inventory's `linen`/`amenity` item types with `par_level`/`reorder_point` tracking — none of which any Housekeeping surface currently touches. This is the same "the seam already exists, nobody built the module that reads it" situation that motivated the recent Procurement PRD (`docs/PRD_PROCUREMENT.md` §1.3), now found in three more places once the department-integration question was asked directly rather than assumed answered.

---

## 2. Personas & roles

| Role | Who | Primary need | Today |
|---|---|---|---|
| **Attendant** | Housekeeping department staff (room cleaner) | See only their assigned rooms for the shift, advance status, log issues/lost & found from the floor | No distinction from Supervisor — a single flat `Housekeeping` department role (`department-access.ts`) |
| **Supervisor** | Senior Housekeeping staff | Assign/rebalance tasks, perform inspection sign-off, monitor the priority/SLA queue, see the whole-property board | **Does not exist as a role today** — a required change, see §6 |
| **Front Desk** | Front Desk / Reservations staff | Trigger priority-clean/VIP requests, log guest service requests, see live room-readiness status | Partly wired already: priority-clean action, read-only `HousekeepingInfoBlock` on the room detail sheet, and the source of `hotel.guest_requests` today (`department` defaults to `'front_desk'`) |
| **Admin/GM** | Owner/GM | Configure SLA targets, inspection policy, and room-type supply pars; review productivity/quality reports | New — Settings is currently a static `ModuleScaffold` checklist with no real fields |

---

## 3. Information architecture (proposed routes)

| Route | Purpose | Primary role(s) |
|---|---|---|
| `/hms/[slug]/housekeeping` | Live board: all rooms grouped by floor/zone with current HK status, priority/VIP flags, guest-request badges, SLA countdown | Supervisor, Admin/GM |
| `/hms/[slug]/housekeeping/my-tasks` | Attendant's own run sheet for the current shift, large touch-friendly status controls | Attendant |
| `/hms/[slug]/housekeeping/assignments` | Assign/rebalance today's tasks across attendants by zone/floor | Supervisor |
| `/hms/[slug]/housekeeping/inspections` | Queue of `cleaned` tasks awaiting supervisor sign-off | Supervisor |
| `/hms/[slug]/housekeeping/lost-found` | Lost & found log, tied to room/reservation where applicable | Attendant (log), Supervisor/Front Desk (resolve) |
| `/hms/[slug]/housekeeping/reports` | Attendant productivity, inspection pass rate, SLA compliance, guest-request fulfillment time | Supervisor, Admin/GM |
| `/hms/[slug]/housekeeping/settings` | SLA targets, inspection policy, escalation window, room-type supply pars, default zone→attendant mapping | Admin/GM |

This extends the current 2-item nav (Dashboard, Settings) to a 7-item scope — the same shape of change the Procurement PRD made to its own department nav. All routes reuse the existing `HMSLayout` shell, `requiredSection` gating, and shadcn/`radix-nova` component set — no new design system.

---

## 4. Functional requirements

Requirement IDs use the `HK-` prefix. Priority follows the platform convention: **P0** (must ship), **P1** (should ship v1), **P2** (v2 candidate).

### 4.1 Run sheet & task generation

| ID | Requirement | Priority |
|---|---|---|
| HK-01 | Auto-generate today's cleaning tasks (on a schedule or via an explicit "Generate today's tasks" action) from: rooms with a checkout that day (`checkout_clean`), stayover rooms due for service per the configured cadence, and any room already flagged `dirty`/priority-clean by Front Desk. | P0 |
| HK-02 | Task types: `checkout_clean`, `stayover`, `deep_clean` (scheduled/ad-hoc), `turndown` (evening service, §4.3), `reinspection` (system-created when an inspection fails). | P0 |
| HK-03 | A task is a discrete, timestamped record of one cleaning cycle for one room. At most one **open** task may exist per room at a time (enforced by a database constraint, not just UI discipline) — closing a task (status `ready`) allows the next cycle's task to be created. This replaces today's permanent `unique(room_unit_id)` row that silently overwrites its own history. | P0 |
| HK-04 | Rooms flagged `dnd`, `security_hold`, or `staff_restricted` in the existing `hotel.room_unit_flags` table, **and** rooms whose `room_units.status` is already `maintenance` or `out_of_order`, are excluded from automatic task generation and clearly marked "skipped — DND/hold/maintenance" on the board rather than silently omitted. Front Desk and Maintenance-adjacent flows already maintain all of this data; Housekeeping currently has no visibility into any of it. | P0 |
| HK-05 | Manual task creation/edit by a Supervisor for ad-hoc requests (e.g. a spill reported in an occupied stayover room mid-afternoon). | P1 |

### 4.2 Room-status synchronization with Front Desk

This is the bidirectional contract the first draft of this document left implicit. It is promoted to its own requirement group because Front Desk, the GM dashboard, and Revenue's occupancy figures all depend on `hotel.room_units.status` being correct at all times — not eventually correct after someone notices a stale badge.

| ID | Requirement | Priority |
|---|---|---|
| HK-06 | Every Housekeeping task status transition updates `hotel.room_units.status` in the same request/transaction — extending today's `STATUS_TO_ROOM` mapping (already live in `PATCH /api/hotel/housekeeping/tasks`) to the fuller task-type vocabulary in HK-02, so a `reinspection` task correctly reopens the room's status rather than leaving it stuck at whatever it was before the failed inspection. Front Desk's rooms board, the room detail sheet, and the GM dashboard's Room/Floor Status cards all read `room_units.status` directly and must never show a state Housekeeping itself has already moved past. | P0 |
| HK-07 | Conversely, if Front Desk (or a future Maintenance module) sets `room_units.status` to `maintenance` or `out_of_order` directly — outside the Housekeeping status machine — any open Housekeeping task for that room is automatically paused with a system note ("room taken out of service") rather than continuing to prompt an attendant to clean a room that is no longer cleanable or sellable. A room re-entering service after maintenance starts a fresh task; a paused task is never silently resurrected. | P0 |
| HK-08 | `vacant_clean` and `ready_for_occupancy` are two distinct `room_units.status` values that already mean the same thing ("clean and available") in several places in the existing codebase (`front-desk-board.ts`, `arrivals-room.ts`, `arrivals-workbench.ts` all already check for both). Housekeeping's status machine continues to write `ready_for_occupancy` (matching today's convention) and must treat the two values as equivalent everywhere it reads "is this room available," rather than silently diverging from how Front Desk already copes with the duplication. Consolidating the two values into one is flagged as a cleanup candidate, not committed to in this PRD (§12). | P0 |

### 4.3 Guest requests & VIP service

| ID | Requirement | Priority |
|---|---|---|
| HK-09 | Task generation and the attendant's task card read `hotel.guest_requests` for the task's room/reservation and surface any open request already routed to `department = 'housekeeping'` (extra towels, turndown, hypoallergenic bedding, a late-checkout-driven schedule shift) as a checklist item. There is no guest-facing self-service form anywhere in the app — a guest always asks a staff member, and today that is always Front Desk, via the existing Guest Services module (`/hms/[slug]/frontdesk/guest-services`). When Front Desk picks service category "Housekeeping," `defaultDepartmentForCategory` already tags the row `department: 'housekeeping'` and status `assigned` automatically; Housekeeping simply has no surface that reads it yet (§7). | P0 |
| HK-10 | `turndown` (HK-02) is generated for occupied rooms per the property's evening-service policy (Settings — which room types/rate plans receive turndown, and the target time window), pre-filled with any VIP/guest-request instructions from HK-09. | P1 |
| HK-11 | Completing a guest-request checklist item on a task marks the corresponding `hotel.guest_requests` row `fulfilled`, reusing the exact status lifecycle (`open` → `in_progress` → `fulfilled` → `cancelled`) Front Desk already relies on — so Front Desk sees real-time fulfillment status without Housekeeping inventing a second, parallel "done" flag. | P1 |

### 4.4 Priority, VIP & SLA

| ID | Requirement | Priority |
|---|---|---|
| HK-12 | Surface `priority_level` and `due_by` — already written today by Front Desk's priority-clean action but never read by any Housekeeping surface — prominently on both the live board and attendant task cards, sorting priority/VIP/overdue tasks to the top. | P0 |
| HK-13 | SLA countdown per task type, configured in Settings (e.g. checkout clean target 30 min, VIP priority target 15 min, turndown target 20 min); a task visually transitions to "at risk" then "overdue" as the countdown elapses. | P0 |
| HK-14 | Overdue priority/VIP tasks trigger a notification to the Supervisor, reusing the existing `notification-rules.ts` pattern, rather than relying on a Supervisor noticing a visual flag. | P1 |

### 4.5 Assignment & attendant workflow

| ID | Requirement | Priority |
|---|---|---|
| HK-15 | Assign a task to a specific attendant — a real `public.memberships` staff record. The currently-unused `assigned_staff_id` column becomes an enforced, validated field instead of a column nothing in the app ever sets. | P0 |
| HK-16 | "My tasks" attendant view: filtered to the logged-in attendant's own assignments for the current shift, ordered by priority then floor/room, with large touch-friendly status-advance controls sized for one-handed phone use on the floor. | P0 |
| HK-17 | Default zone→attendant mapping (Settings) so morning run-sheet generation can auto-assign by floor/section; a Supervisor can always manually rebalance from the assignments view. | P1 |
| HK-18 | An attendant can log a note or flag a maintenance fault found while cleaning directly from a task, routed toward Maintenance (§7/§9 for today's interim state); the supply/amenity shortage flag is its own path, specified in §4.8, since it needs to reach Inventory's real stock system rather than sit as free text. | P1 |

### 4.6 Inspection & sign-off

| ID | Requirement | Priority |
|---|---|---|
| HK-19 | A task cannot reach `ready` without a distinct inspection step recorded by a user other than the assigned attendant, unless self-inspection is explicitly enabled in Settings (for smaller properties without a dedicated Supervisor headcount). Enforced server-side. | P0 |
| HK-20 | Inspection outcome is pass or fail, with a required note on fail. A failed inspection reopens the task as a `reinspection` task rather than silently resetting its status. | P0 |
| HK-21 | Inspection queue view for Supervisors: all `cleaned` tasks awaiting sign-off, oldest first. | P0 |

### 4.7 Live board

| ID | Requirement | Priority |
|---|---|---|
| HK-22 | Replace today's flat "last 50 tasks ever" list with a floor/zone-grouped live board showing only today's open tasks, reusing the visual/component pattern already established by Front Desk's Rooms board rather than inventing a new one (§7). | P0 |
| HK-23 | Realtime updates via Supabase Realtime, matching the existing pattern already used by Front Desk, F&B, and Kitchen. | P0 |

### 4.8 Linen, amenity & supply integration

This section replaces a vague "missing supply flag" in the first draft with a concrete design grounded in what Inventory already models: `linen`, `amenity`, and `consumable` are already first-class item types (`inventory_lookup_tables` migration), and every stock level already carries `par_level`/`reorder_point` at the store-location level.

| ID | Requirement | Priority |
|---|---|---|
| HK-24 | Configure a linen/amenity/consumable par (quantity per item) **per room type** in Settings, drawn directly from Inventory's existing item catalog — a new, small room-type-to-item mapping (§5), not a Housekeeping-owned duplicate item list. | P1 |
| HK-25 | On completing a `checkout_clean` or `stayover` task, the room type's default par-based consumption posts an `issue` stock movement against Inventory's existing ledger (`hotel.inventory_stock_movements`), attributed to the assigned store location; an attendant can adjust the actual quantity used before confirming. Housekeeping never maintains its own stock number — Inventory remains the single source of truth, the same discipline the Procurement PRD applied to goods receiving (`PC-23`). | P1 |
| HK-26 | When a par item is out of stock at the assigned store location, an attendant's "missing supply" flag on a task raises a `hotel.inventory_requisitions` request with `requesting_department = 'Housekeeping'` — the exact existing mechanism, not a new one, since `requesting_department` is already a free-text column with no enum restricting which department may use it. | P0 |
| HK-27 | This is an ordinary internal stock requisition, fulfilled by Inventory from on-hand stock — distinct from, and not in conflict with, Procurement's `PC-06` restriction on who may originate a requisition destined for Procurement's *external-sourcing* queue. `PC-06` gates escalation into Procurement's sourcing pipeline, applied by Inventory/Admin at approval time; it does not gate an operational department's ordinary request for stock already sitting in the store. This clarification should be reflected as a one-line cross-reference in `docs/PRD_PROCUREMENT.md` §4.2 the next time that document is revised (see §9). | P0 |

### 4.9 Lost & found

| ID | Requirement | Priority |
|---|---|---|
| HK-28 | Log an item found during cleaning: description, optional photo, room, date, finder. | P1 |
| HK-29 | Track resolution status (`logged` → `guest notified` → `returned`/`claimed` → `disposed`) with notes; link to the guest/reservation when the room was recently occupied. | P1 |

### 4.10 Reporting

| ID | Requirement | Priority |
|---|---|---|
| HK-30 | Attendant productivity: rooms cleaned and average clean time vs. SLA target, per shift/day. | P1 |
| HK-31 | Inspection pass rate, overall and per attendant. | P1 |
| HK-32 | SLA compliance %: priority/VIP tasks started and completed within their configured target window. | P1 |
| HK-33 | Guest-request fulfillment time: turndown and extra-amenity requests (HK-09/HK-11) closed within their target window. | P2 |

### 4.11 Settings

| ID | Requirement | Priority |
|---|---|---|
| HK-34 | Configure SLA time targets per task type (optionally per room type/class). | P0 |
| HK-35 | Configure inspection policy: required for every task vs. spot-check percentage vs. self-inspection allowed. | P0 |
| HK-36 | Configure the priority/VIP escalation window and notification recipient. | P1 |
| HK-37 | Configure the default zone→attendant assignment mapping. | P1 |
| HK-38 | Configure stayover daily-service cadence (e.g. daily vs. every 2 days for extended stays — a common 5-star "green program" option). | P2 |
| HK-39 | Configure linen/amenity/consumable par per room type (HK-24), selecting items from Inventory's existing catalog. | P1 |
| HK-40 | Configure evening turndown-service policy: which room types/rate plans receive it and the target time window (HK-10). | P1 |

---

## 5. Data model (proposed)

No ORM is used in this codebase — all schema changes follow the existing hand-written, timestamp-prefixed SQL migration convention in `supabase/migrations/`, in the `hotel` Postgres schema, with RLS enabled using the same `<table>_service_role_all` / `_select_member` / `_insert_member` / `_update_member` policy pattern used by every existing HMS table.

| Change | Purpose | Detail |
|---|---|---|
| Alter `hotel.housekeeping_tasks` | Support real task history (HK-03) and the fuller task-type/inspection model | Drop the blanket `unique(room_unit_id)`; add a partial unique index enforcing at most one **open** task per room (e.g. `unique (room_unit_id) where status <> 'ready'`). Add `task_type` (incl. `turndown`), `reservation_id` (nullable FK `reservations` — also the join point for guest-request lookups, HK-09), `inspected_by` (FK `memberships`), `inspection_result` (`pass`/`fail`, nullable). Turn `assigned_staff_id` into an enforced FK to `public.memberships` instead of an unvalidated `uuid`. |
| New `hotel.housekeeping_room_type_pars` | HK-24/HK-39 | `id`, `tenant_id`, `room_type_code`, `item_id` (FK `hotel.inventory_items`), `par_qty` — a small relational table (room type × item), deliberately not a jsonb blob since it is queried per-room-type on every task completion (HK-25). |
| New `hotel.lost_found_items` | HK-28/29 | `id`, `tenant_id`, `room_unit_id`, `reservation_id` (nullable), `description`, `photo_url` (nullable), `status`, `found_by` (FK `memberships`), `found_at`, `resolved_at`, `resolution_notes` |
| New `hotel.tenant_housekeeping_settings` | HK-34–38, HK-40 | Mirrors the existing `tenant_fb_settings` pattern (one row per tenant, typed columns): `tenant_id`, SLA-minutes columns per task type, `inspection_policy`, `self_inspection_allowed`, `priority_escalation_minutes`, `stayover_cadence_days`, `turndown_room_types` / `turndown_window`, `default_zone_assignments` (small jsonb map — not large enough to warrant its own table) |

**Reused, not duplicated:** `hotel.room_units` (status is the single source of truth for room readiness — §4.2), `public.memberships` (attendant/supervisor identity — there is no separate `hotel.staff` table in this codebase), `hotel.reservations` (checkout/stayover detection for run-sheet generation, and the join point for guest requests), `hotel.room_unit_flags` (existing `dnd`/`security_hold`/`staff_restricted` flags — read, not re-implemented), `hotel.guest_requests` (existing — staff-logged via Front Desk's Guest Services module, already auto-tagged `department = 'housekeeping'` for that service category — read and written back to for fulfillment, not duplicated into a Housekeeping-owned request table), `hotel.shift_notes` (existing Front Desk shift-handoff table, already supports an optional `room_unit_id` — reused directly for Housekeeping's own attendant/supervisor handoff notes instead of a new table), `hotel.inventory_items` / `inventory_stock_levels` / `inventory_stock_movements` / `inventory_requisitions` (linen/amenity par tracking and supply requests — §4.8), `hotel.audit_logs`, `hotel.notifications`.

---

## 6. Roles & permissions — required code changes

- **`src/lib/hms/department-access.ts`:** today's single `Housekeeping` department role has a flat 2-item scope (`housekeeping`, `housekeeping-settings`). This PRD requires an Attendant/Supervisor capability split — the concrete mechanism (a second department-role value vs. a boolean `is_supervisor` on the membership) is an open engineering decision (§12, item 1) that must be resolved before Phase 0 lands, since every subsequent phase's access control depends on it. Extend the nav to the 7-item scope in §3, mirroring how `Store / Inventory` and `Procurement` already carry multi-item scopes.
- **Separation-of-duties enforcement (HK-19):** the inspection API must reject a sign-off where `inspected_by == assigned_staff_id`, unless `self_inspection_allowed` is set in `tenant_housekeeping_settings` — enforced server-side via `requireHotelApiMember`, not merely hidden in the UI, matching the rigor of the Procurement PRD's requisition-origin rule (`PC-06`).
- **`hotel.guest_requests` access for Housekeeping:** no schema or Front Desk UI change is needed here — `defaultDepartmentForCategory` already tags a "Housekeeping" service-category request `department: 'housekeeping'` automatically, and `guest-services-rbac.ts`'s `departmentScopeForRole` already maps the `Housekeeping` role (and, notably, `Maintenance` and `F&B Staff`/`Kitchen`) to a filtered, permitted view of exactly this table. The only real gap is that `department-access.ts` never grants the `Housekeeping` role a route that reaches this already-built, already-scoped API — extend Housekeeping's `allowedSections`/nav (§3) to reuse the existing Guest Services surface rather than building a parallel one.
- **`docs/PRD.md` role table:** currently lists a single `Housekeeping` role with `Yes` department access; update once the Supervisor split ships.
- **`docs/PRD_PROCUREMENT.md` §4.2 (`PC-06`):** add a one-line cross-reference to this PRD's HK-27 clarifying that `PC-06`'s origination restriction applies to Procurement's external-sourcing queue, not to an operational department's ordinary internal stock requisition.

---

## 7. Integration points (reuse, don't rebuild)

| Existing seam | How Housekeeping uses it |
|---|---|
| `hotel.housekeeping_tasks.priority_level` / `due_by`, written today by `POST /api/hotel/frontdesk/rooms/[id]/priority-clean` | Already-populated data that no Housekeeping surface currently reads — HK-12 wires it up rather than inventing a new priority concept. |
| `hotel.room_unit_flags` (`dnd`, `security_hold`, `staff_restricted`), maintained today by Front Desk's room-flags editor | Read directly for run-sheet generation (HK-04) — Housekeeping does not maintain its own copy of these flags. |
| `hotel.room_units.status` (single source of truth for room readiness) | Written by Housekeeping's task status machine (HK-06) and read by Front Desk's rooms board, room detail sheet, and the GM dashboard's Room/Floor Status cards — a two-way contract, not a one-way export (§4.2). |
| `hotel.guest_requests` + `guest-services-rbac.ts` | Staff-logged only (no guest self-service exists) via Front Desk's Guest Services module; a "Housekeeping" service category already auto-routes to `department: 'housekeeping'`, and the RBAC layer already scopes view/update rights to the `Housekeeping` role (and, built the same way, `Maintenance` and `F&B Staff`/`Kitchen`) — the missing piece is a reachable route in Housekeeping's own nav, not new data plumbing. Read for turndown/special-service instructions (HK-09) and written back to (`fulfilled`) on completion (HK-11), reusing Front Desk's existing status lifecycle rather than a parallel Housekeeping-owned request table. |
| `hotel.shift_notes` (existing Front Desk shift-handoff table, already supports `room_unit_id`) | Reused directly for Housekeeping attendant/supervisor shift handoff instead of a new table. |
| Front Desk's Rooms board component pattern (`FrontDeskRoomBoardShell`, floor-grouped layout) | Visual/component pattern reused for the live board (HK-22) rather than a new board built from scratch. |
| `notifyRoomReady`, `notifyRoomStatus`, `notifyMaintenance` (`notification-rules.ts`) | Extended with `notifyPriorityTaskOverdue` and `notifyInspectionFailed`, following the exact existing function pattern. |
| `hotel.audit_logs` + `writeAuditLog()` | Every assignment, inspection sign-off, and status transition logged, same as Front Desk. |
| `hotel.reservations` | Source of truth for checkout/stayover detection driving run-sheet generation (HK-01), and the join point for guest requests (HK-09) — Housekeeping does not duplicate reservation logic. |
| Inventory's `linen`/`amenity`/`consumable` item types and `par_level`/`reorder_point` stock-level columns (already built) | Foundation for room-type par tracking (HK-24) and consumption posting (HK-25) — Housekeeping references these item records, it does not duplicate them. |
| `hotel.inventory_requisitions` (`requesting_department` is free text, no enum) | Housekeeping raises its own stock requests through this exact existing mechanism (HK-26), same as any other department — see the `PC-06` clarification in HK-27/§6. |
| Maintenance module (currently a scaffold) | An attendant's "fault found" flag (HK-18) is the seam for a future Maintenance work order; until Maintenance is real, it resolves to an Admin/GM notification — an interim state exactly like Procurement's Finance-approval fallback (`docs/PRD_PROCUREMENT.md` §9). |
| GM dashboard's Room Status Card / Floor Status Card (`docs/XYVOO_MODULES_STATUS.txt` §A16) | Passive downstream beneficiary: once HK-06/HK-07's bidirectional room-status contract is correct, these already-built widgets become trustworthy for the first time, with no change required on their own end. |

---

## 8. Non-functional requirements

- **NFR-1 Data integrity:** at most one open task per room, enforced by a database constraint — closes the current silent-overwrite bug class caused by the blanket `unique(room_unit_id)`.
- **NFR-2 Auditability:** every assignment, inspection sign-off, and status change is permanently logged with actor and timestamp.
- **NFR-3 Separation of duties:** inspection sign-off is enforced server-side to require a different actor than the cleaning attendant, unless explicitly relaxed in Settings.
- **NFR-4 Mobile-first attendant UI:** "My tasks" must be comfortably usable one-handed on a phone browser — attendants work the floor, not a desk, the same standard the Procurement PRD set for GM approvals (`NFR-4` there).
- **NFR-5 Realtime:** the board and "my tasks" view reflect other users' status changes within the existing Supabase Realtime latency already achieved by Front Desk and Kitchen.
- **NFR-6 Consistency:** UI composed entirely from existing shadcn/`radix-nova` primitives; no new design system introduced.
- **NFR-7 Single source of truth for room readiness:** `hotel.room_units.status` is never shadowed by a Housekeeping-local "is this room actually ready" flag — every surface (Housekeeping's own board included) reads the same column Front Desk and the GM dashboard read, so the three views can never silently disagree.

---

## 9. Dependencies & known interim states

- **Maintenance module is currently a scaffold.** HK-18's "fault found" flag has no real work-order system to land in yet; it resolves to an Admin/GM notification until Maintenance is built. (Notably, `guest-services-rbac.ts` already scopes a `Maintenance` department view over `hotel.guest_requests` the same way it does for Housekeeping — a guest-reported maintenance issue already has a real, permitted home once Maintenance's own nav reaches it; it is only a staff-originated "fault found" flag raised *from a Housekeeping task* that has nowhere to land until Maintenance is real.)
- **Inventory module is real** and can be depended on directly for room-type par tracking and supply requisitions (§4.8) — unlike Maintenance, no interim fallback is needed there.
- **HR/shift-roster module is currently a scaffold** (`docs/XYVOO_MODULES_STATUS.txt` §A14). Zone→attendant auto-assignment (HK-17) and "my tasks" (HK-16) assume v1 uses a simple "on duty today" toggle per attendant inside Assignments, not a real clock-in/shift-roster integration; revisit once HR is built — the same kind of interim state as Procurement's Finance/Accounts fallback.
- **`PC-06` cross-document clarification (HK-27) is a documentation dependency, not a code dependency:** Housekeeping's own requisitions can ship without waiting on a `docs/PRD_PROCUREMENT.md` edit, but that edit should land in the same review cycle to avoid the two documents appearing to contradict each other.
- **The Attendant/Supervisor role-model decision (§6, §12 item 1) blocks Phase 0.** Every subsequent phase's access control assumes this is resolved first.

---

## 10. Implementation plan

Phased to ship the highest-visibility fix first: wiring up data the system already has but no UI currently shows, and making the room-status contract with Front Desk trustworthy before layering richer workflows on top of it.

| Phase | Scope | Depends on |
|---|---|---|
| **Phase 0 — Foundation** | Migrations (task-table rework incl. `turndown`, `housekeeping_room_type_pars`, `lost_found_items`, `tenant_housekeeping_settings`). Resolve and implement the Attendant/Supervisor role-model decision in `department-access.ts`, including a route/nav grant onto the existing Guest Services API — already RBAC-scoped for `Housekeeping`, so this is a nav change, not new plumbing. `requireHotelApiMember`-based API skeleton. | — |
| **Phase 1 — Run sheet, live board & room-status sync** | HK-01–08 (auto-generation, DND/hold/maintenance exclusion, the full bidirectional room-status contract), HK-12–14 (surface existing `priority_level`/`due_by`, SLA countdown, overdue notification), HK-22–23 (live board, realtime) — the fastest, highest-visibility win, since most of this data already exists and is already being written by Front Desk today, and it is the foundation every later phase's trust in Housekeeping's status depends on. | Phase 0 |
| **Phase 2 — Guest requests & attendant workflow** | HK-09–11 (guest-request awareness, turndown), HK-15–18 (real attendant assignment, "My tasks" mobile view, zone mapping, issue flagging). | Phase 1 |
| **Phase 3 — Inspection & sign-off** | HK-19–21: separation-of-duties enforcement, inspection queue, reinspection loop. | Phase 2 |
| **Phase 4 — Inventory integration** | HK-24–27: room-type supply pars, consumption posting to Inventory's ledger, missing-supply requisitions, `PC-06` clarification applied at approval time. | Phase 1 (independent of Phases 2–3) |
| **Phase 5 — Lost & found, remaining Settings, reporting** | HK-28–33, HK-34–40 not already delivered as part of an earlier phase's own settings needs (e.g. SLA targets ship alongside HK-13 in Phase 1; this phase consolidates everything into one real Settings page, replacing the placeholder). | Phase 3, Phase 4 |

**Suggested sequencing note:** Phase 1 is more consequential than it looks — it is not just "add a sort order," it is the fix that makes Housekeeping's status trustworthy to every other department reading `room_units.status`, which HK-06/HK-07 make explicit and testable for the first time. Phase 4 (Inventory integration) can run in parallel with Phases 2–3 once Phase 1 lands, since it depends only on the task-table rework, not on the assignment or inspection workflows. Phases 2–3 are what make the module match the master PRD's actual target ("mobile attendant tasks, supervisor sign-off") rather than just a nicer list view, and should not be dropped without a conscious tradeoff conversation.

---

## 11. Success metrics

| Metric | Definition | Target (to be set with Ops) |
|---|---|---|
| Checkout-clean turnaround vs. SLA | Time from checkout to task marked `ready` | |
| Priority/VIP escalation compliance | % of priority/VIP tasks started within the configured window | |
| First-pass inspection rate | % of tasks passing inspection without a `reinspection` cycle | |
| Attendant productivity | Rooms cleaned per attendant per shift, vs. SLA-implied capacity | |
| Lost & found return rate | % of logged items returned/claimed vs. disposed | |
| Guest-request fulfillment time | Turndown/extra-amenity requests closed within their target window | |
| Re-flag rate | % of `ready` rooms manually re-flagged dirty by Front Desk within 1 hour (a proxy for whether "ready" is trustworthy, not just a status flip) | |
| Room-status disagreement rate | Instances where Housekeeping's and Front Desk's view of a room's status diverge for longer than one realtime round-trip (should be ~0 once HK-06/HK-07 ship) | |

---

## 12. Open questions (v2 candidates)

1. **Attendant vs. Supervisor role split:** a new `department_role` value, or a boolean flag on `memberships`? This is a blocking decision for §6/Phase 0, not a deferrable one.
2. **Deep-clean scheduling:** a fixed calendar cadence per room, or Supervisor-triggered only, in v1?
3. **Photo evidence:** required for lost & found only, or also for inspection pass/fail (common in some 5-star SOPs)?
4. **Linen/laundry sub-ledger:** v1 treats linen as an ordinary Inventory item category (§4.8) — is a dedicated physical laundry-cycle sub-ledger (in-circulation vs. in-wash counts) worth its own module eventually?
5. **Self-inspection sampling:** should Settings support a true randomized "spot-check X%" policy, or is a binary on/off sufficient for v1?
6. **DND two-way sync:** is read-only awareness of Front Desk's `dnd` flag (HK-04) sufficient, or does Housekeeping eventually need to *set* DND itself (e.g. attendant marks a room DND after finding a sign not reflected in the system)?
7. **`vacant_clean` / `ready_for_occupancy` consolidation (HK-08):** these already mean the same thing in several existing files. Worth a dedicated cleanup migration across Front Desk/Arrivals/Housekeeping, or an acceptable permanent duplication given how much existing code already copes with it?
8. **Minibar restocking ownership:** some properties assign this to Housekeeping, others to F&B/Room Service — does XYVOO need a per-tenant setting, or is this out of scope until a customer asks?

---

## 13. Document control

| Version | Date | Author | Notes |
|---|---|---|---|
| 1.0 | 2026-07-14 | Engineering (drafted with product input) | Initial draft PRD & implementation plan for the Housekeeping module |
| 1.1 | 2026-07-14 | Engineering (drafted with product input) | Reworked around cross-department integration after review: added the bidirectional room-status contract with Front Desk (§4.2), guest-request/turndown awareness via the existing `hotel.guest_requests` table (§4.3), and a concrete linen/amenity/supply integration with Inventory's existing item catalog and requisition mechanism (§4.8) — replacing the first draft's vague "missing supply flag." Added the `PC-06` cross-document clarification (HK-27) and several new open questions surfaced by this pass (§12). |
| 1.2 | 2026-07-14 | Engineering (drafted with product input) | Corrected the `hotel.guest_requests` integration after verifying the actual code: there is no guest-facing self-service form (a guest always asks staff); Front Desk's Guest Services module already auto-routes a "Housekeeping" category request to `department: 'housekeeping'` with no code change needed; and `guest-services-rbac.ts` already scopes view/update rights on that table to the `Housekeeping` role (and `Maintenance`, `F&B Staff`/`Kitchen`). The real gap is a missing nav/route grant in `department-access.ts`, not new schema or UI plumbing on Front Desk's side — corrected HK-09, §6, §7, §9, and Phase 0 accordingly. |

---

*End of PRD*
