# XYVOO HMS — Procurement Module
## Product Requirements Document & Implementation Plan

**Module:** 08 — Procurement (companion to the existing Inventory module)
**Product:** XYVOO HMS (`xyvoo-next`)
**Status:** Draft v1.0 — for review
**Author:** Engineering (drafted with product input)
**Priority:** P0 — closes the single largest gap between the current build and the master platform PRD's "Procurement & Inventory" module

---

## 1. Executive summary

### 1.1 Design philosophy

A 5-star property's back-of-house is judged by the same standard as its front-of-house: nothing runs out, nothing is bought without a reason, nothing arrives without being checked, and every naira/dollar of spend can be traced to a decision someone was accountable for. The Procurement module is XYVOO's answer to that standard — it is the **control layer** between "we need this" (Inventory) and "we bought this from someone, at an agreed price, at an agreed quality" (Procurement), before goods ever touch a shelf.

Three principles govern every design decision in this document:

1. **Demand comes from operations, not from Procurement itself.** Procurement does not decide what a hotel needs — the Inventory department (store/warehouse keeper) and Admin/GM do, either manually or via system-generated reorder alerts. Procurement's job is to *source, negotiate, control, and account for* that demand. This mirrors how real luxury-hotel purchasing departments work and is a deliberate, explicit business rule (see §4.5, PC-05).
2. **Nothing is accepted on trust.** Every delivery is checked against what was ordered (3-way match: requisition → PO → goods receipt → invoice), and quality is inspected before stock is accepted into inventory — not after.
3. **Every spend decision has a name and a threshold attached to it.** Approval routing, budget ceilings, and audit trails are not bolted on later; they are the backbone of the workflow from day one.

### 1.2 Scope (v1)

In scope, per the department head's brief and the master platform PRD (Module 08, requirements PR-01 through PR-08):

- Vendor/supplier register and approved-vendor management
- Purchase requisitions, sourced **only** from Inventory or Admin/GM, flowing into Procurement's queue
- Purchase order creation, multi-tier approval, and issuance to vendors
- Goods receiving with quality inspection, discrepancy handling, and inventory sync
- Invoice matching and handoff to Finance/Accounts
- Department budgets, cost-centre allocation, and spend analytics
- Vendor performance tracking

Out of scope for v1 (see §11 Open questions for v2 candidates):

- Vendor self-service portal (vendors submit quotes/invoices themselves)
- Formal RFQ/e-tendering workflow with multiple competing bids
- Direct EDI/API integration with vendor systems
- Automated payment execution (Procurement hands off to Finance/Accounts; it does not pay)

### 1.3 Why now

The Inventory module (`/hms/[slug]/inventory`) is substantially built: stock levels, locations, requisitions, transfers, receiving, counts, and — critically — a **reorder-suggestions API** that is already commented in code as *"a data seam for a future Procurement module."* Procurement itself is currently a static dashboard scaffold with no database tables, no API, and hardcoded numbers. This PRD turns that seam into a real module, reusing Inventory's proven data and workflow patterns rather than inventing new ones.

---

## 2. Personas & roles

| Role | Who | Primary need | Can originate a requisition? |
|---|---|---|---|
| **Requester** | Store/Warehouse Keeper (Inventory dept) or Admin/GM | Raise a request for goods when stock is low or a one-off need arises | **Yes — the only two roles that can** |
| **Procurement Officer/Manager** | Dedicated Procurement dept staff | Convert approved requisitions into POs, manage vendors, negotiate price/terms, track deliveries | No — fulfills, does not originate |
| **Finance/GM Approver** | Owner, GM, or Accounts (once built) | Approve spend above threshold, keep department budgets on track | No |
| **Store/Warehouse Keeper (receiving)** | Same person as Requester, wearing the receiving hat | Physically receive goods, verify quality/quantity against the PO, accept or reject | No |

This is a **deliberate narrowing** of today's code: `department-access.ts` currently scopes the `Procurement` role to only `Dashboard` and `Settings`. This PRD extends that scope (§6) but does **not** grant Procurement the ability to create requisitions from scratch — that authority stays with Inventory/Admin, matching the brief.

