-- Extends store.products/product_variants with the full field set the
-- merchant dashboard needs (content, pricing/profit, inventory, shipping,
-- returns, SEO, merchandising, publishing, traceability, computed stats),
-- and adds satellite tables for bundles, multi-currency pricing, cross-sells,
-- reviews, compliance documents, translations, custom filter attributes, and
-- a product change log.

-- ---------------------------------------------------------------------------
-- store.products: new columns
-- ---------------------------------------------------------------------------

alter table store.products
  add column if not exists short_description text,
  add column if not exists video_urls text[] not null default '{}',
  add column if not exists image_alt_texts text[] not null default '{}',
  add column if not exists product_type text not null default 'physical'
    check (product_type in ('physical', 'digital', 'service', 'subscription')),
  add column if not exists subcategory text,
  add column if not exists visibility text not null default 'visible'
    check (visibility in ('visible', 'hidden', 'scheduled')),
  add column if not exists condition text not null default 'new'
    check (condition in ('new', 'used', 'refurbished')),
  add column if not exists compare_at_price numeric(10,2),
  add column if not exists taxable boolean not null default true,
  add column if not exists tax_class text,
  add column if not exists minimum_order_qty int not null default 1,
  add column if not exists allow_backorder boolean not null default false,
  add column if not exists supplier_name text,
  add column if not exists warehouse_location text,
  add column if not exists length_cm numeric(10,2),
  add column if not exists width_cm numeric(10,2),
  add column if not exists height_cm numeric(10,2),
  add column if not exists dimensions_unit text not null default 'cm',
  add column if not exists country_of_origin text,
  add column if not exists hs_code text,
  add column if not exists gtin text,
  add column if not exists mpn text,
  add column if not exists returnable boolean not null default true,
  add column if not exists return_window_days int,
  add column if not exists warranty_text text,
  add column if not exists structured_data_type text not null default 'Product',
  add column if not exists featured boolean not null default false,
  add column if not exists new_arrival boolean not null default false,
  add column if not exists best_seller boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists discontinue_at timestamptz,
  add column if not exists preorder boolean not null default false,
  add column if not exists preorder_available_date date,
  add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('draft', 'pending_review', 'approved')),
  add column if not exists serial_tracked boolean not null default false,
  add column if not exists batch_tracked boolean not null default false,
  add column if not exists import_source text,
  add column if not exists import_batch_id uuid,
  add column if not exists view_count int not null default 0,
  add column if not exists wishlist_count int not null default 0,
  add column if not exists rating_average numeric(3,2) not null default 0,
  add column if not exists rating_count int not null default 0;

create index if not exists idx_store_products_tenant_featured on store.products (tenant_id, featured) where featured;
create index if not exists idx_store_products_tenant_visibility on store.products (tenant_id, visibility);

-- ---------------------------------------------------------------------------
-- store.product_variants: new columns
-- ---------------------------------------------------------------------------

alter table store.product_variants
  add column if not exists barcode text,
  add column if not exists weight_kg numeric(10,3);

-- ---------------------------------------------------------------------------
-- Satellite tables
-- ---------------------------------------------------------------------------

create table if not exists store.product_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_product_id uuid not null references store.products(id) on delete cascade,
  component_product_id uuid not null references store.products(id) on delete cascade,
  quantity int not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (bundle_product_id, component_product_id),
  check (bundle_product_id <> component_product_id)
);

create table if not exists store.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references store.products(id) on delete cascade,
  currency text not null,
  price numeric(10,2) not null,
  compare_at_price numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, currency)
);

drop trigger if exists trg_store_product_prices_updated_at on store.product_prices;
create trigger trg_store_product_prices_updated_at
before update on store.product_prices
for each row execute function store.touch_updated_at();

create table if not exists store.product_cross_sells (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references store.products(id) on delete cascade,
  related_product_id uuid not null references store.products(id) on delete cascade,
  relation_type text not null default 'related'
    check (relation_type in ('related', 'cross_sell', 'upsell')),
  created_at timestamptz not null default now(),
  unique (product_id, related_product_id, relation_type),
  check (product_id <> related_product_id)
);

create table if not exists store.product_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references store.products(id) on delete cascade,
  customer_name text not null,
  customer_email text,
  rating int not null check (rating between 1 and 5),
  title text,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_store_product_reviews_product on store.product_reviews (product_id);
create index if not exists idx_store_product_reviews_tenant on store.product_reviews (tenant_id);

create table if not exists store.product_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references store.products(id) on delete cascade,
  label text not null,
  document_type text not null default 'other'
    check (document_type in ('certificate', 'safety_data_sheet', 'manual', 'other')),
  file_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_store_product_documents_product on store.product_documents (product_id);

create table if not exists store.product_translations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references store.products(id) on delete cascade,
  locale text not null,
  name text,
  description text,
  short_description text,
  meta_title text,
  meta_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, locale)
);

drop trigger if exists trg_store_product_translations_updated_at on store.product_translations;
create trigger trg_store_product_translations_updated_at
before update on store.product_translations
for each row execute function store.touch_updated_at();

