-- Housekeeping <-> Inventory integration: room-type supply pars (linen/amenity/consumable
-- quantities expected per room type), consumed via Inventory's existing stock ledger on task
-- completion, with a fallback to Inventory's existing requisition mechanism when short.

create table if not exists hotel.housekeeping_room_type_pars (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_type_code text not null,
  item_id uuid not null references hotel.inventory_items(id) on delete cascade,
  par_qty numeric(14,3) not null default 1 check (par_qty >= 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, room_type_code, item_id)
);

create index if not exists idx_hk_room_type_pars_tenant on hotel.housekeeping_room_type_pars (tenant_id, room_type_code);

comment on table hotel.housekeeping_room_type_pars is
  'Expected linen/amenity/consumable quantity per room type, drawn from Inventory''s existing item catalog. Consumption posts to hotel.inventory_stock_movements; Housekeeping does not maintain its own stock number.';

do $$
declare
  t text;
begin
  foreach t in array array['housekeeping_room_type_pars']
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
