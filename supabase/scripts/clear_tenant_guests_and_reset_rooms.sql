-- =============================================================================
-- Clear guest / customer / stay data for ONE tenant + reset room *state*
--
-- DOES NOT change:
--   - public.tenants (display name, pricing, floor plan JSON, room counts, etc.)
--   - hotel.room_units rows (room_code, floor, room_type_code stay the same)
--   - hotel.room_connecting_links, hotel.room_unit_assets
--   - hotel.memberships, auth profiles
--
-- DOES update on room_units (operational only):
--   - status -> 'vacant_clean', notes -> null
--
-- Run in Supabase SQL Editor or psql as postgres / service_role.
--
-- HOW TO GET TENANT ID
--   Supabase → SQL → run:
--     select id, subdomain, name, display_name
--     from public.tenants
--     where product = 'hotel';
--   Use column `id` if you paste a uuid manually.
--
-- This script resolves the tenant by the same string as the HMS URL `/hms/[segment]/…`
-- (matches `subdomain` OR `name`, same as getHotelTenantBySlug in the app).
-- =============================================================================

begin;

do $$
declare
  v_slug text := 'YOUR-HMS-SEGMENT';  -- <<< REPLACE: same as /hms/<this>/... (subdomain or name)
  v_tid uuid;
begin
  select t.id
  into v_tid
  from public.tenants t
  where t.product = 'hotel'
    and (t.subdomain = v_slug or t.name = v_slug)
  limit 1;
  if v_tid is null then
    raise exception 'No hotel tenant for segment % (subdomain or name). Run: select id, subdomain, name from public.tenants where product = ''hotel'';', v_slug;
  end if;

  -- Stays: cascades reservation_guests, folio_transactions, guest_requests
  -- (+ guest_request_notes / guest_request_events where ON DELETE CASCADE).
  delete from hotel.reservations where tenant_id = v_tid;

  delete from hotel.guests where tenant_id = v_tid;

  delete from hotel.group_bookings where tenant_id = v_tid;

  delete from hotel.housekeeping_tasks where tenant_id = v_tid;

  delete from hotel.room_blocks where tenant_id = v_tid;
  delete from hotel.room_key_events where tenant_id = v_tid;
  delete from hotel.room_incidents where tenant_id = v_tid;
  delete from hotel.room_unit_notes where tenant_id = v_tid;

  delete from hotel.notifications where tenant_id = v_tid;

  -- Keep every room row; only reset housekeeping / occupancy *state*.
  update hotel.room_units
  set status = 'vacant_clean', notes = null
  where tenant_id = v_tid;

  update hotel.room_unit_flags
  set
    dnd = false,
    security_hold = false,
    staff_restricted = false,
    updated_at = now()
  where tenant_id = v_tid;

  raise notice 'OK tenant % — reservations & guests removed; rooms set vacant_clean (inventory unchanged).', v_tid;
end $$;

commit;
