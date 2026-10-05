-- Storefront orders: ported from the old xyvoo `orders`/`order_items` tables
-- (the one fully real, tenant-scoped read path in that app). Order *creation*
-- (cart/checkout/payment capture) is intentionally out of scope for this
-- pass -- these tables exist so seeded/manually-entered orders can drive the
-- dashboard's Orders tab and Overview metrics.

create table if not exists store.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  status text not null default 'Pending'
    check (status in ('Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled')),
  payment_method text not null default 'Card',
  total_amount numeric(12,2) not null default 0,
  profit numeric(12,2) not null default 0,
  platform_fee numeric(12,2) not null default 0,
  platform_fee_percentage numeric(5,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_store_orders_tenant on store.orders (tenant_id);
create index if not exists idx_store_orders_tenant_created on store.orders (tenant_id, created_at desc);

drop trigger if exists trg_store_orders_updated_at on store.orders;
create trigger trg_store_orders_updated_at
before update on store.orders
for each row execute function store.touch_updated_at();

create table if not exists store.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references store.orders(id) on delete cascade,
  product_id uuid references store.products(id) on delete set null,
  product_name text not null,
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2) not null default 0,
  cost_price numeric(10,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_store_order_items_order on store.order_items (order_id);
create index if not exists idx_store_order_items_product on store.order_items (product_id);

alter table store.orders enable row level security;
alter table store.orders force row level security;
alter table store.order_items enable row level security;
alter table store.order_items force row level security;

drop policy if exists store_orders_service_role_all on store.orders;
create policy store_orders_service_role_all
on store.orders
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists store_orders_select_member on store.orders;
create policy store_orders_select_member
on store.orders
for select
to authenticated
using (store.is_store_member(tenant_id));

drop policy if exists store_order_items_service_role_all on store.order_items;
create policy store_order_items_service_role_all
on store.order_items
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists store_order_items_select_member on store.order_items;
create policy store_order_items_select_member
on store.order_items
for select
to authenticated
using (
  exists (
    select 1 from store.orders o
    where o.id = order_id
      and store.is_store_member(o.tenant_id)
  )
);
