-- Procurement: vendor register, purchase orders, multi-tier approvals,
-- goods receiving with quality control, budgets, and vendor performance.
-- Demand intake is NOT duplicated here — Procurement sources against the
-- existing hotel.inventory_requisitions (raised only by Inventory/Admin).

create table if not exists hotel.vendor_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists hotel.vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  category_id uuid references hotel.vendor_categories(id) on delete set null,
  contact_name text,
  phone text,
  email text,
  address text,
  country text,
  currency text not null default 'NGN',
  payment_terms text,
  lead_time_days int not null default 0,
  status text not null default 'active' check (status in ('active', 'preferred', 'inactive', 'blacklisted')),
  certifications jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists hotel.vendor_price_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vendor_id uuid not null references hotel.vendors(id) on delete cascade,
  item_id uuid not null references hotel.inventory_items(id) on delete cascade,
  unit_price numeric(14,2) not null default 0,
  currency text not null default 'NGN',
  moq numeric(14,3) not null default 0,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  unique (vendor_id, item_id)
);

create table if not exists hotel.procurement_approval_thresholds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  department text not null default 'All departments',
  min_amount numeric(14,2) not null default 0,
  max_amount numeric(14,2),
  approver_role text not null check (approver_role in ('auto', 'gm', 'finance')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists hotel.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  po_number text not null,
  vendor_id uuid not null references hotel.vendors(id) on delete restrict,
  department text not null default 'Procurement',
  status text not null default 'draft' check (status in (
    'draft', 'pending_approval', 'approved', 'ordered',
    'partially_received', 'received', 'closed', 'rejected', 'cancelled'
  )),
  currency text not null default 'NGN',
  fx_rate numeric(14,6) not null default 1,
  subtotal numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  expected_delivery_date date,
  is_manual boolean not null default false,
  manual_reason text,
  notes text,
  requested_by uuid,
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  invoice_number text,
  invoice_amount numeric(14,2),
  invoice_matched_at timestamptz,
  invoice_variance numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hotel.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  po_id uuid not null references hotel.purchase_orders(id) on delete cascade,
  requisition_line_id uuid references hotel.inventory_requisition_lines(id) on delete set null,
  item_id uuid references hotel.inventory_items(id) on delete set null,
  description text not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  quantity_received numeric(14,3) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists hotel.procurement_budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  department text not null,
  period_start date not null,
  period_end date not null,
  amount numeric(14,2) not null default 0,
  currency text not null default 'NGN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, department, period_start)
);

create table if not exists hotel.vendor_performance_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vendor_id uuid not null references hotel.vendors(id) on delete cascade,
  po_id uuid references hotel.purchase_orders(id) on delete set null,
  on_time boolean not null default true,
  quality_score int not null default 5 check (quality_score between 1 and 5),
  notes text,
  reviewed_by uuid not null,
  created_at timestamptz not null default now()
);

-- Per-item-type quality inspection checklist, applied at goods receiving.
create table if not exists hotel.procurement_quality_checklists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_type_id uuid not null references hotel.inventory_item_types(id) on delete cascade,
  checklist_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, item_type_id)
);

-- Extend existing Inventory receiving tables with real vendor/PO linkage and
-- per-line quality-control outcome, instead of the free-text stubs.
alter table hotel.inventory_receipts add column if not exists vendor_id uuid references hotel.vendors(id) on delete set null;
alter table hotel.inventory_receipts add column if not exists purchase_order_id uuid references hotel.purchase_orders(id) on delete set null;

alter table hotel.inventory_receipt_lines add column if not exists purchase_order_line_id uuid references hotel.purchase_order_lines(id) on delete set null;
alter table hotel.inventory_receipt_lines add column if not exists qty_rejected numeric(14,3) not null default 0;
alter table hotel.inventory_receipt_lines add column if not exists discrepancy_type text not null default 'none' check (discrepancy_type in (
  'none', 'short_delivered', 'damaged', 'wrong_item', 'failed_inspection'
));
alter table hotel.inventory_receipt_lines add column if not exists quality_passed boolean not null default true;
alter table hotel.inventory_receipt_lines add column if not exists quality_notes text;

