create or replace function public.is_tenant_product(input_tenant_id uuid, input_product text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenants t
    where t.id = input_tenant_id
      and t.product = input_product
  );
$$;

create or replace function hotel.is_hotel_tenant(input_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_tenant_product(input_tenant_id, 'hotel');
$$;

create or replace function hotel.is_hotel_member(input_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from hotel.memberships m
    where m.tenant_id = input_tenant_id
      and m.user_id = auth.uid()
  )
  and hotel.is_hotel_tenant(input_tenant_id);
$$;

alter table hotel.memberships force row level security;
alter table hotel.registration_sessions force row level security;
alter table hotel.registration_otps force row level security;
alter table hotel.profiles force row level security;

drop policy if exists memberships_select_self on hotel.memberships;
create policy memberships_select_self
on hotel.memberships
for select
to authenticated
using (user_id = auth.uid() and hotel.is_hotel_tenant(tenant_id));

drop policy if exists registration_sessions_select_member on hotel.registration_sessions;
create policy registration_sessions_select_member
on hotel.registration_sessions
for select
to authenticated
using (hotel.is_hotel_member(tenant_id));

drop policy if exists profiles_select_member on hotel.profiles;
create policy profiles_select_member
on hotel.profiles
for select
to authenticated
using (hotel.is_hotel_member(tenant_id));