---

## 3. Information architecture (proposed routes)

| Route | Purpose | Primary role(s) |
|---|---|---|
| `/hms/[slug]/procurement` | Dashboard: open requisitions awaiting action, POs in flight, budget burn, vendor alerts, reorder-suggestion feed | Procurement, Admin/GM |
| `/hms/[slug]/procurement/requisitions` | Inbox of requisitions raised by Inventory/Admin, filterable by status/urgency/department | Procurement, Admin/GM |
| `/hms/[slug]/procurement/vendors` | Vendor register: profile, contacts, categories, certifications, price catalog, status (active/preferred/blacklisted) | Procurement, Admin/GM |
| `/hms/[slug]/procurement/vendors/[id]` | Single vendor profile: contract terms, order history, performance scorecard | Procurement, Admin/GM |
| `/hms/[slug]/procurement/orders` | Purchase order list — draft, pending approval, approved, ordered, receiving, closed | Procurement, Approvers |
| `/hms/[slug]/procurement/orders/[id]` | PO detail: line items, approval trail, linked GRNs/invoices, audit log | Procurement, Approvers |
| `/hms/[slug]/procurement/orders/new` | Create PO — manually or from a selected requisition/reorder suggestion | Procurement |
| `/hms/[slug]/procurement/receiving` | Goods receiving queue: POs due/overdue for delivery, quality inspection checklist, discrepancy flagging | Store/Warehouse Keeper |
| `/hms/[slug]/procurement/budgets` | Department budgets vs. actual spend, cost-centre breakdown | Procurement, Finance/GM |
| `/hms/[slug]/procurement/reports` | Spend by vendor/category/department, vendor performance, cycle-time and savings analytics | Procurement, Finance/GM, Owner |
| `/hms/[slug]/procurement/settings` | Approval thresholds, PO numbering, vendor categories, quality checklists, budget periods | Admin/GM |

All routes reuse the existing `HMSLayout` shell, `requiredSection` gating, and the shadcn/`radix-nova` component set already in use across Inventory — no new design system is introduced.

---

## 4. Functional requirements

Requirement IDs use the `PC-` prefix. Priority follows the platform convention: **P0** (must ship), **P1** (should ship v1), **P2** (v2 candidate).

### 4.1 Vendor & supplier management

| ID | Requirement | Priority |
|---|---|---|
| PC-01 | Maintain a vendor register: legal/trading name, category, contacts, address, country, payment terms, lead time, currency, tax ID, and status (`active` / `preferred` / `inactive` / `blacklisted`). | P0 |
| PC-02 | Vendor categories are a tenant-editable lookup table (same pattern as `inventory_item_types`), not a hardcoded enum — e.g. Food & Beverage, Linen & Amenities, Engineering/Parts, Cleaning Supplies, Office. | P0 |
| PC-03 | Track vendor certifications/compliance flags relevant to a 5-star operation (e.g. food-safety/HACCP certified, sustainability/local-sourcing tag) as structured metadata on the vendor record, filterable in the vendor list. | P1 |
| PC-04 | Maintain an optional price catalog per vendor (item ↔ unit price ↔ MOQ ↔ validity window), so PO line items can be pre-filled with the last agreed price. | P1 |
| PC-05 | Vendor performance scorecard: rolling on-time-delivery %, quality-rejection rate, and price-variance history, computed from closed POs and receiving records — surfaced on the vendor profile and in Reports. | P1 |

### 4.2 Demand intake (requisitions)

