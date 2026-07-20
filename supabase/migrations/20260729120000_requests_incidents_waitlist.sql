-- Front desk "Requests & incidents": complaints/incidents case tracking (distinct from
-- guest_requests, which is service-fulfillment work, and from room_incidents, which is
-- room-asset maintenance) plus a guest waitlist for when nothing is available.

create table if not exists hotel.guest_incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_type text not null check (case_type in ('complaint', 'incident')),
  reservation_id uuid references hotel.reservations(id) on delete set null,
  guest_id uuid references hotel.guests(id) on delete set null,
  room_unit_id uuid references hotel.room_units(id) on delete set null,
  category text not null,
  severity text not null default 'normal' check (severity in ('low', 'normal', 'high', 'critical')),
  status text not null default 'open' check (
    status in ('open', 'in_progress', 'escalated', 'resolved', 'closed')
  ),
  description text not null,
  resolution_notes text,
  compensation_offered text,
  reported_by uuid,
  escalated_to_user_id uuid,
  escalated_at timestamptz,
  guest_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table hotel.guest_incidents is
  'Guest-relationship case tracking: complaints and general incidents (not tied to a specific room asset). Distinct from hotel.guest_requests (service fulfillment) and hotel.room_incidents (room maintenance/defects).';

create index if not exists idx_guest_incidents_tenant on hotel.guest_incidents (tenant_id);
create index if not exists idx_guest_incidents_status on hotel.guest_incidents (tenant_id, status);
create index if not exists idx_guest_incidents_reservation on hotel.guest_incidents (reservation_id);

create table if not exists hotel.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  guest_id uuid references hotel.guests(id) on delete set null,
  guest_name text not null,
  phone text,
  email text,
  desired_room_type_code text,
  desired_arrival_date date not null,
  desired_departure_date date not null,
  party_size int not null default 1 check (party_size >= 1),
  status text not null default 'waiting' check (
    status in ('waiting', 'notified', 'converted', 'expired', 'cancelled')
  ),
  notes text,
  notified_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table hotel.waitlist_entries is
  'Guests waiting for a room type/date combination that was unavailable at time of enquiry. v1 matching against openings (cancellations/no-shows) is manual, not automatic.';

create index if not exists idx_waitlist_tenant on hotel.waitlist_entries (tenant_id);
create index if not exists idx_waitlist_status on hotel.waitlist_entries (tenant_id, status);

do $$
declare
  t text;
begin
  foreach t in array array['guest_incidents', 'waitlist_entries']
  loop
    execute format('alter table hotel.%I enable row level security', t);
    execute format('alter table hotel.%I force row level security', t);

    execute format('drop policy if exists %I_service_role_all on hotel.%I', t, t);
    execute format(
      'create policy %I_service_role_all on hotel.%I for all to public using (true) with check (true)',
      t, t
    );
    execute format('drop policy if exists %I_select_member on hotel.%I', t, t);
    execute format(
      'create policy %I_select_member on hotel.%I for select to authenticated
       using (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
    execute format('drop policy if exists %I_insert_member on hotel.%I', t, t);
    execute format(
      'create policy %I_insert_member on hotel.%I for insert to authenticated
       with check (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
    execute format('drop policy if exists %I_update_member on hotel.%I', t, t);
    execute format(
      'create policy %I_update_member on hotel.%I for update to authenticated
       using (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
    execute format('drop policy if exists %I_delete_member on hotel.%I', t, t);
    execute format(
      'create policy %I_delete_member on hotel.%I for delete to authenticated
       using (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
  end loop;
end $$;
