-- Storefront product: schema, tenant membership, and isolation helpers.
-- Mirrors the `hotel` schema's registration_auth + product_isolation_guards
-- pattern so the two products (hotel, store) share `public.tenants` but keep
-- fully isolated data and RLS.

create schema if not exists store;

create table if not exists store.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create or replace function store.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function store.is_store_tenant(input_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_tenant_product(input_tenant_id, 'store');
$$;

create or replace function store.is_store_member(input_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from store.memberships m
    where m.tenant_id = input_tenant_id
      and m.user_id = auth.uid()
  )
  and store.is_store_tenant(input_tenant_id);
$$;

alter table store.memberships enable row level security;
alter table store.memberships force row level security;

drop policy if exists memberships_service_role_all on store.memberships;
create policy memberships_service_role_all
on store.memberships
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists memberships_select_self on store.memberships;
create policy memberships_select_self
on store.memberships
for select
to authenticated
using (user_id = auth.uid() and store.is_store_tenant(tenant_id));