| ID | Requirement | Priority |
|---|---|---|
| PC-06 | **Only Inventory (Store/Warehouse Keeper) and Admin/GM can create a procurement requisition.** Procurement staff can view, comment, and act on requisitions but cannot originate one. This is enforced server-side, not just hidden in the UI. | P0 |
| PC-07 | Consume the existing `/api/hotel/inventory/reorder-suggestions` endpoint to auto-populate a "suggested requisitions" feed on the Procurement dashboard — items at or below reorder point, with suggested quantity pre-filled from Inventory's own par-level logic. | P0 |
| PC-08 | Requisitions carry a priority/urgency flag (`standard` / `urgent`) — urgent requisitions (e.g. a VIP arrival needing an amenity restock, or an engineering part needed to fix a guest-room fault) get a visible SLA countdown and escalation notification if not actioned within a configurable window. | P1 |
| PC-09 | Reuse the existing `inventory_requisitions` status machine (`pending → approved → …`) as the intake gate: a requisition must be `approved` (by the requester's own department head or Admin/GM, exactly as Inventory already does today) before it becomes visible to Procurement for sourcing. Procurement does not re-approve the requisition itself — it approves the resulting *spend* (§4.4). | P0 |

### 4.3 Purchase orders

| ID | Requirement | Priority |
|---|---|---|
| PC-10 | Create a purchase order either from one or more approved requisitions, or manually (ad-hoc/contract purchase) for cases with no upstream requisition (e.g. planned bulk buy). Every manually created PO must record a reason. | P0 |
| PC-11 | PO line items: item (linked to the Inventory item catalog where applicable, or free text for non-stocked services), quantity, unit cost, currency, tax, expected delivery date, and linkage back to the source requisition line(s) for traceability. | P0 |
| PC-12 | System-generated, tenant-configurable PO numbering (e.g. `PO-2026-000123`), guaranteed unique and sequential per tenant. | P0 |
| PC-13 | Support multi-currency POs (vendor's currency vs. hotel's operating currency), with the FX rate captured at PO time for audit purposes — relevant for imported F&B, amenities, and equipment common in the African hospitality market. | P1 |
| PC-14 | Generate a branded, professional PO document (hotel logo, terms, authorized-signatory block) as a PDF, sendable to the vendor by email directly from the PO — matching the same document-quality bar as guest-facing folios/invoices already produced by Front Desk. | P1 |
| PC-15 | Optional lightweight quote comparison: attach 1–3 vendor quotes to a requisition before committing to a PO, so the approver can see the basis for vendor choice. (Full RFQ workflow is v2 — see §11.) | P2 |

### 4.4 Approval workflow

| ID | Requirement | Priority |
|---|---|---|
| PC-16 | Multi-tier, configurable approval thresholds per department/cost-centre (e.g. "orders under ₦200,000 auto-approve; ₦200,000–₦1,000,000 require GM sign-off; above that requires Finance + GM"). Configured in Settings, enforced server-side. | P0 |
| PC-17 | A PO cannot move to `ordered` status until every required approval tier has signed off. Rejections require a reason and return the PO to `draft` with the reason visible to Procurement. | P0 |
| PC-18 | Approvers can act from a notification/email deep link without navigating the full app (mobile-friendly approval), consistent with how a GM or owner realistically works — often away from a desk. | P1 |
| PC-19 | Full audit trail on every state transition (who, when, before/after values) using the existing `hotel.audit_logs` pattern already used across the HMS. | P0 |

### 4.5 Goods receiving & quality control

| ID | Requirement | Priority |
|---|---|---|
| PC-20 | Goods Receiving Note (GRN) recorded against a specific PO, supporting partial deliveries (multiple GRNs per PO until fully received or the PO is manually closed). | P0 |
| PC-21 | Every receipt requires a quality-inspection sign-off before stock is accepted — a per-category checklist (e.g. temperature check and expiry date for perishables, thread-count/condition for linen, working-condition check for equipment/parts), configurable in Settings per vendor category. | P0 |
| PC-22 | Quantity and/or quality discrepancies vs. the PO are flagged at receiving time (short-delivered, damaged, wrong item, failed inspection) and routed back to Procurement for vendor follow-up — never silently accepted into stock. | P0 |
| PC-23 | Accepted quantities post directly into the existing Inventory stock ledger (`hotel.inventory_stock_movements`, type `receipt`) and update `inventory_stock_levels` — Procurement does **not** maintain a parallel stock number; Inventory remains the single source of truth for on-hand quantity. | P0 |
| PC-24 | Rejected/discrepant quantities do **not** post to stock and are tracked separately until resolved (vendor credit, replacement delivery, or write-off). | P0 |

### 4.6 Invoicing, budgets & handoff to Finance

| ID | Requirement | Priority |
|---|---|---|
| PC-25 | 3-way match: PO quantity/price vs. GRN quantity vs. vendor invoice, with a configurable tolerance (e.g. ±2%) before a variance blocks handoff. | P1 |
| PC-26 | Matched invoices are marked "ready for payment" and handed off to Finance/Accounts (today: Admin/GM, since Accounts is a scaffold module — see §9 dependency note) rather than Procurement issuing payment itself. | P1 |
| PC-27 | Department/cost-centre budgets (period-based — monthly or per operating year), with running actual-vs-budget spend and a warning threshold (e.g. 90% consumed) that fires a notification to the department head and Procurement. | P0 |
| PC-28 | Every PO line item attributes spend to a department cost centre for P&L reporting, independent of which department's stock ultimately receives the goods (e.g. Engineering parts stocked centrally but charged to Maintenance's cost centre). | P0 |

