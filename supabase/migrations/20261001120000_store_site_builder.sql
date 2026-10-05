-- Storefront website builder: the tenant -> template link, draft/published
-- site settings with version history, wizard progress, business profile,
-- collections, CMS pages and delivery zones.
--
-- sites.draft / sites.published hold only the merchant's overrides (theme,
-- content, homepage sections, navigation, brand, SEO). The app merges them
-- over the chosen template's defaults (src/lib/store/site), so an empty
-- object always renders a complete site. Shape is validated in the app with
-- Zod rather than here, so adding a template or a content slot needs no
-- migration.

-- ---------------------------------------------------------------------------
-- store.sites
-- ---------------------------------------------------------------------------

create table if not exists store.sites (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  template_slug text not null default 'linden-home',
  draft jsonb not null default '{}'::jsonb,
  published jsonb,
  status text not null default 'draft' check (status in ('draft', 'live', 'paused')),
  published_version int not null default 0,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_store_sites_updated_at on store.sites;
create trigger trg_store_sites_updated_at
before update on store.sites
for each row execute function store.touch_updated_at();

create table if not exists store.site_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  version int not null,
  template_slug text not null,
  snapshot jsonb not null,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, version)
);

-- ---------------------------------------------------------------------------
-- store.onboarding: wizard progress, resumable across sessions
-- ---------------------------------------------------------------------------

