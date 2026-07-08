-- =============================================================================
-- ZERO operational data for ONE hotel tenant (dev / sandbox reset)
--
-- Removes ALL of:
--   guests, reservations, folio, F&B (restaurant + kitchen), payment intents,
--   housekeeping, notifications, audit/shift notes, guest requests, etc.
--
-- Keeps:
--   public.tenants (name, pricing, floor plan JSON)
--   hotel.room_units rows (codes/floors/types) — status reset to vacant_clean
--   hotel.memberships, hotel.profiles, auth users
--
-- After this, dashboard + front desk should show 0 guests, 0 reservations,
-- empty F&B/kitchen, all keys vacant clean.
--
-- Optional reload: npm run seed:demo -- firefly
--
-- HOW TO RUN
--   1. Replace YOUR-HMS-SEGMENT below with your slug (e.g. firefly)
--   2. Supabase SQL Editor → paste → Run
--   OR: psql $DATABASE_URL -f supabase/scripts/clear_tenant_operational_zero.sql
-- =============================================================================

begin;

do $$
declare
  v_slug text := 'firefly';  -- <<< CHANGE if needed (same as /hms/<slug>/...)
  v_tid uuid;
begin
  select t.id
  into v_tid
  from public.tenants t
  where t.product = 'hotel'
    and (t.subdomain = v_slug or t.name = v_slug)
  limit 1;

  if v_tid is null then
    raise exception 'No hotel tenant for segment %. Run: select id, subdomain, name from public.tenants where product = ''hotel'';', v_slug;
  end if;

  -- F&B / kitchen (children before parents)
  delete from hotel.fb_order_items where tenant_id = v_tid;
  delete from hotel.fb_orders where tenant_id = v_tid;
  delete from hotel.fb_menu_items where tenant_id = v_tid;
  delete from hotel.fb_tables where tenant_id = v_tid;
  delete from hotel.fb_menu_categories where tenant_id = v_tid;
  delete from hotel.fb_stations where tenant_id = v_tid;
  delete from hotel.fb_outlets where tenant_id = v_tid;
  delete from hotel.tenant_fb_settings where tenant_id = v_tid;

  -- Payments & folio
  delete from hotel.payment_intents where tenant_id = v_tid;
  delete from hotel.folio_transactions where tenant_id = v_tid;

  -- Guest services (if migrated)
  delete from hotel.guest_request_events
  where request_id in (select id from hotel.guest_requests where tenant_id = v_tid);
  delete from hotel.guest_request_notes
  where request_id in (select id from hotel.guest_requests where tenant_id = v_tid);
  delete from hotel.guest_requests where tenant_id = v_tid;

  -- Stays & guests
  delete from hotel.reservation_guests
  where reservation_id in (select id from hotel.reservations where tenant_id = v_tid);
  delete from hotel.reservations where tenant_id = v_tid;
  delete from hotel.guests where tenant_id = v_tid;
  delete from hotel.group_bookings where tenant_id = v_tid;

  -- Cash float (if present)
  delete from hotel.cash_float_sessions where tenant_id = v_tid;

  -- Rooms ops & front desk feed
  delete from hotel.housekeeping_tasks where tenant_id = v_tid;
  delete from hotel.room_blocks where tenant_id = v_tid;
  delete from hotel.room_key_events where tenant_id = v_tid;
  delete from hotel.room_incidents where tenant_id = v_tid;
  delete from hotel.room_unit_notes where tenant_id = v_tid;
  delete from hotel.notifications where tenant_id = v_tid;
  delete from hotel.audit_logs where tenant_id = v_tid;
  delete from hotel.shift_notes where tenant_id = v_tid;

  -- Reset key state (inventory rows stay)
  update hotel.room_unit_flags
  set dnd = false, security_hold = false, staff_restricted = false, updated_at = now()
  where tenant_id = v_tid;

  update hotel.room_units
  set status = 'vacant_clean', notes = null
  where tenant_id = v_tid;

  raise notice 'Tenant % (%) — operational data cleared; all keys vacant_clean.', v_slug, v_tid;
end $$;

commit;
-- Verify (expect zeros):
-- select
--   (select count(*) from hotel.reservations where tenant_id = (select id from public.tenants where subdomain = 'firefly' limit 1)) as reservations,
--   (select count(*) from hotel.guests where tenant_id = (select id from public.tenants where subdomain = 'firefly' limit 1)) as guests,
--   (select count(*) from hotel.fb_orders where tenant_id = (select id from public.tenants where subdomain = 'firefly' limit 1)) as fb_orders,
--   (select count(*) from hotel.room_units where tenant_id = (select id from public.tenants where subdomain = 'firefly' limit 1) and status <> 'vacant_clean') as non_vacant_rooms;