### 4.7 Reporting & dashboard

| ID | Requirement | Priority |
|---|---|---|
| PC-29 | Procurement dashboard KPIs: open requisitions awaiting sourcing, POs pending approval, POs overdue for delivery, budget burn %, and a live reorder-suggestion feed — replacing today's hardcoded scaffold numbers. | P0 |
| PC-30 | Spend analytics: by vendor, category, and department, over a selectable period, with export (CSV) for finance review. | P1 |
| PC-31 | Vendor performance report: on-time %, quality-rejection rate, price trend — surfaced both per-vendor and as a ranked list to support annual vendor review, a standard control in 5-star procurement operations. | P1 |

### 4.8 Settings

| ID | Requirement | Priority |
|---|---|---|
| PC-32 | Configure approval thresholds and approver chain per department. | P0 |
| PC-33 | Configure PO numbering format. | P0 |
| PC-34 | Manage vendor categories and per-category quality-inspection checklists. | P0 |
| PC-35 | Configure budget periods and default department budgets. | P0 |
| PC-36 | Configure the urgent-requisition SLA window and escalation recipients. | P1 |

---

## 5. Data model (proposed)

No ORM is used in this codebase — all schema changes follow the existing hand-written, timestamp-prefixed SQL migration convention in `supabase/migrations/`, in the `hotel` Postgres schema, with RLS enabled on every new table using the same `<table>_service_role_all` / `<table>_select_member` / `_insert_member` / `_update_member` policy pattern used by every existing HMS table.

| Table | Purpose | Key columns |
|---|---|---|
| `hotel.vendor_categories` | Tenant-editable lookup (mirrors `inventory_item_types`) | `id`, `tenant_id`, `name`, `sort_order` |
| `hotel.vendors` | Vendor register | `id`, `tenant_id`, `name`, `category_id`, `contact_name`, `phone`, `email`, `address`, `country`, `currency`, `payment_terms`, `lead_time_days`, `status`, `certifications` (jsonb), `is_preferred` |
| `hotel.vendor_price_catalog` | Agreed prices per item per vendor | `id`, `vendor_id`, `item_id` (FK `inventory_items`), `unit_price`, `currency`, `moq`, `valid_from`, `valid_to` |
| `hotel.purchase_orders` | PO header | `id`, `tenant_id`, `po_number`, `vendor_id`, `department`, `status` (`draft`→`pending_approval`→`approved`→`ordered`→`partially_received`/`received`→`closed`, or `rejected`/`cancelled`), `currency`, `fx_rate`, `subtotal`, `tax`, `total`, `expected_delivery_date`, `requested_by`, `created_by`, `approved_by`, `approved_at` |
| `hotel.purchase_order_lines` | PO line items | `id`, `po_id`, `requisition_line_id` (nullable FK), `item_id` (nullable FK `inventory_items`), `description`, `quantity`, `unit_cost`, `line_total`, `quantity_received` |
| `hotel.procurement_approval_thresholds` | Settings: threshold → approver role | `tenant_id`, `department`, `min_amount`, `max_amount`, `approver_role` |
| `hotel.procurement_budgets` | Department budget per period | `tenant_id`, `department`, `period_start`, `period_end`, `amount`, `currency` |
| `hotel.vendor_performance_reviews` | Scorecard inputs | `vendor_id`, `po_id`, `on_time`, `quality_score`, `notes`, `reviewed_by`, `created_at` |
| `hotel.inventory_receipts` *(existing — extend)* | Add real FK linkage instead of free text | add `vendor_id` (FK `vendors`), `purchase_order_id` (FK `purchase_orders`); keep `supplier_name`/`procurement_reference` as legacy fallback for receipts with no PO |

