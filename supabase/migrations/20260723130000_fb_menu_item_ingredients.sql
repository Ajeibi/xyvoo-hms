-- Recipe / BOM link between F&B menu items and inventory stock items, so a
-- served dish can automatically deduct its ingredients from stock.

create table if not exists hotel.fb_menu_item_ingredients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  menu_item_id uuid not null references hotel.fb_menu_items(id) on delete cascade,
  inventory_item_id uuid not null references hotel.inventory_items(id) on delete cascade,
  qty_per_serving numeric(14,3) not null,
  created_at timestamptz not null default now(),
  unique (menu_item_id, inventory_item_id)
);

create index if not exists idx_fb_menu_item_ingredients_tenant on hotel.fb_menu_item_ingredients (tenant_id);
create index if not exists idx_fb_menu_item_ingredients_menu_item on hotel.fb_menu_item_ingredients (menu_item_id);

alter table hotel.fb_menu_item_ingredients enable row level security;
alter table hotel.fb_menu_item_ingredients force row level security;

drop policy if exists fb_menu_item_ingredients_service_role_all on hotel.fb_menu_item_ingredients;
create policy fb_menu_item_ingredients_service_role_all on hotel.fb_menu_item_ingredients for all to public using (true) with check (true);

drop policy if exists fb_menu_item_ingredients_select_member on hotel.fb_menu_item_ingredients;
create policy fb_menu_item_ingredients_select_member on hotel.fb_menu_item_ingredients for select to authenticated
  using (exists (select 1 from hotel.memberships m where m.tenant_id = fb_menu_item_ingredients.tenant_id and m.user_id = auth.uid()));

drop policy if exists fb_menu_item_ingredients_insert_member on hotel.fb_menu_item_ingredients;
create policy fb_menu_item_ingredients_insert_member on hotel.fb_menu_item_ingredients for insert to authenticated
  with check (exists (select 1 from hotel.memberships m where m.tenant_id = fb_menu_item_ingredients.tenant_id and m.user_id = auth.uid()));

drop policy if exists fb_menu_item_ingredients_update_member on hotel.fb_menu_item_ingredients;
create policy fb_menu_item_ingredients_update_member on hotel.fb_menu_item_ingredients for update to authenticated
  using (exists (select 1 from hotel.memberships m where m.tenant_id = fb_menu_item_ingredients.tenant_id and m.user_id = auth.uid()));

drop policy if exists fb_menu_item_ingredients_delete_member on hotel.fb_menu_item_ingredients;
create policy fb_menu_item_ingredients_delete_member on hotel.fb_menu_item_ingredients for delete to authenticated
  using (exists (select 1 from hotel.memberships m where m.tenant_id = fb_menu_item_ingredients.tenant_id and m.user_id = auth.uid()));

-- Track which fb_order_items have already had their ingredient stock deducted,
-- so a retried "served" status update never double-deducts.
alter table hotel.fb_order_items add column if not exists ingredients_deducted_at timestamptz;
