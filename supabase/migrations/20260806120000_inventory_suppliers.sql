-- Structured supplier record: receipts currently only carry a free-text
-- supplier_name. Add a real, reusable supplier register per tenant and link
-- receipts to it while keeping supplier_name for ad-hoc / unregistered suppliers.

create table if not exists hotel.inventory_suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  email text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_suppliers_tenant on hotel.inventory_suppliers (tenant_id);

alter table hotel.inventory_receipts add column if not exists supplier_id uuid references hotel.inventory_suppliers(id);

-- RLS, matching the tenant-scoped member/service-role pattern used by every
-- other inventory lookup table (see 20260724120000_inventory_lookup_tables.sql).
alter table hotel.inventory_suppliers enable row level security;
alter table hotel.inventory_suppliers force row level security;

drop policy if exists inventory_suppliers_service_role_all on hotel.inventory_suppliers;
create policy inventory_suppliers_service_role_all on hotel.inventory_suppliers for all to public using (true) with check (true);

drop policy if exists inventory_suppliers_select_member on hotel.inventory_suppliers;
create policy inventory_suppliers_select_member on hotel.inventory_suppliers for select to authenticated
  using (exists (select 1 from hotel.memberships m where m.tenant_id = inventory_suppliers.tenant_id and m.user_id = auth.uid()));

drop policy if exists inventory_suppliers_insert_member on hotel.inventory_suppliers;
create policy inventory_suppliers_insert_member on hotel.inventory_suppliers for insert to authenticated
  with check (exists (select 1 from hotel.memberships m where m.tenant_id = inventory_suppliers.tenant_id and m.user_id = auth.uid()));

drop policy if exists inventory_suppliers_update_member on hotel.inventory_suppliers;
create policy inventory_suppliers_update_member on hotel.inventory_suppliers for update to authenticated
  using (exists (select 1 from hotel.memberships m where m.tenant_id = inventory_suppliers.tenant_id and m.user_id = auth.uid()));

drop policy if exists inventory_suppliers_delete_member on hotel.inventory_suppliers;
create policy inventory_suppliers_delete_member on hotel.inventory_suppliers for delete to authenticated
  using (exists (select 1 from hotel.memberships m where m.tenant_id = inventory_suppliers.tenant_id and m.user_id = auth.uid()));