**Reused, not duplicated:** `hotel.inventory_requisitions` / `_lines` (demand intake — no new requisition table), `hotel.inventory_stock_movements` / `inventory_stock_levels` (the only source of truth for on-hand stock), `hotel.notifications`, `hotel.audit_logs`.

---

## 6. Roles & permissions — required code changes

- **`src/lib/hms/department-access.ts`:** extend `HmsSectionKey` with `procurement-vendors`, `procurement-orders`, `procurement-requisitions`, `procurement-receiving`, `procurement-budgets`, `procurement-reports`. Extend `DEPARTMENT_ROLE_SCOPES.Procurement` from its current 2-item nav (Dashboard, Settings) to the full set in §3, mirroring how `Store / Inventory` already has an 8-item scope.
- **Requisition-origin rule (PC-06):** enforce server-side in the requisition-creation API (reusing `requireHotelApiMember`) that the caller's `department_role` is `Store / Inventory` or an admin-like role (`isAdminLikeRole`) — reject with 403 otherwise. This is a business rule, not a UI convenience, so it must not rely solely on hiding the "New requisition" button from Procurement's UI.
- **Approval routing:** approver resolution reads `procurement_approval_thresholds`; if no Finance/Accounts module exists yet at implementation time, the "Finance" tier resolves to Admin/GM (documented as a known interim state — see §9).
- **`docs/PRD.md` §5.6 correction:** the current department-role table lists Procurement's scope as "Procurement, Inventory" — this PRD keeps Procurement's *view* into Inventory read-only (to see stock/reorder data) but does not grant Inventory's write actions (requisition creation, stock counts, transfers) to the Procurement role, per §4.2/PC-06.

---

## 7. Integration points (reuse, don't rebuild)

| Existing seam | How Procurement uses it |
|---|---|
| `GET /api/hotel/inventory/reorder-suggestions` | Populates the auto-suggested requisition feed (PC-07) — explicitly built for this purpose already. |
| `hotel.inventory_requisitions` + its approve/reject/issue/cancel API pattern | Copied wholesale for the PO approval workflow's status machine and API shape (`PATCH .../orders/[id]/approve`, `/reject`, etc.). |
| `hotel.inventory_stock_movements` (`receipt` type) | Goods receiving posts here, not to a new Procurement-owned ledger (PC-23). |
| `notification-rules.ts` (`notifyLowStock`, etc.) | Add `notifyRequisitionReadyForSourcing`, `notifyPoApprovalNeeded`, `notifyPoApproved`, `notifyGoodsReceivedDiscrepancy`, `notifyBudgetThresholdReached`, following the exact existing pattern. |
| `hotel.audit_logs` + `writeAuditLog()` | Every PO/vendor/approval mutation is logged, same as Front Desk folio actions. |
| Front Desk's branded PDF generation (folio/receipt) | Reused for the branded PO PDF (PC-14) rather than a new PDF pipeline. |

---

## 8. Non-functional requirements

