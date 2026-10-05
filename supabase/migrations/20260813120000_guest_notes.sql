-- Agent notes on a guest, persisting across all their stays — distinct from the existing
-- per-reservation guest_remarks/vip_notes text fields, which reset with each new booking.
-- VIP and Do Not Walk flags don't need a new column: hotel.guests.tags (added in
-- 20260601120000_frontdesk_ops.sql) already carries "vip" and is read by guestHasVipTag() —
-- "do_not_walk" is added to that same tag vocabulary in application code, no schema change.

create table if not exists hotel.guest_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  guest_id uuid not null references hotel.guests(id) on delete cascade,
  note text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_guest_notes_tenant_guest on hotel.guest_notes (tenant_id, guest_id, created_at desc);

comment on table hotel.guest_notes is
  'Free-text agent notes tied to a guest, visible on every future stay — not scoped to a single reservation.';

alter table hotel.guest_notes enable row level security;
alter table hotel.guest_notes force row level security;

drop policy if exists guest_notes_service_role_all on hotel.guest_notes;
create policy guest_notes_service_role_all
on hotel.guest_notes
for all to public
using (true)
with check (true);

drop policy if exists guest_notes_select_member on hotel.guest_notes;
create policy guest_notes_select_member
on hotel.guest_notes
for select to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = guest_notes.tenant_id and m.user_id = auth.uid()));

drop policy if exists guest_notes_insert_member on hotel.guest_notes;
create policy guest_notes_insert_member
on hotel.guest_notes
for insert to authenticated
with check (exists (select 1 from hotel.memberships m where m.tenant_id = guest_notes.tenant_id and m.user_id = auth.uid()));
