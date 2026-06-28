-- Arrivals wave B: guest requests, group bookings

create table if not exists hotel.group_bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  group_name text not null,
  coordinator_name text,
  coordinator_phone text,
  room_count int not null default 1 check (room_count >= 1),
  shared_billing boolean not null default false,
  bill_to_account text,
  arrival_at timestamptz,
  departure_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_group_bookings_tenant on hotel.group_bookings (tenant_id, arrival_at);

alter table hotel.reservations
  add column if not exists group_booking_id uuid references hotel.group_bookings(id) on delete set null;

create index if not exists idx_reservations_group on hotel.reservations (group_booking_id) where group_booking_id is not null;

create table if not exists hotel.guest_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reservation_id uuid not null references hotel.reservations(id) on delete cascade,
  request_type text not null,
  department text not null default 'front_desk',
  status text not null default 'open' check (status in ('open', 'in_progress', 'fulfilled', 'cancelled')),
  notes text,
  fulfilled_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_guest_requests_reservation on hotel.guest_requests (reservation_id, status);

alter table hotel.group_bookings enable row level security;
alter table hotel.guest_requests enable row level security;
alter table hotel.group_bookings force row level security;
alter table hotel.guest_requests force row level security;

drop policy if exists group_bookings_service_role_all on hotel.group_bookings;
create policy group_bookings_service_role_all on hotel.group_bookings for all to public
using (true) with check (true);

drop policy if exists group_bookings_select_member on hotel.group_bookings;
create policy group_bookings_select_member on hotel.group_bookings for select to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = group_bookings.tenant_id and m.user_id = auth.uid()));

drop policy if exists guest_requests_service_role_all on hotel.guest_requests;
create policy guest_requests_service_role_all on hotel.guest_requests for all to public
using (true) with check (true);

drop policy if exists guest_requests_select_member on hotel.guest_requests;
create policy guest_requests_select_member on hotel.guest_requests for select to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = guest_requests.tenant_id and m.user_id = auth.uid()));
