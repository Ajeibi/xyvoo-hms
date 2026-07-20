-- Inventory & Store: multi-location stock, catalog, movements ledger,
-- requisitions, transfers, receiving, and physical stock counts.

create table if not exists hotel.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  location_type text not null default 'other' check (location_type in (
    'main_store', 'kitchen_store', 'bar_store', 'housekeeping_store', 'engineering_store', 'other'
  )),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists hotel.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  parent_id uuid references hotel.inventory_categories(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists hotel.inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sku text not null,
  name text not null,
  category_id uuid references hotel.inventory_categories(id) on delete set null,
  unit_of_measure text not null default 'piece' check (unit_of_measure in (
    'piece', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'roll', 'bottle', 'can', 'carton', 'pair', 'set'
  )),
  item_type text not null default 'consumable' check (item_type in (
    'consumable', 'linen', 'amenity', 'beverage', 'food', 'engineering_spare', 'asset', 'other'
  )),
  unit_cost numeric(14,2) not null default 0,
  barcode text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create table if not exists hotel.inventory_stock_levels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references hotel.inventory_items(id) on delete cascade,
  location_id uuid not null references hotel.inventory_locations(id) on delete cascade,
  qty_on_hand numeric(14,3) not null default 0,
  par_level numeric(14,3) not null default 0,
  reorder_point numeric(14,3) not null default 0,
  reorder_qty numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  unique (item_id, location_id)
);

create table if not exists hotel.inventory_stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references hotel.inventory_items(id) on delete cascade,
  location_id uuid not null references hotel.inventory_locations(id) on delete cascade,
  movement_type text not null check (movement_type in (
    'receipt', 'issue', 'transfer_out', 'transfer_in', 'adjustment', 'waste', 'count_variance'
  )),
  qty numeric(14,3) not null,
  unit_cost_at_movement numeric(14,2) not null default 0,
  related_location_id uuid references hotel.inventory_locations(id) on delete set null,
  reference_type text,
  reference_id uuid,
  reason text,
  performed_by uuid,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists hotel.inventory_requisitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requisition_number text not null,
  requesting_department text not null,
  from_location_id uuid not null references hotel.inventory_locations(id) on delete restrict,
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'partially_issued', 'issued', 'rejected', 'cancelled'
  )),
  requested_by uuid not null,
  approved_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hotel.inventory_requisition_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requisition_id uuid not null references hotel.inventory_requisitions(id) on delete cascade,
  item_id uuid not null references hotel.inventory_items(id) on delete restrict,
  qty_requested numeric(14,3) not null,
  qty_issued numeric(14,3) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists hotel.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  transfer_number text not null,
  from_location_id uuid not null references hotel.inventory_locations(id) on delete restrict,
  to_location_id uuid not null references hotel.inventory_locations(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'in_transit', 'completed', 'cancelled')),
  initiated_by uuid not null,
  received_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hotel.inventory_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  transfer_id uuid not null references hotel.inventory_transfers(id) on delete cascade,
  item_id uuid not null references hotel.inventory_items(id) on delete restrict,
  qty numeric(14,3) not null,
  created_at timestamptz not null default now()
);

create table if not exists hotel.inventory_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  receipt_number text not null,
  location_id uuid not null references hotel.inventory_locations(id) on delete restrict,
  supplier_name text,
  procurement_reference text,
  received_by uuid not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists hotel.inventory_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  receipt_id uuid not null references hotel.inventory_receipts(id) on delete cascade,
  item_id uuid not null references hotel.inventory_items(id) on delete restrict,
  qty_received numeric(14,3) not null,
  unit_cost numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists hotel.inventory_stock_counts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references hotel.inventory_locations(id) on delete restrict,
  count_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'completed', 'posted')),
  started_by uuid,
  posted_by uuid,
  posted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hotel.inventory_stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  count_id uuid not null references hotel.inventory_stock_counts(id) on delete cascade,
  item_id uuid not null references hotel.inventory_items(id) on delete restrict,
  system_qty numeric(14,3) not null default 0,
  counted_qty numeric(14,3),
  created_at timestamptz not null default now(),
  unique (count_id, item_id)
);

-- Indexes
create index if not exists idx_inventory_locations_tenant on hotel.inventory_locations (tenant_id);
create index if not exists idx_inventory_categories_tenant on hotel.inventory_categories (tenant_id);
create index if not exists idx_inventory_items_tenant on hotel.inventory_items (tenant_id);
create index if not exists idx_inventory_items_category on hotel.inventory_items (tenant_id, category_id);
create index if not exists idx_inventory_stock_levels_tenant on hotel.inventory_stock_levels (tenant_id);
create index if not exists idx_inventory_stock_levels_location on hotel.inventory_stock_levels (tenant_id, location_id);
create index if not exists idx_inventory_stock_levels_low_stock on hotel.inventory_stock_levels (tenant_id) where qty_on_hand <= reorder_point;
create index if not exists idx_inventory_stock_movements_tenant_created on hotel.inventory_stock_movements (tenant_id, created_at desc);
create index if not exists idx_inventory_stock_movements_item on hotel.inventory_stock_movements (tenant_id, item_id, created_at desc);
create index if not exists idx_inventory_stock_movements_location on hotel.inventory_stock_movements (tenant_id, location_id, created_at desc);
create index if not exists idx_inventory_requisitions_tenant on hotel.inventory_requisitions (tenant_id, status, created_at desc);
create index if not exists idx_inventory_requisition_lines_req on hotel.inventory_requisition_lines (requisition_id);
create index if not exists idx_inventory_transfers_tenant on hotel.inventory_transfers (tenant_id, status, created_at desc);
create index if not exists idx_inventory_transfer_lines_transfer on hotel.inventory_transfer_lines (transfer_id);
create index if not exists idx_inventory_receipts_tenant on hotel.inventory_receipts (tenant_id, created_at desc);
create index if not exists idx_inventory_receipt_lines_receipt on hotel.inventory_receipt_lines (receipt_id);
create index if not exists idx_inventory_stock_counts_tenant on hotel.inventory_stock_counts (tenant_id, status, created_at desc);
create index if not exists idx_inventory_stock_count_lines_count on hotel.inventory_stock_count_lines (count_id);

-- RLS
do $$
declare
  t text;
begin
  foreach t in array array[
    'inventory_locations', 'inventory_categories', 'inventory_items', 'inventory_stock_levels',
    'inventory_stock_movements', 'inventory_requisitions', 'inventory_requisition_lines',
    'inventory_transfers', 'inventory_transfer_lines', 'inventory_receipts', 'inventory_receipt_lines',
    'inventory_stock_counts', 'inventory_stock_count_lines'
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
  end loop;
end $$;