- **NFR-1 Data integrity:** stock quantity has exactly one writer (Inventory's movement ledger); Procurement must never write stock levels directly.
- **NFR-2 Auditability:** every approval, rejection, and discrepancy is permanently logged with actor and timestamp — this module will be scrutinized by ownership/franchisor audits more than most.
- **NFR-3 Access control:** the requisition-origin rule (PC-06) and approval thresholds (PC-16) are enforced at the API layer, never only in the UI.
- **NFR-4 Mobile-friendly approvals:** GM/Finance approval actions must be usable from a phone browser — approvals are frequently done away from a desk.
- **NFR-5 Currency correctness:** any multi-currency PO stores the FX rate at time of order; totals are never silently recalculated at a later, different rate.
- **NFR-6 Consistency:** UI composed entirely from existing shadcn/`radix-nova` primitives and the existing `DepartmentDashboardScaffold` → real-client-component migration pattern already used by Inventory.

---

## 9. Dependencies & known interim states

- **Accounts/Finance module is currently a scaffold.** Until it exists, "Finance approval" and "handoff for payment" resolve to Admin/GM. This is acceptable for v1 but should be revisited when Accounts is built, per the master PRD's Module 08 pairing.
- **Inventory module is the foundation this is built on.** Any breaking change to `inventory_items`, `inventory_requisitions`, or the stock movement ledger during Procurement's build must be coordinated — Procurement should not fork its own copy of these concepts.

---

## 10. Implementation plan

Phased to ship value early (visibility into real requisitions/reorder data) before the full approval/quality control depth lands.

| Phase | Scope | Depends on |
|---|---|---|
| **Phase 0 — Foundation** | Migrations for `vendor_categories`, `vendors`, `purchase_orders`, `purchase_order_lines`, `procurement_approval_thresholds`. Extend `department-access.ts` scopes. `requireHotelApiMember`-based API skeleton. | — |
| **Phase 1 — Vendors & demand intake** | Vendor register CRUD + UI. Requisition inbox consuming existing `inventory_requisitions` + reorder-suggestions feed. Enforce PC-06 origin rule. | Phase 0 |
| **Phase 2 — Purchase orders & approvals** | PO creation (from requisition or manual), line items, PO numbering, multi-tier approval engine, notifications, audit log wiring. | Phase 1 |
| **Phase 3 — Receiving & quality control** | GRN UI against a PO, per-category quality checklist, discrepancy flagging, inventory stock-movement posting (PC-20–24). | Phase 2, Inventory receiving module |
| **Phase 4 — Budgets, invoice matching, analytics** | Department budgets, 3-way match, spend/vendor performance reports, dashboard KPIs replacing scaffold numbers. | Phase 3 |
| **Phase 5 — Polish** | Branded PO PDF/email, vendor price catalog pre-fill, mobile approval deep links, vendor performance scorecard UI. | Phase 4 |

**Suggested sequencing note:** Phases 0–2 alone already replace the current dashboard scaffold with a real, auditable requisition-to-PO flow — a reasonable v1 cut line if the timeline needs to compress. Phases 3–5 are what make it "5-star" rather than merely functional (quality control, branded documents, budget discipline, vendor accountability) and should not be dropped without a conscious tradeoff conversation.

---

## 11. Success metrics

| Metric | Definition | Target (to be set with Ops/Finance) |
|---|---|---|
| Requisition-to-PO cycle time | Time from requisition approval to PO issuance | |
| PO approval SLA compliance | % of approvals completed within the configured window | |
| On-time delivery rate | % of PO lines received by expected delivery date | |
| Quality rejection rate | % of received lines failing inspection | |
| Budget adherence | % of departments within budget per period | |
| Spend under preferred vendors | % of total spend with `preferred`-status vendors | |
| Discrepancy resolution time | Time from flagged discrepancy to resolution | |

---

## 12. Open questions (v2 candidates)

1. **Vendor self-service portal:** should vendors submit quotes/invoices directly, or does this stay staff-entered indefinitely?
2. **Formal RFQ/e-tendering:** worth building once vendor volume justifies it, or is lightweight quote-attach (PC-15) sufficient long-term?
3. **Accounts/Finance module timing:** should Procurement's invoice-matching (PC-25/26) wait for Accounts to be real, or ship against Admin/GM as an interim approver indefinitely?
4. **FX source:** manual entry at PO time (v1 assumption) vs. a live FX-rate API integration?
5. **Contract e-signature:** needed for vendor contracts, or is a stored PDF sufficient for v1?
6. **Cross-property vendor sharing:** for future multi-property groups, should a preferred vendor be shareable across tenants, or strictly per-hotel as today's tenant isolation implies?

---

## 13. Document control

| Version | Date | Author | Notes |
|---|---|---|---|
| 1.0 | 2026-07-13 | Engineering (drafted with product input) | Initial draft PRD & implementation plan for the Procurement module |

---

*End of PRD*
