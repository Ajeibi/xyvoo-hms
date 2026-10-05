-- Procurement & Inventory now auto-post to the general ledger (Phase 3 of the Accounts
-- overhaul): PO receiving auto-creates and posts a vendor bill, and inventory
-- consumption/waste/stock-count variances post their own entries. See src/lib/hms/
-- procurement-receiving.ts, inventory-requisitions.ts, inventory-stock.ts, inventory-counts.ts.

-- "Cost of Goods Sold — F&B" was F&B-specific in name only; every department's inventory
-- consumption now posts here too (broken down by the `department` tag on each journal line,
-- not by a separate GL account per department) — renaming so the Income Statement doesn't
-- mislabel Housekeeping/Engineering consumption as F&B.
update hotel.chart_of_accounts set name = 'Cost of Goods Sold' where code = '5000';

-- New account for inventory write-offs (waste, count shrinkage) — kept separate from planned
-- COGS since a loss isn't the same economic event as a sale's cost.
-- Learned from a prior-phase bug: a new seeded account must be added to
-- HOSPITALITY_STARTER_ACCOUNTS (for future tenants) AND backfilled here (for tenants who
-- already seeded a chart) — both, not just one. Only backfilled for tenants that already
-- have a chart of accounts (code 1400 present) — a tenant with no chart yet will get it from
-- HOSPITALITY_STARTER_ACCOUNTS when they seed.
insert into hotel.chart_of_accounts (tenant_id, code, name, type, is_active)
select t.id, '5010', 'Inventory Shrinkage & Adjustments', 'expense', true
from public.tenants t
where exists (select 1 from hotel.chart_of_accounts c where c.tenant_id = t.id and c.code = '1400')
  and not exists (select 1 from hotel.chart_of_accounts c where c.tenant_id = t.id and c.code = '5010');

-- Traceability anchors: nullable, stamped once the corresponding event auto-posts, so the
-- receipt/count detail view can show which journal entry (if any) it produced. Not used as a
-- pre-posting idempotency guard for inventory_receipts (every receiving call inserts a brand
-- new row, so there's nothing to double-post) or inventory_stock_counts (already guarded by
-- its own status transition, tightened below). inventory_requisitions is deliberately excluded
-- — a single requisition can be issued in several partial calls, each posting its own entry, so
-- there's no one-to-one journal_entry_id to anchor there; each posting instead carries the
-- requisition's id as its own `reference`.
alter table hotel.inventory_receipts add column if not exists journal_entry_id uuid references hotel.journal_entries(id);
alter table hotel.inventory_stock_counts add column if not exists journal_entry_id uuid references hotel.journal_entries(id);
-- No RLS changes needed — these are columns on already-RLS-protected existing tables.