create table if not exists store.onboarding (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  current_step text not null default 'basics'
    check (current_step in ('basics', 'template', 'brand', 'essentials', 'plan', 'preview')),
  completed_steps text[] not null default '{}',
  -- Choices carried in from marketing links (?plan=, ?template=).
  data jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_store_onboarding_updated_at on store.onboarding;
create trigger trg_store_onboarding_updated_at
before update on store.onboarding
for each row execute function store.touch_updated_at();

-- ---------------------------------------------------------------------------
-- store.business_profile: contact details shown on the site and receipts
-- ---------------------------------------------------------------------------

create table if not exists store.business_profile (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  category text,
  country_code text not null default 'NG',
  currency_code text not null default 'NGN',
  business_email text,
  phone text,
  whatsapp text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postcode text,
  -- {"instagram": url, "facebook": url, "tiktok": url, "x": url}
  socials jsonb not null default '{}'::jsonb,
  -- [{"day": "mon", "opens": "09:00", "closes": "17:00"}] or null when not shown
  opening_hours jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_store_business_profile_updated_at on store.business_profile;
create trigger trg_store_business_profile_updated_at
before update on store.business_profile
for each row execute function store.touch_updated_at();

-- ---------------------------------------------------------------------------
-- store.collections + store.collection_products
-- ---------------------------------------------------------------------------

create table if not exists store.collections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  image_url text,
  image_alt text,
  -- Optional automatic membership, e.g. {"category": "Chairs"}. Null = hand-picked.
  rule jsonb,
  is_visible boolean not null default true,
  sort_order int not null default 0,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index if not exists idx_store_collections_tenant on store.collections (tenant_id, sort_order);

drop trigger if exists trg_store_collections_updated_at on store.collections;
create trigger trg_store_collections_updated_at
before update on store.collections
for each row execute function store.touch_updated_at();

create table if not exists store.collection_products (
  collection_id uuid not null references store.collections(id) on delete cascade,
  product_id uuid not null references store.products(id) on delete cascade,
  position int not null default 0,
  primary key (collection_id, product_id)
);

create index if not exists idx_store_collection_products_product on store.collection_products (product_id);

-- ---------------------------------------------------------------------------
-- store.pages: About, Contact, FAQs, policies and custom pages
-- ---------------------------------------------------------------------------

create table if not exists store.pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null,
  title text not null,
  -- Structured blocks: [{"type": "text" | "image" | "faq" | ..., ...}]
  body jsonb not null default '[]'::jsonb,
  -- Starter pages every store gets; null for custom pages.
  system_key text check (system_key in ('about', 'contact', 'faqs', 'delivery-returns', 'privacy', 'terms')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  show_in_menu boolean not null default false,
  sort_order int not null default 0,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create unique index if not exists idx_store_pages_tenant_system_key
  on store.pages (tenant_id, system_key) where system_key is not null;

drop trigger if exists trg_store_pages_updated_at on store.pages;
create trigger trg_store_pages_updated_at
before update on store.pages
for each row execute function store.touch_updated_at();

-- ---------------------------------------------------------------------------
-- store.delivery_zones
-- ---------------------------------------------------------------------------

create table if not exists store.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  regions text[] not null default '{}',
  fee numeric(12,2) not null default 0 check (fee >= 0),
  free_over numeric(12,2) check (free_over is null or free_over >= 0),
  eta_text text,
  is_pickup boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_store_delivery_zones_tenant on store.delivery_zones (tenant_id, sort_order);

drop trigger if exists trg_store_delivery_zones_updated_at on store.delivery_zones;
create trigger trg_store_delivery_zones_updated_at
before update on store.delivery_zones
for each row execute function store.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: service role writes (all access goes through API routes), members read.
-- ---------------------------------------------------------------------------

alter table store.sites enable row level security;
alter table store.sites force row level security;
alter table store.site_versions enable row level security;
alter table store.site_versions force row level security;
alter table store.onboarding enable row level security;
alter table store.onboarding force row level security;
alter table store.business_profile enable row level security;
alter table store.business_profile force row level security;
alter table store.collections enable row level security;
alter table store.collections force row level security;
alter table store.collection_products enable row level security;
alter table store.collection_products force row level security;
alter table store.pages enable row level security;
alter table store.pages force row level security;
alter table store.delivery_zones enable row level security;
alter table store.delivery_zones force row level security;

drop policy if exists store_sites_service_role_all on store.sites;
create policy store_sites_service_role_all on store.sites
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_sites_select_member on store.sites;
create policy store_sites_select_member on store.sites
for select to authenticated using (store.is_store_member(tenant_id));

drop policy if exists store_site_versions_service_role_all on store.site_versions;
create policy store_site_versions_service_role_all on store.site_versions
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_site_versions_select_member on store.site_versions;
create policy store_site_versions_select_member on store.site_versions
for select to authenticated using (store.is_store_member(tenant_id));

drop policy if exists store_onboarding_service_role_all on store.onboarding;
create policy store_onboarding_service_role_all on store.onboarding
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_onboarding_select_member on store.onboarding;
create policy store_onboarding_select_member on store.onboarding
for select to authenticated using (store.is_store_member(tenant_id));

drop policy if exists store_business_profile_service_role_all on store.business_profile;
create policy store_business_profile_service_role_all on store.business_profile
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_business_profile_select_member on store.business_profile;
create policy store_business_profile_select_member on store.business_profile
for select to authenticated using (store.is_store_member(tenant_id));

drop policy if exists store_collections_service_role_all on store.collections;
create policy store_collections_service_role_all on store.collections
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_collections_select_member on store.collections;
create policy store_collections_select_member on store.collections
for select to authenticated using (store.is_store_member(tenant_id));

drop policy if exists store_collection_products_service_role_all on store.collection_products;
create policy store_collection_products_service_role_all on store.collection_products
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_collection_products_select_member on store.collection_products;
create policy store_collection_products_select_member on store.collection_products
for select to authenticated using (
  exists (select 1 from store.collections c where c.id = collection_id and store.is_store_member(c.tenant_id))
);

drop policy if exists store_pages_service_role_all on store.pages;
create policy store_pages_service_role_all on store.pages
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_pages_select_member on store.pages;
create policy store_pages_select_member on store.pages
for select to authenticated using (store.is_store_member(tenant_id));

drop policy if exists store_delivery_zones_service_role_all on store.delivery_zones;
create policy store_delivery_zones_service_role_all on store.delivery_zones
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_delivery_zones_select_member on store.delivery_zones;
create policy store_delivery_zones_select_member on store.delivery_zones
for select to authenticated using (store.is_store_member(tenant_id));

-- ---------------------------------------------------------------------------
-- Backfill existing stores. They already trade at /shop/<slug>, so they are
-- marked live (published = '{}' renders the template defaults) and skip the
-- wizard.
-- ---------------------------------------------------------------------------

insert into store.sites (tenant_id, published, status, published_version, published_at)
select t.id, '{}'::jsonb, 'live', 1, now()
from public.tenants t
where t.product = 'store'
on conflict (tenant_id) do nothing;

insert into store.onboarding (tenant_id, current_step, completed_steps, completed_at)
select t.id, 'preview', array['basics', 'template', 'brand', 'essentials', 'plan', 'preview'], now()
from public.tenants t
where t.product = 'store'
on conflict (tenant_id) do nothing;

insert into store.business_profile (tenant_id)
select t.id
from public.tenants t
where t.product = 'store'
on conflict (tenant_id) do nothing;
