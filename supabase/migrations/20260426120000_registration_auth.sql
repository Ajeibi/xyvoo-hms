create schema if not exists hotel;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'hotel'
      and t.typname = 'registration_step'
  ) then
    create type hotel.registration_step as enum (
      'hotel_details',
      'otp_verified',
      'account_saved',
      'trial_started',
      'completed'
    );
  end if;
end $$;

create table if not exists hotel.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists hotel.registration_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade unique,
  contact_email text not null,
  verified_at timestamptz,
  step hotel.registration_step not null default 'hotel_details',
  attempts int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hotel.registration_otps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_registration_otps_tenant_email_created
  on hotel.registration_otps (tenant_id, email, created_at desc);

create index if not exists idx_registration_otps_active
  on hotel.registration_otps (tenant_id, expires_at)
  where consumed_at is null;

create index if not exists idx_registration_sessions_email
  on hotel.registration_sessions (contact_email);

create table if not exists hotel.profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade unique,
  contact_name text,
  contact_phone text,
  country text,
  city text,
  address text,
  room_count int,
  hotel_type text,
  whatsapp_opt_in boolean not null default false,
  trial_starts_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function hotel.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_registration_sessions_updated_at on hotel.registration_sessions;
create trigger trg_registration_sessions_updated_at
before update on hotel.registration_sessions
for each row execute function hotel.touch_updated_at();

drop trigger if exists trg_profiles_updated_at on hotel.profiles;
create trigger trg_profiles_updated_at
before update on hotel.profiles
for each row execute function hotel.touch_updated_at();

alter table hotel.memberships enable row level security;
alter table hotel.registration_sessions enable row level security;
alter table hotel.registration_otps enable row level security;
alter table hotel.profiles enable row level security;

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
  );
$$;

drop policy if exists memberships_service_role_all on hotel.memberships;
create policy memberships_service_role_all
on hotel.memberships
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists memberships_select_self on hotel.memberships;
create policy memberships_select_self
on hotel.memberships
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists registration_sessions_service_role_all on hotel.registration_sessions;
create policy registration_sessions_service_role_all
on hotel.registration_sessions
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists registration_sessions_select_member on hotel.registration_sessions;
create policy registration_sessions_select_member
on hotel.registration_sessions
for select
to authenticated
using (hotel.is_hotel_member(tenant_id));

drop policy if exists registration_otps_service_role_all on hotel.registration_otps;
create policy registration_otps_service_role_all
on hotel.registration_otps
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists profiles_service_role_all on hotel.profiles;
create policy profiles_service_role_all
on hotel.profiles
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists profiles_select_member on hotel.profiles;
create policy profiles_select_member
on hotel.profiles
for select
to authenticated
using (hotel.is_hotel_member(tenant_id));