create table if not exists store.product_attributes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists store.product_attribute_values (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references store.products(id) on delete cascade,
  attribute_id uuid not null references store.product_attributes(id) on delete cascade,
  value text not null,
  created_at timestamptz not null default now(),
  unique (product_id, attribute_id)
);

create index if not exists idx_store_product_attribute_values_attribute on store.product_attribute_values (attribute_id);

create table if not exists store.product_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references store.products(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  changed_fields jsonb not null default '{}'::jsonb,
  changed_at timestamptz not null default now()
);

create index if not exists idx_store_product_audit_log_product on store.product_audit_log (product_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- RLS: same tenant-membership pattern as every other store.* table.
-- Bundle items / cross-sells / attribute values are scoped via their parent
-- product's tenant; attributes and reviews/documents/audit log carry
-- tenant_id directly.
-- ---------------------------------------------------------------------------

alter table store.product_bundle_items enable row level security;
alter table store.product_bundle_items force row level security;
alter table store.product_prices enable row level security;
alter table store.product_prices force row level security;
alter table store.product_cross_sells enable row level security;
alter table store.product_cross_sells force row level security;
alter table store.product_reviews enable row level security;
alter table store.product_reviews force row level security;
alter table store.product_documents enable row level security;
alter table store.product_documents force row level security;
alter table store.product_translations enable row level security;
alter table store.product_translations force row level security;
alter table store.product_attributes enable row level security;
alter table store.product_attributes force row level security;
alter table store.product_attribute_values enable row level security;
alter table store.product_attribute_values force row level security;
alter table store.product_audit_log enable row level security;
alter table store.product_audit_log force row level security;

drop policy if exists store_product_bundle_items_service_role_all on store.product_bundle_items;
create policy store_product_bundle_items_service_role_all on store.product_bundle_items
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_product_bundle_items_select_member on store.product_bundle_items;
create policy store_product_bundle_items_select_member on store.product_bundle_items
for select to authenticated using (
  exists (select 1 from store.products p where p.id = bundle_product_id and store.is_store_member(p.tenant_id))
);

drop policy if exists store_product_prices_service_role_all on store.product_prices;
create policy store_product_prices_service_role_all on store.product_prices
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_product_prices_select_member on store.product_prices;
create policy store_product_prices_select_member on store.product_prices
for select to authenticated using (
  exists (select 1 from store.products p where p.id = product_id and store.is_store_member(p.tenant_id))
);

drop policy if exists store_product_cross_sells_service_role_all on store.product_cross_sells;
create policy store_product_cross_sells_service_role_all on store.product_cross_sells
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_product_cross_sells_select_member on store.product_cross_sells;
create policy store_product_cross_sells_select_member on store.product_cross_sells
for select to authenticated using (
  exists (select 1 from store.products p where p.id = product_id and store.is_store_member(p.tenant_id))
);

drop policy if exists store_product_reviews_service_role_all on store.product_reviews;
create policy store_product_reviews_service_role_all on store.product_reviews
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_product_reviews_select_member on store.product_reviews;
create policy store_product_reviews_select_member on store.product_reviews
for select to authenticated using (store.is_store_member(tenant_id));

drop policy if exists store_product_documents_service_role_all on store.product_documents;
create policy store_product_documents_service_role_all on store.product_documents
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_product_documents_select_member on store.product_documents;
create policy store_product_documents_select_member on store.product_documents
for select to authenticated using (store.is_store_member(tenant_id));

drop policy if exists store_product_translations_service_role_all on store.product_translations;
create policy store_product_translations_service_role_all on store.product_translations
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_product_translations_select_member on store.product_translations;
create policy store_product_translations_select_member on store.product_translations
for select to authenticated using (
  exists (select 1 from store.products p where p.id = product_id and store.is_store_member(p.tenant_id))
);

drop policy if exists store_product_attributes_service_role_all on store.product_attributes;
create policy store_product_attributes_service_role_all on store.product_attributes
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_product_attributes_select_member on store.product_attributes;
create policy store_product_attributes_select_member on store.product_attributes
for select to authenticated using (store.is_store_member(tenant_id));

drop policy if exists store_product_attribute_values_service_role_all on store.product_attribute_values;
create policy store_product_attribute_values_service_role_all on store.product_attribute_values
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_product_attribute_values_select_member on store.product_attribute_values;
create policy store_product_attribute_values_select_member on store.product_attribute_values
for select to authenticated using (
  exists (select 1 from store.products p where p.id = product_id and store.is_store_member(p.tenant_id))
);

drop policy if exists store_product_audit_log_service_role_all on store.product_audit_log;
create policy store_product_audit_log_service_role_all on store.product_audit_log
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_product_audit_log_select_member on store.product_audit_log;
create policy store_product_audit_log_select_member on store.product_audit_log
for select to authenticated using (store.is_store_member(tenant_id));

-- ---------------------------------------------------------------------------
-- Re-grant explicitly: ALTER DEFAULT PRIVILEGES from the earlier grants
-- migration only covers tables created by the same role that ran it. Repeat
-- the direct grant here so these new tables aren't left inaccessible the
-- same way the original store.* tables were before that was diagnosed.
-- ---------------------------------------------------------------------------

grant all on all tables in schema store to anon, authenticated, service_role;
grant all on all sequences in schema store to anon, authenticated, service_role;
