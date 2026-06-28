-- F&B / Kitchen order engine (restaurant + bar, KDS)

create table if not exists hotel.fb_outlets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  outlet_type text not null check (outlet_type in ('restaurant', 'bar', 'room_service')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists hotel.fb_stations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  unique (tenant_id, code)
);

create table if not exists hotel.fb_menu_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  outlet_id uuid not null references hotel.fb_outlets(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists hotel.fb_menu_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  outlet_id uuid not null references hotel.fb_outlets(id) on delete cascade,
  category_id uuid references hotel.fb_menu_categories(id) on delete set null,
  station_id uuid references hotel.fb_stations(id) on delete set null,
  name text not null,
  description text,
  price numeric(14, 2) not null default 0,
  is_available boolean not null default true,
  eighty_sixed_at timestamptz,
  eighty_sixed_by uuid,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hotel.fb_tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  outlet_id uuid not null references hotel.fb_outlets(id) on delete cascade,
  table_code text not null,
  covers int not null default 4,
  status text not null default 'available'
    check (status in ('available', 'seated', 'dirty')),
  created_at timestamptz not null default now(),
  unique (tenant_id, outlet_id, table_code)
);

create table if not exists hotel.fb_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  outlet_id uuid not null references hotel.fb_outlets(id) on delete restrict,
  order_number text not null,
  table_id uuid references hotel.fb_tables(id) on delete set null,
  tab_label text,
  reservation_id uuid references hotel.reservations(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'sent_to_kitchen', 'ready', 'closed', 'voided')),
  rush boolean not null default false,
  placed_by uuid,
  sent_to_kitchen_at timestamptz,
  closed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  subtotal numeric(14, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hotel.fb_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references hotel.fb_orders(id) on delete cascade,
  menu_item_id uuid references hotel.fb_menu_items(id) on delete set null,
  name_snapshot text not null,
  price_snapshot numeric(14, 2) not null default 0,
  quantity int not null default 1 check (quantity > 0),
  station_id uuid references hotel.fb_stations(id) on delete set null,
  station_code_snapshot text,
  kitchen_status text not null default 'pending'
    check (kitchen_status in ('pending', 'preparing', 'ready', 'served', 'voided')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fb_orders_tenant_status_created
  on hotel.fb_orders (tenant_id, status, created_at desc);

create index if not exists idx_fb_order_items_order
  on hotel.fb_order_items (order_id, kitchen_status);

create index if not exists idx_fb_menu_items_outlet
  on hotel.fb_menu_items (tenant_id, outlet_id, is_available);

create index if not exists idx_fb_tables_outlet
  on hotel.fb_tables (tenant_id, outlet_id, status);

-- RLS
alter table hotel.fb_outlets enable row level security;
alter table hotel.fb_stations enable row level security;
alter table hotel.fb_menu_categories enable row level security;
alter table hotel.fb_menu_items enable row level security;
alter table hotel.fb_tables enable row level security;
alter table hotel.fb_orders enable row level security;
alter table hotel.fb_order_items enable row level security;

alter table hotel.fb_outlets force row level security;
alter table hotel.fb_stations force row level security;
alter table hotel.fb_menu_categories force row level security;
alter table hotel.fb_menu_items force row level security;
alter table hotel.fb_tables force row level security;
alter table hotel.fb_orders force row level security;
alter table hotel.fb_order_items force row level security;

-- Service role bypass (server-side API)
do $$
declare
  t text;
begin
  foreach t in array array[
    'fb_outlets', 'fb_stations', 'fb_menu_categories', 'fb_menu_items',
    'fb_tables', 'fb_orders', 'fb_order_items'
  ]
  loop
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
