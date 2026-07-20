-- Turn Units of measure, Item types, and Store location types from fixed
-- code-level enums into real tenant-managed lookup tables, matching how
-- Categories and Stores already work. Existing inventory_items /
-- inventory_locations rows are remapped onto the new tables so nothing
-- already in use is lost.

create table if not exists hotel.inventory_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists hotel.inventory_item_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists hotel.inventory_location_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_inventory_units_tenant on hotel.inventory_units (tenant_id);
create index if not exists idx_inventory_item_types_tenant on hotel.inventory_item_types (tenant_id);
create index if not exists idx_inventory_location_types_tenant on hotel.inventory_location_types (tenant_id);

-- Seed every hotel tenant with the previous fixed list as a real, editable
-- starting point, so nothing already relying on these values regresses.
insert into hotel.inventory_units (tenant_id, name, code, sort_order)
select t.id, v.name, v.code, v.sort_order
from public.tenants t
cross join (values
  ('Piece', 'piece', 0), ('Kg', 'kg', 1), ('g', 'g', 2), ('Litre', 'litre', 3), ('ml', 'ml', 4),
  ('Box', 'box', 5), ('Pack', 'pack', 6), ('Roll', 'roll', 7), ('Bottle', 'bottle', 8),
  ('Can', 'can', 9), ('Carton', 'carton', 10), ('Pair', 'pair', 11), ('Set', 'set', 12)
) as v(name, code, sort_order)
where t.product = 'hotel'
on conflict (tenant_id, code) do nothing;

insert into hotel.inventory_item_types (tenant_id, name, code, sort_order)
select t.id, v.name, v.code, v.sort_order
from public.tenants t
cross join (values
  ('Consumable', 'consumable', 0), ('Linen', 'linen', 1), ('Guest amenity', 'amenity', 2),
  ('Beverage', 'beverage', 3), ('Food', 'food', 4), ('Engineering spare', 'engineering_spare', 5),
  ('Asset', 'asset', 6), ('Other', 'other', 7)
) as v(name, code, sort_order)
where t.product = 'hotel'
on conflict (tenant_id, code) do nothing;

insert into hotel.inventory_location_types (tenant_id, name, code, sort_order)
select t.id, v.name, v.code, v.sort_order
from public.tenants t
cross join (values
  ('Main Store', 'main_store', 0), ('Kitchen Store', 'kitchen_store', 1), ('Bar Store', 'bar_store', 2),
  ('Housekeeping Store', 'housekeeping_store', 3), ('Engineering Store', 'engineering_store', 4), ('Other', 'other', 5)
) as v(name, code, sort_order)
where t.product = 'hotel'
on conflict (tenant_id, code) do nothing;

-- Remap hotel.inventory_items.unit_of_measure / item_type from text-enum to FK.
alter table hotel.inventory_items add column if not exists unit_of_measure_id uuid references hotel.inventory_units(id);
update hotel.inventory_items ii
set unit_of_measure_id = iu.id
from hotel.inventory_units iu
where iu.tenant_id = ii.tenant_id and iu.code = ii.unit_of_measure and ii.unit_of_measure_id is null;

alter table hotel.inventory_items add column if not exists item_type_id uuid references hotel.inventory_item_types(id);
update hotel.inventory_items ii
set item_type_id = it.id
from hotel.inventory_item_types it
where it.tenant_id = ii.tenant_id and it.code = ii.item_type and ii.item_type_id is null;

-- Safety net: any row that somehow didn't match a seeded code falls back to
-- that tenant's "piece" / "other" entry rather than being left dangling.
update hotel.inventory_items ii
set unit_of_measure_id = (select id from hotel.inventory_units where tenant_id = ii.tenant_id and code = 'piece' limit 1)
where ii.unit_of_measure_id is null;

update hotel.inventory_items ii
set item_type_id = (select id from hotel.inventory_item_types where tenant_id = ii.tenant_id and code = 'other' limit 1)
where ii.item_type_id is null;

alter table hotel.inventory_items alter column unit_of_measure_id set not null;
alter table hotel.inventory_items alter column item_type_id set not null;

alter table hotel.inventory_items drop column unit_of_measure;
alter table hotel.inventory_items drop column item_type;
alter table hotel.inventory_items rename column unit_of_measure_id to unit_of_measure;
alter table hotel.inventory_items rename column item_type_id to item_type;

-- Remap hotel.inventory_locations.location_type from text-enum to FK.
alter table hotel.inventory_locations add column if not exists location_type_id uuid references hotel.inventory_location_types(id);
update hotel.inventory_locations il
set location_type_id = lt.id
from hotel.inventory_location_types lt
where lt.tenant_id = il.tenant_id and lt.code = il.location_type and il.location_type_id is null;

update hotel.inventory_locations il
set location_type_id = (select id from hotel.inventory_location_types where tenant_id = il.tenant_id and code = 'other' limit 1)
where il.location_type_id is null;

alter table hotel.inventory_locations alter column location_type_id set not null;
alter table hotel.inventory_locations drop column location_type;
alter table hotel.inventory_locations rename column location_type_id to location_type;

create index if not exists idx_inventory_items_unit on hotel.inventory_items (unit_of_measure);
create index if not exists idx_inventory_items_type on hotel.inventory_items (item_type);
create index if not exists idx_inventory_locations_type on hotel.inventory_locations (location_type);

-- RLS for the 3 new tables
do $$
declare
  t text;
begin
  foreach t in array array['inventory_units', 'inventory_item_types', 'inventory_location_types']
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
