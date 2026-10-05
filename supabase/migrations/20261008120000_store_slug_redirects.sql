-- Old store addresses. When an owner changes their store's web address, the
-- old one keeps working for 90 days (it redirects to the new address, so
-- shared links and search results don't break) and nobody else can claim it
-- during that time.

create table if not exists store.slug_redirects (
  old_slug text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);

create index if not exists idx_store_slug_redirects_tenant on store.slug_redirects (tenant_id);

alter table store.slug_redirects enable row level security;
alter table store.slug_redirects force row level security;

drop policy if exists store_slug_redirects_service_role_all on store.slug_redirects;
create policy store_slug_redirects_service_role_all on store.slug_redirects
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_slug_redirects_select_member on store.slug_redirects;
create policy store_slug_redirects_select_member on store.slug_redirects
for select to authenticated using (store.is_store_member(tenant_id));
