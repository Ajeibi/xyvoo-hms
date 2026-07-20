-- Guest service categories become tenant-configurable (name + which department handles them)
-- instead of a hardcoded list, and notifications gain optional department targeting so raising
-- a request notifies the department that actually owns it, not everyone in the tenant.

create table if not exists hotel.guest_service_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  department text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_guest_service_categories_tenant on hotel.guest_service_categories (tenant_id);

comment on table hotel.guest_service_categories is
  'Tenant-editable guest service request categories and which department each routes to. Replaces the old hardcoded GUEST_SERVICE_CATEGORIES list.';

-- Seed every existing hotel tenant with the previous hardcoded list + department mapping as a
-- real, editable starting point, so nothing already relying on these values regresses.
insert into hotel.guest_service_categories (tenant_id, name, code, department, sort_order)
select t.id, v.name, v.code, v.department, v.sort_order
from public.tenants t
cross join (values
  ('Housekeeping', 'housekeeping', 'housekeeping', 0),
  ('Laundry', 'laundry', 'laundry', 1),
  ('Food & beverage', 'food_beverage', 'food_beverage', 2),
  ('Concierge', 'concierge', 'concierge', 3),
  ('Maintenance', 'maintenance', 'maintenance', 4),
  ('Security', 'security', 'security', 5),
  ('Spa', 'spa', 'front_desk', 6),
  ('Transportation', 'transportation', 'concierge', 7),
  ('Special', 'special', 'front_desk', 8),
  ('Other', 'other', 'front_desk', 9)
) as v(name, code, department, sort_order)
where t.product = 'hotel'
on conflict (tenant_id, code) do nothing;

-- service_category is now validated against the tenant's own guest_service_categories.code
-- list at the application layer, not a fixed DB enum.
alter table hotel.guest_requests drop constraint if exists guest_requests_service_category_check;

-- Notifications can now target a specific department (null = tenant-wide, visible to everyone).
alter table hotel.notifications add column if not exists department text;
create index if not exists idx_notifications_tenant_department on hotel.notifications (tenant_id, department);

do $$
declare
  t text;
begin
  foreach t in array array['guest_service_categories']
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
