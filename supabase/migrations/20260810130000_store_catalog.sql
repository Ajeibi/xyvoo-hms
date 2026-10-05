-- Storefront product catalog: products + variants.
-- Field set is deliberately the subset of the old `xyvoo` products table that
-- was actually read/written by its API routes (see api/products/route.ts),
-- not the full incrementally-added attribute set, most of which was never
-- wired to any UI.

create table if not exists store.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null default 0,
  cost_price numeric(10,2),
  currency text,
  sku text,
  barcode text,
  category text,
  brand text,
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  stock int not null default 0,
  reorder_level int not null default 10,
  unit text not null default 'piece',
  weight_kg numeric(10,3),
  image_url text,
  image_urls text[] not null default '{}',
  slug text,
  meta_title text,
  meta_description text,
  product_options jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_store_products_tenant on store.products (tenant_id);
create index if not exists idx_store_products_tenant_category on store.products (tenant_id, category);
create index if not exists idx_store_products_tenant_status on store.products (tenant_id, status);
create unique index if not exists idx_store_products_tenant_slug
  on store.products (tenant_id, slug)
  where slug is not null;

drop trigger if exists trg_store_products_updated_at on store.products;
create trigger trg_store_products_updated_at
before update on store.products
for each row execute function store.touch_updated_at();

create table if not exists store.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references store.products(id) on delete cascade,
  options jsonb not null default '{}'::jsonb,
  sku text,
  price_override numeric(10,2),
  stock int not null default 0,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, options)
);

create index if not exists idx_store_product_variants_product on store.product_variants (product_id);

drop trigger if exists trg_store_product_variants_updated_at on store.product_variants;
create trigger trg_store_product_variants_updated_at
before update on store.product_variants
for each row execute function store.touch_updated_at();

alter table store.products enable row level security;
alter table store.products force row level security;
alter table store.product_variants enable row level security;
alter table store.product_variants force row level security;

drop policy if exists store_products_service_role_all on store.products;
create policy store_products_service_role_all
on store.products
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists store_products_select_member on store.products;
create policy store_products_select_member
on store.products
for select
to authenticated
using (store.is_store_member(tenant_id));

drop policy if exists store_product_variants_service_role_all on store.product_variants;
create policy store_product_variants_service_role_all
on store.product_variants
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists store_product_variants_select_member on store.product_variants;
create policy store_product_variants_select_member
on store.product_variants
for select
to authenticated
using (
  exists (
    select 1 from store.products p
    where p.id = product_id
      and store.is_store_member(p.tenant_id)
  )
);
