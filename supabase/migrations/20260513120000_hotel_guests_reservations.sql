-- Guest profiles, physical rooms, reservations, and guest-stay links (Firefly / XYVOO HMS)

create table if not exists hotel.room_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_code text not null,
  floor int not null,
  room_type_code text not null,
  status text not null check (
    status in ('occupied', 'vacant_clean', 'dirty', 'inspected', 'maintenance', 'out_of_order')
  ),
  notes text,
  created_at timestamptz not null default now(),
  unique (tenant_id, room_code)
);

create table if not exists hotel.guests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text,
  first_name text not null,
  last_name text not null,
  nationality char(2) not null,
  id_type text not null check (id_type in ('passport', 'national_id', 'drivers_license')),
  id_number text not null,
  id_expiry_date date not null,
  date_of_birth date not null,
  gender text check (gender in ('female', 'male', 'other', 'unspecified')),
  id_document_storage_path text,
  phone text not null,
  email text not null,
  whatsapp text,
  preferred_channel text not null check (
    preferred_channel in ('email', 'phone', 'whatsapp', 'sms')
  ),
  created_at timestamptz not null default now()
);

create table if not exists hotel.reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  confirmation_code text not null,
  status text not null check (
    status in ('confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')
  ),
  arrival_at timestamptz not null,
  departure_at timestamptz not null,
  nights int not null,
  adults int not null check (adults >= 1),
  children_json jsonb not null default '[]'::jsonb,
  purpose_of_visit text not null check (purpose_of_visit in ('leisure', 'business', 'transit')),
  room_type_code text not null,
  room_unit_id uuid references hotel.room_units(id) on delete set null,
  room_preferences_text text,
  rate_type text not null check (
    rate_type in ('rack', 'corporate', 'walk_in_bar', 'promotional')
  ),
  season_code text,
  rate_per_night numeric(12, 2) not null,
  total_room_charges numeric(14, 2) not null,
  rate_overridden boolean not null default false,
  rate_override_reason text,
  show_rate_on_registration_card boolean not null default true,
  vat_applicable boolean not null default true,
  tax_exempt boolean not null default false,
  tax_exemption_reason text,
  tax_exemption_doc_ref text,
  settlement_method text not null check (
    settlement_method in ('cash', 'card', 'split', 'direct_bill')
  ),
  preauth_amount numeric(14, 2),
  bill_to_account text,
  po_number text,
  folio_split_notes text,
  min_payment_per_day numeric(12, 2),
  booking_channel text,
  market_segment text not null check (
    market_segment in ('transient', 'corporate', 'group', 'government', 'wholesale')
  ),
  source text not null check (
    source in ('walk_in', 'phone', 'referral', 'ota', 'website', 'travel_agent')
  ),
  travel_agent_name text,
  commission_plan text,
  commission_value numeric(12, 2),
  guest_remarks text,
  room_setup_notes text,
  dietary_notes text,
  accessibility_notes text,
  vip_flag boolean not null default false,
  vip_notes text,
  special_occasion text,
  immigration_registration_required boolean not null default false,
  voucher_number text,
  registration_card_signed boolean not null default false,
  generate_bill boolean not null default true,
  folio_number text not null,
  registration_number text not null,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  checked_in_by_staff_id uuid,
  digital_key_issued boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, confirmation_code),
  unique (tenant_id, folio_number),
  unique (tenant_id, registration_number)
);

create table if not exists hotel.reservation_guests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references hotel.reservations(id) on delete cascade,
  guest_id uuid not null references hotel.guests(id) on delete cascade,
  is_primary boolean not null default false,
  relationship text,
  unique (reservation_id, guest_id)
);

create index if not exists idx_room_units_tenant on hotel.room_units (tenant_id);
create index if not exists idx_room_units_status on hotel.room_units (tenant_id, status);
create index if not exists idx_guests_tenant on hotel.guests (tenant_id);
create index if not exists idx_guests_name on hotel.guests (tenant_id, last_name, first_name);
create index if not exists idx_reservations_tenant on hotel.reservations (tenant_id);
create index if not exists idx_reservations_status on hotel.reservations (tenant_id, status);
create index if not exists idx_reservations_arrival on hotel.reservations (tenant_id, arrival_at);
create index if not exists idx_reservation_guests_res on hotel.reservation_guests (reservation_id);
create index if not exists idx_reservation_guests_guest on hotel.reservation_guests (guest_id);

alter table hotel.room_units enable row level security;
alter table hotel.guests enable row level security;
alter table hotel.reservations enable row level security;
alter table hotel.reservation_guests enable row level security;

alter table hotel.room_units force row level security;
alter table hotel.guests force row level security;
alter table hotel.reservations force row level security;
alter table hotel.reservation_guests force row level security;

-- Service role (backend / seed)
drop policy if exists room_units_service_role_all on hotel.room_units;
create policy room_units_service_role_all
on hotel.room_units for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists guests_service_role_all on hotel.guests;
create policy guests_service_role_all
on hotel.guests for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists reservations_service_role_all on hotel.reservations;
create policy reservations_service_role_all
on hotel.reservations for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists reservation_guests_service_role_all on hotel.reservation_guests;
create policy reservation_guests_service_role_all
on hotel.reservation_guests for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Authenticated hotel members: read-only for now
drop policy if exists room_units_select_member on hotel.room_units;
create policy room_units_select_member
on hotel.room_units for select to authenticated
using (hotel.is_hotel_member(tenant_id));

drop policy if exists guests_select_member on hotel.guests;
create policy guests_select_member
on hotel.guests for select to authenticated
using (hotel.is_hotel_member(tenant_id));

drop policy if exists reservations_select_member on hotel.reservations;
create policy reservations_select_member
on hotel.reservations for select to authenticated
using (hotel.is_hotel_member(tenant_id));

drop policy if exists reservation_guests_select_member on hotel.reservation_guests;
create policy reservation_guests_select_member
on hotel.reservation_guests for select to authenticated
using (
  exists (
    select 1 from hotel.reservations r
    where r.id = reservation_id and hotel.is_hotel_member(r.tenant_id)
  )
);