-- Indexes
create index if not exists idx_vendor_categories_tenant on hotel.vendor_categories (tenant_id);
create index if not exists idx_vendors_tenant on hotel.vendors (tenant_id, status);
create index if not exists idx_vendor_price_catalog_vendor on hotel.vendor_price_catalog (vendor_id);
create index if not exists idx_vendor_price_catalog_item on hotel.vendor_price_catalog (item_id);
create index if not exists idx_procurement_approval_thresholds_tenant on hotel.procurement_approval_thresholds (tenant_id, sort_order);
create index if not exists idx_purchase_orders_tenant on hotel.purchase_orders (tenant_id, status, created_at desc);
create index if not exists idx_purchase_orders_vendor on hotel.purchase_orders (tenant_id, vendor_id);
create index if not exists idx_purchase_order_lines_po on hotel.purchase_order_lines (po_id);
create index if not exists idx_purchase_order_lines_requisition_line on hotel.purchase_order_lines (requisition_line_id);
create index if not exists idx_procurement_budgets_tenant on hotel.procurement_budgets (tenant_id, department, period_start desc);
create index if not exists idx_vendor_performance_reviews_vendor on hotel.vendor_performance_reviews (tenant_id, vendor_id);
create index if not exists idx_procurement_quality_checklists_tenant on hotel.procurement_quality_checklists (tenant_id);

-- RLS
do $$
declare
  t text;
begin
  foreach t in array array[
    'vendor_categories', 'vendors', 'vendor_price_catalog', 'procurement_approval_thresholds',
    'purchase_orders', 'purchase_order_lines', 'procurement_budgets', 'vendor_performance_reviews',
    'procurement_quality_checklists'
  ]
  loop
    execute format('alter table hotel.%I enable row level security', t);
    execute format('alter table hotel.%I force row level security', t);

    execute format('drop policy if exists %I_service_role_all on hotel.%I', t, t);
    execute format(
      'create policy %I_service_role_all on hotel.%I for all to public using (true) with check (true)',
      t, t
    );
    execute format('drop policy if exists %I_select_member on hotel.%I', t, t);
    execute format(
      'create policy %I_select_member on hotel.%I for select to authenticated
       using (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
    execute format('drop policy if exists %I_insert_member on hotel.%I', t, t);
    execute format(
      'create policy %I_insert_member on hotel.%I for insert to authenticated
       with check (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
    execute format('drop policy if exists %I_update_member on hotel.%I', t, t);
    execute format(
      'create policy %I_update_member on hotel.%I for update to authenticated
       using (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
    execute format('drop policy if exists %I_delete_member on hotel.%I', t, t);
    execute format(
      'create policy %I_delete_member on hotel.%I for delete to authenticated
       using (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
  end loop;
end $$;

-- Seed every hotel tenant with a starting vendor category list, same
-- bootstrap convention as inventory_units / inventory_item_types.
insert into hotel.vendor_categories (tenant_id, name, code, sort_order)
select t.id, v.name, v.code, v.sort_order
from public.tenants t
cross join (values
  ('Food & Beverage', 'food_beverage', 0), ('Linen & Amenities', 'linen_amenities', 1),
  ('Engineering & Parts', 'engineering_parts', 2), ('Cleaning Supplies', 'cleaning_supplies', 3),
  ('Office & Admin', 'office_admin', 4), ('Other', 'other', 5)
) as v(name, code, sort_order)
where t.product = 'hotel'
on conflict (tenant_id, code) do nothing;

-- Seed a sensible default approval threshold so the workflow is usable
-- immediately: everything auto-approves until an owner/admin configures
-- real thresholds in Settings.
insert into hotel.procurement_approval_thresholds (tenant_id, department, min_amount, max_amount, approver_role, sort_order)
select t.id, 'All departments', 0, null, 'gm', 0
from public.tenants t
where t.product = 'hotel'
and not exists (
  select 1 from hotel.procurement_approval_thresholds pat where pat.tenant_id = t.id
);
